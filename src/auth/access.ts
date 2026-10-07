export type Access = 'allowed' | 'refused';

/**
 * Decides whether a signed-in Google account may use the app.
 *
 * The allow-list is enforced by Firestore rules and is not readable by
 * clients, so the app asks by reading the user's own Account. Only a
 * rules denial means refused; other errors (offline, timeouts) keep the
 * user in, since the rules still guard every read and write.
 */
export async function checkAccess(readOwnAccount: () => Promise<unknown>): Promise<Access> {
  try {
    await readOwnAccount();
    return 'allowed';
  } catch (error) {
    if ((error as { code?: unknown })?.code === 'permission-denied') return 'refused';
    return 'allowed';
  }
}
