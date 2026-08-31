export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface InstallExperienceState {
  canPrompt: boolean;
  installed: boolean;
  isIosSafari: boolean;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let initialized = false;
const listeners = new Set<(state: InstallExperienceState) => void>();

export const isAppInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches
  || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);

export const isIosSafari = () => {
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
};

const getState = (): InstallExperienceState => ({
  canPrompt: Boolean(deferredPrompt),
  installed: isAppInstalled(),
  isIosSafari: isIosSafari(),
});

const notify = () => {
  const state = getState();
  listeners.forEach((listener) => listener(state));
};

export function initializeInstallExperience() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

export function subscribeInstallExperience(listener: (state: InstallExperienceState) => void) {
  initializeInstallExperience();
  listeners.add(listener);
  listener(getState());
  return () => listeners.delete(listener);
}

export async function requestAppInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  const prompt = deferredPrompt;
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  deferredPrompt = null;
  notify();
  return outcome;
}

initializeInstallExperience();

