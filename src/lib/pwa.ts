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
