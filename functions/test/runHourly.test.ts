// Runs against the Firestore emulator (`npm test` starts it).
// FCM has no emulator, so a fake sender records what would be sent.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { isAllowListed, runHourly, sendTestPush, type PushMessage, type Sender } from '../src/notify';

const PROJECT = 'demo-grocery';
let db: Firestore;

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run through `npm test` (needs the emulator).');
  db = getFirestore(initializeApp({ projectId: PROJECT }, 'runHourly-test'));
});

beforeEach(async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  await fetch(`http://${host}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
});

type Sent = { tokens: string[]; message: PushMessage };

function fakeSender(stale: string[] = []): { send: Sender; sent: Sent[] } {
  const sent: Sent[] = [];
  return {
    sent,
    send: async (tokens, message) => {
      sent.push({ tokens, message });
      return { staleTokens: tokens.filter((t) => stale.includes(t)) };
    },
  };
}

async function seedAccount(
  uid: string,
  opts: {
    settings?: Record<string, unknown>;
    tokens?: string[];
    products?: Record<string, Record<string, unknown>>;
  },
) {
  const account = db.collection('accounts').doc(uid);
  if (opts.settings) await account.collection('settings').doc('notifications').set(opts.settings);
  for (const token of opts.tokens ?? []) {
    await account.collection('devices').doc(token).set({ token, updatedAt: new Date() });
  }
  for (const [id, data] of Object.entries(opts.products ?? {})) {
    await account.collection('products').doc(id).set(data);
  }
}

// Wednesday 2026-10-07, 08:00 in Manila.
const eightAm = new Date('2026-10-07T08:00:00+08:00');
const milk = { name: 'Milk', count: 1, expiryDate: '2026-10-08' };

describe('runHourly', () => {
  it('sends the expiry alert to every device of an Account due this hour', async () => {
    await seedAccount('alice', { tokens: ['phone', 'ipad'], products: { milk } });
    const { send, sent } = fakeSender();

    await runHourly(db, eightAm, send);

    expect(sent).toHaveLength(1);
    expect(sent[0].tokens.sort()).toEqual(['ipad', 'phone']);
    expect(sent[0].message).toMatchObject({ kind: 'expiry', route: '/inventory', body: 'Milk (tomorrow)' });
  });

  it('skips Accounts whose notification time is another hour', async () => {
    await seedAccount('alice', { settings: { notifyHour: 9 }, tokens: ['phone'], products: { milk } });
    const { send, sent } = fakeSender();
    await runHourly(db, eightAm, send);
    expect(sent).toEqual([]);
  });

  it('sends the Shopping Day message on Shopping Day', async () => {
    await seedAccount('bob', {
      settings: { shoppingDay: 3, notifyHour: 8, expiryLeadDays: 2 },
      tokens: ['phone'],
      products: { eggs: { name: 'Eggs', count: 0, shoppingList: { buyQuantity: 1, checkedOff: false } } },
    });
    const { send, sent } = fakeSender();
    await runHourly(db, eightAm, send);
    expect(sent.map((s) => s.message)).toMatchObject([
      { kind: 'shoppingDay', route: '/shopping-list', body: '1 Product on your Shopping List.' },
    ]);
  });

  it('sends each message only once when the schedule fires twice', async () => {
    await seedAccount('alice', {
      settings: { shoppingDay: 3 },
      tokens: ['phone'],
      products: { milk },
    });
    const { send, sent } = fakeSender();

    await Promise.all([runHourly(db, eightAm, send), runHourly(db, eightAm, send)]);
    await runHourly(db, new Date('2026-10-07T08:30:00+08:00'), send);

    expect(sent.map((s) => s.message.kind).sort()).toEqual(['expiry', 'shoppingDay']);
    const state = await db.doc('accounts/alice/server/notifications').get();
    expect(state.data()).toEqual({ expiry: '2026-10-07', shoppingDay: '2026-10-07' });
  });

  it('sends again the next day', async () => {
    await seedAccount('alice', { tokens: ['phone'], products: { milk } });
    const { send, sent } = fakeSender();
    await runHourly(db, eightAm, send);
    await runHourly(db, new Date('2026-10-08T08:00:00+08:00'), send);
    expect(sent.map((s) => s.message.body)).toEqual(['Milk (tomorrow)', 'Milk (today)']);
  });

  it('sends nothing, and claims nothing, for an Account with no devices', async () => {
    await seedAccount('alice', { products: { milk } });
    const { send, sent } = fakeSender();
    await runHourly(db, eightAm, send);
    expect(sent).toEqual([]);
    expect((await db.doc('accounts/alice/server/notifications').get()).exists).toBe(false);
  });

  it('removes device tokens FCM reports as no longer registered', async () => {
    await seedAccount('alice', { tokens: ['old', 'new'], products: { milk } });
    const { send } = fakeSender(['old']);
    await runHourly(db, eightAm, send);
    const devices = await db.collection('accounts/alice/devices').get();
    expect(devices.docs.map((d) => d.id)).toEqual(['new']);
  });

  it('keeps going for other Accounts when one send fails', async () => {
    await seedAccount('alice', { tokens: ['a'], products: { milk } });
    await seedAccount('bob', { tokens: ['b'], products: { milk } });
    const sent: string[] = [];
    const send: Sender = async (tokens) => {
      if (tokens.includes('a')) throw new Error('FCM down');
      sent.push(...tokens);
      return { staleTokens: [] };
    };
    await runHourly(db, eightAm, send);
    expect(sent).toEqual(['b']);
  });
});

describe('sendTestPush', () => {
  it("sends a test push to the caller's own devices, opening Settings", async () => {
    await seedAccount('alice', { tokens: ['phone'] });
    await seedAccount('bob', { tokens: ['bobs-phone'] });
    const { send, sent } = fakeSender();

    const result = await sendTestPush(db, 'alice', send);

    expect(result).toEqual({ devices: 1 });
    expect(sent).toMatchObject([{ tokens: ['phone'], message: { kind: 'test', route: '/settings' } }]);
  });

  it('reports zero devices when none are saved', async () => {
    const { send, sent } = fakeSender();
    expect(await sendTestPush(db, 'alice', send)).toEqual({ devices: 0 });
    expect(sent).toEqual([]);
  });
});

describe('isAllowListed', () => {
  beforeEach(async () => {
    await db.doc('config/allowlist').set({ emails: ['alice@example.test'] });
  });

  it('allows a verified email on the allow-list, ignoring case', async () => {
    expect(await isAllowListed(db, { email: 'Alice@Example.test', email_verified: true })).toBe(true);
  });

  it('refuses unverified, unlisted, or missing emails', async () => {
    expect(await isAllowListed(db, { email: 'alice@example.test', email_verified: false })).toBe(false);
    expect(await isAllowListed(db, { email: 'mallory@example.test', email_verified: true })).toBe(false);
    expect(await isAllowListed(db, undefined)).toBe(false);
  });
});
