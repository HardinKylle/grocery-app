import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

// Fake allow-list. Real emails never go in this public repo.
const ALICE = { uid: 'alice-uid', email: 'alice@example.test' };
const BOB = { uid: 'bob-uid', email: 'bob@example.test' };

const TOKEN = 'fcm-token:APA91b-abc_123';
const settingsPath = (uid: string) => `accounts/${uid}/settings/notifications`;
const devicePath = (uid: string, token = TOKEN) => `accounts/${uid}/devices/${token}`;
const statePath = (uid: string) => `accounts/${uid}/server/notifications`;

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-grocery',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'config/allowlist'), {
      emails: [ALICE.email, BOB.email],
    });
  });
});

function signedIn(user: { uid: string; email: string }) {
  return env.authenticatedContext(user.uid, { email: user.email, email_verified: true }).firestore();
}

const validSettings = { shoppingDay: 6, notifyHour: 8, expiryLeadDays: 2 };

describe('notification settings', () => {
  it('can be saved and read by the owner', async () => {
    const db = signedIn(ALICE);
    await assertSucceeds(setDoc(doc(db, settingsPath(ALICE.uid)), validSettings));
    await assertSucceeds(setDoc(doc(db, settingsPath(ALICE.uid)), { ...validSettings, shoppingDay: null }));
    await assertSucceeds(updateDoc(doc(db, settingsPath(ALICE.uid)), { notifyHour: 21 }));
    await assertSucceeds(getDoc(doc(db, settingsPath(ALICE.uid))));
  });

  it('reject out-of-range values', async () => {
    const db = signedIn(ALICE);
    const ref = doc(db, settingsPath(ALICE.uid));
    await assertFails(setDoc(ref, { ...validSettings, shoppingDay: 7 }));
    await assertFails(setDoc(ref, { ...validSettings, notifyHour: 24 }));
    await assertFails(setDoc(ref, { ...validSettings, notifyHour: 8.5 }));
    await assertFails(setDoc(ref, { ...validSettings, expiryLeadDays: -1 }));
    await assertFails(setDoc(ref, { ...validSettings, expiryLeadDays: 31 }));
    await assertFails(setDoc(ref, { ...validSettings, extra: true }));
  });

  it("cannot be read or written by another Account", async () => {
    const bob = signedIn(BOB);
    await assertFails(setDoc(doc(bob, settingsPath(ALICE.uid)), validSettings));
    await assertFails(getDoc(doc(bob, settingsPath(ALICE.uid))));
  });
});

describe('device tokens', () => {
  it('can be saved, read, and removed by the owner', async () => {
    const db = signedIn(ALICE);
    const ref = doc(db, devicePath(ALICE.uid));
    await assertSucceeds(setDoc(ref, { token: TOKEN, updatedAt: new Date(), userAgent: 'iPhone' }));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(deleteDoc(ref));
  });

  it('must be stored under their own token as the doc id', async () => {
    const db = signedIn(ALICE);
    await assertFails(
      setDoc(doc(db, devicePath(ALICE.uid, 'other')), { token: TOKEN, updatedAt: new Date() }),
    );
  });

  it('cannot be read or written by another Account', async () => {
    const bob = signedIn(BOB);
    await assertFails(setDoc(doc(bob, devicePath(ALICE.uid)), { token: TOKEN, updatedAt: new Date() }));
    await assertFails(getDoc(doc(bob, devicePath(ALICE.uid))));
  });
});

describe('server-only notification state (last-sent dates)', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), statePath(ALICE.uid)), {
        expiry: '2026-10-07',
        shoppingDay: null,
      });
    });
  });

  it('can be read by the owner but never written by a client', async () => {
    const db = signedIn(ALICE);
    await assertSucceeds(getDoc(doc(db, statePath(ALICE.uid))));
    await assertFails(setDoc(doc(db, statePath(ALICE.uid)), { expiry: null, shoppingDay: null }));
    await assertFails(updateDoc(doc(db, statePath(ALICE.uid)), { expiry: null }));
    await assertFails(deleteDoc(doc(db, statePath(ALICE.uid))));
    await assertFails(setDoc(doc(db, `accounts/${ALICE.uid}/server/other`), { x: 1 }));
  });

  it('cannot be read by another Account', async () => {
    await assertFails(getDoc(doc(signedIn(BOB), statePath(ALICE.uid))));
  });
});
