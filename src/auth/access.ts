export type Access = 'allowed' | 'refused';

/**
 * Decides whether a signed-in Google account may use the app.
 *
 * The allow-list is enforced by Firestore rules and is not readable by
 * clients, so the app asks by reading the user's own Account. Only a
 * rules denial means refused; other errors (offline, timeouts) keep the
 * user in, since the rules still guard every read and write.
 *
 * With weak signal the read can hang for a long time before Firestore
 * gives up and serves its cache, so after `timeoutMs` the user is let in.
 */
export async function checkAccess(
  readOwnAccount: () => Promise<unknown>,
  { timeoutMs = 3000 }: { timeoutMs?: number } = {},
): Promise<Access> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<Access>((resolve) => {
    timer = setTimeout(() => resolve('allowed'), timeoutMs);
  });
  const read = readOwnAccount().then(
    (): Access => 'allowed',
    (error: unknown): Access =>
      (error as { code?: unknown })?.code === 'permission-denied' ? 'refused' : 'allowed',
  );
  try {
    return await Promise.race([read, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}
