import { describe, expect, it } from 'vitest';
import { capAuthStartupRequests } from './startupFetch';

const LOOKUP = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=k';
const REFRESH = 'https://securetoken.googleapis.com/v1/token?key=k';
const OTHER = 'https://world.openfoodfacts.org/api/v2/product/1';
const SIGN_IN = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=k';

/** A fetch that never answers unless aborted, like a dead zone with one bar. */
function hangingTarget() {
  const target = {
    fetch: (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      }),
  };
  return target;
}

const settle = (p: Promise<unknown>, ms: number) =>
  Promise.race([
    p.then(
      () => 'resolved',
      () => 'rejected',
    ),
    new Promise((r) => setTimeout(() => r('pending'), ms)),
  ]);

describe('capAuthStartupRequests', () => {
  it('fails a hung Auth startup request after the timeout', async () => {
    const target = hangingTarget();
    capAuthStartupRequests({ target, timeoutMs: 20 });
    expect(await settle(target.fetch(LOOKUP), 200)).toBe('rejected');
    expect(await settle(target.fetch(REFRESH), 200)).toBe('rejected');
  });

  it('leaves other requests alone, including finishing a sign-in', async () => {
    const target = hangingTarget();
    capAuthStartupRequests({ target, timeoutMs: 20 });
    expect(await settle(target.fetch(OTHER), 100)).toBe('pending');
    expect(await settle(target.fetch(SIGN_IN), 100)).toBe('pending');
  });

  it('stops capping once startup is over', async () => {
    const target = hangingTarget();
    const release = capAuthStartupRequests({ target, timeoutMs: 20 });
    release();
    expect(await settle(target.fetch(LOOKUP), 100)).toBe('pending');
  });

  it('passes answers through unchanged', async () => {
    const answer = new Response('{}');
    const target = { fetch: async (_input: RequestInfo | URL, _init?: RequestInit) => answer };
    capAuthStartupRequests({ target, timeoutMs: 20 });
    expect(await target.fetch(LOOKUP)).toBe(answer);
  });
});
