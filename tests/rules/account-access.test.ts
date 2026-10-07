import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// Fake allow-list. Real emails never go in this public repo.
const ALICE = { uid: 'alice-uid', email: 'alice@example.test' };
const BOB = { uid: 'bob-uid', email: 'bob@example.test' };
const MALLORY = { uid: 'mallory-uid', email: 'mallory@example.test' };

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

function signedIn(user: { uid: string; email: string }, emailVerified = true) {
  return env
    .authenticatedContext(user.uid, { email: user.email, email_verified: emailVerified })
    .firestore();
}

describe('an allow-listed owner', () => {
  it('can write and read their own Account', async () => {
    const db = signedIn(ALICE);
    await assertSucceeds(setDoc(doc(db, `accounts/${ALICE.uid}`), { createdAt: 1 }));
    await assertSucceeds(getDoc(doc(db, `accounts/${ALICE.uid}`)));
  });

  it('can write and read data under their own Account', async () => {
    const db = signedIn(ALICE);
    const product = doc(db, `accounts/${ALICE.uid}/products/milk`);
    await assertSucceeds(setDoc(product, { name: 'Bear Brand Milk', count: 1 }));
    await assertSucceeds(getDoc(product));
  });
});

describe('a signed-in user outside the allow-list', () => {
  it('cannot read or write even their own path', async () => {
    const db = signedIn(MALLORY);
    await assertFails(setDoc(doc(db, `accounts/${MALLORY.uid}`), { createdAt: 1 }));
    await assertFails(getDoc(doc(db, `accounts/${MALLORY.uid}`)));
    await assertFails(
      setDoc(doc(db, `accounts/${MALLORY.uid}/products/milk`), { name: 'x', count: 1 }),
    );
  });
});

describe('an allow-listed email that is not verified', () => {
  it('is denied', async () => {
    const db = signedIn(ALICE, false);
    await assertFails(getDoc(doc(db, `accounts/${ALICE.uid}`)));
    await assertFails(setDoc(doc(db, `accounts/${ALICE.uid}`), { createdAt: 1 }));
  });
});

describe('a signed-out visitor', () => {
  it('is denied', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, `accounts/${ALICE.uid}`)));
  });
});

describe('the allow-list doc', () => {
  it('cannot be read or changed by any client', async () => {
    const db = signedIn(ALICE);
    await assertFails(getDoc(doc(db, 'config/allowlist')));
    await assertFails(
      setDoc(doc(db, 'config/allowlist'), { emails: [ALICE.email, MALLORY.email] }),
    );
  });
});

describe('one Account', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `accounts/${ALICE.uid}/products/milk`), {
        name: 'Bear Brand Milk',
        count: 1,
      });
    });
  });

  it("cannot read another Account's data", async () => {
    const bob = signedIn(BOB);
    await assertFails(getDoc(doc(bob, `accounts/${ALICE.uid}`)));
    await assertFails(getDoc(doc(bob, `accounts/${ALICE.uid}/products/milk`)));
  });

  it("cannot write another Account's data", async () => {
    const bob = signedIn(BOB);
    await assertFails(setDoc(doc(bob, `accounts/${ALICE.uid}`), { hacked: true }));
    await assertFails(
      setDoc(doc(bob, `accounts/${ALICE.uid}/products/milk`), { name: 'x', count: 99 }),
    );
  });
});
