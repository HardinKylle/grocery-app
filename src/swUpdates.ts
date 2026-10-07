// Checks for a new app version while the app stays open. iOS Home Screen
// apps are rarely relaunched, so the browser's own check (on navigation)
// alone can leave an old version running for days.

const HOUR_MS = 60 * 60 * 1000;

type Page = {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
};

/**
 * Calls `registration.update()` whenever the page comes back into view and
 * hourly while it is visible. The autoUpdate service worker then takes over.
 */
export function checkForUpdates(
  registration: { update(): Promise<unknown> },
  {
    doc = document,
    every = (fn, ms) => void setInterval(fn, ms),
  }: { doc?: Page; every?: (fn: () => void, ms: number) => void } = {},
): void {
  const check = () => {
    if (doc.visibilityState !== 'visible') return;
    // A failed check (no signal) just waits for the next one.
    registration.update().catch(() => {});
  };
  doc.addEventListener('visibilitychange', check);
  every(check, HOUR_MS);
}
