// Weak-signal startup fix.
//
// On start, Firebase Auth checks the saved user with the server
// (accounts:lookup, plus a token refresh if the token expired) before it
// reports anyone signed in, and Firestore waits for Auth before it serves
// even its offline cache. On a hung connection ("online", one bar) that
// check waits for Auth's 30 s request timeout, so the app shows nothing for
// about 30 s.
//
// Auth keeps the saved user when that check fails with a network error, so
// failing it fast is safe: the user stays signed in, Firestore serves the
// cache, and the rules still guard the server. Only those two requests,
// made before startup ends, are capped.

// The saved-user check and token refresh. Not sign-in itself
// (accounts:signInWithIdp), which may need longer on a slow network.
const STARTUP_CHECKS = ['identitytoolkit.googleapis.com/v1/accounts:lookup', 'securetoken.googleapis.com/'];

type FetchTarget = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

/**
 * Wraps `target.fetch` so Auth requests fail after `timeoutMs` until the
 * returned release function is called (when Auth has started).
 */
export function capAuthStartupRequests({
  target = globalThis as FetchTarget,
  timeoutMs = 2500,
}: { target?: FetchTarget; timeoutMs?: number } = {}): () => void {
  const original = target.fetch;
  let starting = true;

  target.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!starting || !STARTUP_CHECKS.some((check) => url.includes(check))) {
      return original.call(target, input, init);
    }
    // One controller + setTimeout, not AbortSignal.timeout, for older iOS.
    const controller = new AbortController();
    init?.signal?.addEventListener('abort', () => controller.abort());
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return original
      .call(target, input, { ...init, signal: controller.signal })
      .finally(() => clearTimeout(timer));
  };

  return () => {
    starting = false;
  };
}
