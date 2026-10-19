import { clientConfig } from '@/config/client';

export const APP_VERSION =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

let registration: ServiceWorkerRegistration | null = null;
let refreshNeeded = false;
const refreshListeners = new Set<(needRefresh: boolean) => void>();

const notifyRefreshListeners = (value: boolean) => {
  refreshNeeded = value;
  refreshListeners.forEach((listener) => listener(value));
};

const watchRegistration = (nextRegistration: ServiceWorkerRegistration) => {
  if (nextRegistration.waiting && navigator.serviceWorker.controller) {
    notifyRefreshListeners(true);
  }

  nextRegistration.addEventListener('updatefound', () => {
    const installingWorker = nextRegistration.installing;
    if (!installingWorker) return;
    installingWorker.addEventListener('statechange', () => {
      if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
        notifyRefreshListeners(true);
      }
    });
  });
};

export async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return null;
  if (registration) return registration;

  try {
    registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    watchRegistration(registration);

    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });

    return registration;
  } catch (error) {
    console.warn(`[${clientConfig.brandName}] App install support unavailable:`, error);
    return null;
  }
}

export async function checkForUpdates(): Promise<void> {
  const activeRegistration = registration ?? await registerSW();
  if (activeRegistration) await activeRegistration.update();
}

export function applyUpdate(): void {
  registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
}

export function onNeedRefresh(cb: (needRefresh: boolean) => void): () => void {
  refreshListeners.add(cb);
  cb(refreshNeeded);
  return () => refreshListeners.delete(cb);
}

export function getRegistration(): ServiceWorkerRegistration | null {
  return registration;
}

// ---------------------------------------------------------------------------
// Stale-app auto refresh. See src/lib/appVersion.ts.
// ---------------------------------------------------------------------------
import { isNewerBuildLive, shouldReloadNow } from './appVersion';

const VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;
let reloadHolds = 0;
let staleBuildPending = false;
let versionWatchStarted = false;

/** Call while a checkout is open; the returned function releases the hold. */
export function holdAutoReload(): () => void {
  reloadHolds++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    reloadHolds = Math.max(0, reloadHolds - 1);
    if (staleBuildPending && reloadHolds === 0) window.location.reload();
  };
}

async function fetchLiveVersion(): Promise<string | null> {
  const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) return null;
  const body = await response.json().catch(() => null) as { version?: unknown } | null;
  return typeof body?.version === 'string' ? body.version : null;
}

async function checkLiveVersion(): Promise<void> {
  if (!navigator.onLine) return;
  const stale = await isNewerBuildLive({ runningVersion: APP_VERSION, fetchVersion: fetchLiveVersion });
  if (!stale) return;
  staleBuildPending = true;
  console.info(`[${clientConfig.brandName}] Newer version live; reloading from ${APP_VERSION}`);
  if (shouldReloadNow({ checkoutInProgress: reloadHolds > 0 })) window.location.reload();
}

export function startStaleVersionWatch(): void {
  if (!import.meta.env.PROD || versionWatchStarted) return;
  versionWatchStarted = true;
  const check = () => { void checkLiveVersion(); };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  window.addEventListener('pageshow', check);
  window.addEventListener('online', check);
  window.setInterval(check, VERSION_CHECK_INTERVAL_MS);
  check();
}
