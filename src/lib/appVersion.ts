/**
 * Stale-app detection.
 *
 * The truck tablet and customers' installed PWAs can run the same page for days
 * without a real reload (iOS resumes a PWA from memory). The service worker
 * only announces an update when sw.js itself changes, which a normal deploy
 * does not do, so screens kept running old code after fixes went live.
 *
 * Every build now writes /version.json. Open screens compare it with the
 * version they are running whenever they come back into view, come back
 * online, or every few minutes, and reload when a newer build is live.
 */

export interface VersionCheckDeps {
  fetchVersion(): Promise<string | null>;
  runningVersion: string;
}

/** True only when the server reports a different, real version. Errors never trigger a reload. */
export async function isNewerBuildLive(deps: VersionCheckDeps): Promise<boolean> {
  if (!deps.runningVersion || deps.runningVersion === 'dev') return false;
  try {
    const live = await deps.fetchVersion();
    return typeof live === 'string' && live.length > 0 && live !== deps.runningVersion;
  } catch {
    return false;
  }
}

/**
 * Reload straight away only where nothing can be lost: when the screen is
 * not in the middle of a payment. A checkout in flight waits for the next check.
 */
export function shouldReloadNow(opts: { checkoutInProgress: boolean }): boolean {
  return !opts.checkoutInProgress;
}
