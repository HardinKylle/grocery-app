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

/** Sends one push to some device tokens. Returns tokens FCM no longer knows. */
export type Sender = (tokens: string[], message: PushMessage) => Promise<{ staleTokens: string[] }>;

/**
 * The hourly job. For each Account whose notification hour is now (Manila),
 * sends whatever dueNotifications says is due. Each message is claimed in a
 * transaction on accounts/{uid}/server/notifications before sending, so a
 * second run in the same hour (Cloud Scheduler can fire twice) sends nothing.
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
  if (manilaTime(now).hour !== settings.notifyHour) return;

  const tokens = await deviceTokens(account);
  if (tokens.length === 0) return;

  const stateRef = account.collection('server').doc('notifications');
  const [productsSnap, stateSnap] = await Promise.all([
    account.collection('products').get(),
    stateRef.get(),
  ]);
  const due = dueNotifications({
    now,
    settings,
    products: productsSnap.docs.map((d) => productFromData(d.id, d.data())),
    lastSent: lastSentFrom(stateSnap.data()),
  });

  for (const notification of due) {
    const claimed = await db.runTransaction(async (tx) => {
      const state = await tx.get(stateRef);
      if (lastSentFrom(state.data())[notification.kind] === notification.date) return false;
      tx.set(stateRef, { [notification.kind]: notification.date }, { merge: true });
      return true;
    });
    if (!claimed) continue;
    const { kind, title, body, route } = notification;
    await sendAndPrune(account, tokens, { kind, title, body, route }, send);
    logger.info('Sent notification', { uid: account.id, kind, date: notification.date });
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
) {
  const { staleTokens } = await send(tokens, message);
  await Promise.all(staleTokens.map((token) => account.collection('devices').doc(token).delete()));
}

function lastSentFrom(data: { [field: string]: unknown } | undefined): LastSent {
  const day = (v: unknown) => (typeof v === 'string' ? v : null);
  return { expiry: day(data?.expiry), shoppingDay: day(data?.shoppingDay) };
}
