// What the Cloud Functions do, without the Functions wrappers, so it can be
// tested against the Firestore emulator with a fake sender.

import { logger } from 'firebase-functions';
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import {
  dueNotifications,
  manilaTime,
  parseSettings,
  type LastSent,
  type NotificationKind,
} from '../../src/core/notifications';
import { productFromData } from '../../src/core/product';

export type PushMessage = {
  /** Also the notification tag. */
  kind: NotificationKind | 'test';
  title: string;
  body: string;
  /** App screen to open when the notification is tapped. */
  route: string;
};

/**
 * Sends one push to some device tokens. Returns tokens FCM no longer knows
 * and how many devices it was delivered to.
 */
export type Sender = (
  tokens: string[],
  message: PushMessage,
) => Promise<{ staleTokens: string[]; delivered: number }>;

/**
 * The hourly job. For each Account whose notification hour is now (Manila),
 * sends whatever dueNotifications says is due. Each message is claimed in a
 * transaction on accounts/{uid}/server/notifications before sending, so a
 * second run in the same hour (Cloud Scheduler can fire twice) sends nothing.
 * If no device got it, the claim is released and `retryDate` set to today,
 * so the next hourly run that day tries again.
 */
export async function runHourly(db: Firestore, now: Date, send: Sender): Promise<void> {
  // listDocuments also returns Account docs that only have subcollections.
  const accounts = await db.collection('accounts').listDocuments();
  for (const account of accounts) {
    try {
      await notifyAccount(db, account, now, send);
    } catch (error) {
      logger.error('Notifications failed for an Account', { uid: account.id, error });
    }
  }
}

async function notifyAccount(db: Firestore, account: DocumentReference, now: Date, send: Sender) {
  const settings = parseSettings((await account.collection('settings').doc('notifications').get()).data());
  const today = manilaTime(now);
  const stateRef = account.collection('server').doc('notifications');
  const stateSnap = await stateRef.get();
  const retry = stateSnap.get('retryDate') === today.date;
  if (today.hour !== settings.notifyHour && !(retry && today.hour > settings.notifyHour)) return;

  const tokens = await deviceTokens(account);
  if (tokens.length === 0) return;

  const productsSnap = await account.collection('products').get();
  const due = dueNotifications({
    now,
    settings,
    products: productsSnap.docs.map((d) => productFromData(d.id, d.data())),
    lastSent: lastSentFrom(stateSnap.data()),
    retry,
  });

  for (const notification of due) {
    const { kind, date, title, body, route } = notification;
    // The claim: the day this kind was last sent before, or undefined if
    // another run already has it.
    const previous = await db.runTransaction(async (tx) => {
      const last = lastSentFrom((await tx.get(stateRef)).data())[kind];
      if (last === date) return undefined;
      tx.set(stateRef, { [kind]: date }, { merge: true });
      return { last };
    });
    if (!previous) continue;

    let delivered = 0;
    try {
      delivered = await sendAndPrune(account, tokens, { kind, title, body, route }, send);
    } finally {
      // Not delivered anywhere (thrown or zero): release for a retry.
      if (delivered === 0) {
        await stateRef.set({ [kind]: previous.last, retryDate: date }, { merge: true });
      }
    }
    if (delivered === 0) {
      logger.warn('Notification not delivered; will retry', { uid: account.id, kind, date });
      continue;
    }
    logger.info('Sent notification', { uid: account.id, kind, date });
  }
}

/** Sends a test push to the Account's own devices. */
export async function sendTestPush(
  db: Firestore,
  uid: string,
  send: Sender,
): Promise<{ devices: number }> {
  const account = db.collection('accounts').doc(uid);
  const tokens = await deviceTokens(account);
  if (tokens.length > 0) {
    await sendAndPrune(
      account,
      tokens,
      { kind: 'test', title: 'Test push', body: 'Notifications are working.', route: '/settings' },
      send,
    );
  }
  return { devices: tokens.length };
}

/**
 * Same check as the Firestore rules: verified email on config/allowlist.
 * Callable functions use the Admin SDK, which skips rules.
 */
export async function isAllowListed(
  db: Firestore,
  token: { email?: string; email_verified?: boolean } | undefined,
): Promise<boolean> {
  if (!token?.email || token.email_verified !== true) return false;
  const emails = (await db.doc('config/allowlist').get()).get('emails');
  return Array.isArray(emails) && emails.includes(token.email.toLowerCase());
}

async function deviceTokens(account: DocumentReference): Promise<string[]> {
  const devices = await account.collection('devices').get();
  return devices.docs.map((d) => d.id);
}

async function sendAndPrune(
  account: DocumentReference,
  tokens: string[],
  message: PushMessage,
  send: Sender,
): Promise<number> {
  const { staleTokens, delivered } = await send(tokens, message);
  // A failed cleanup must not look like a failed send (that would resend).
  await Promise.all(
    staleTokens.map((token) => account.collection('devices').doc(token).delete()),
  ).catch((error: unknown) => logger.warn('Could not remove stale tokens', { error }));
  return delivered;
}

function lastSentFrom(data: { [field: string]: unknown } | undefined): LastSent {
  const day = (v: unknown) => (typeof v === 'string' ? v : null);
  return { expiry: day(data?.expiry), shoppingDay: day(data?.shoppingDay) };
}
