import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requestAppInstall, subscribeInstallExperience } from '@/lib/installApp';
import { clientConfig } from '@/config/client';

const DISMISSED_AT_KEY = 'food-os-install-prompt-dismissed-at';
const DISMISS_FOR_MS = 30 * 24 * 60 * 60 * 1000;

export function InstallAppPrompt() {
  const [canPrompt, setCanPrompt] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissedAt = Number(localStorage.getItem(DISMISSED_AT_KEY) || 0);
    if (Date.now() - dismissedAt < DISMISS_FOR_MS) return;

    const unsubscribe = subscribeInstallExperience((state) => {
      setCanPrompt(state.canPrompt);
      if (state.installed) {
        setVisible(false);
        return;
      }
      if (state.canPrompt) setVisible(true);
    });

    let iosTimer: number | undefined;
    const ua = window.navigator.userAgent;
    const iosSafari = /iPad|iPhone|iPod/.test(ua) && /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    if (iosSafari) {
      iosTimer = window.setTimeout(() => {
        setShowIosHelp(true);
        setVisible(true);
      }, 5000);
    }

    return () => {
      unsubscribe();
      if (iosTimer) window.clearTimeout(iosTimer);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()));
    setVisible(false);
  };

  const install = async () => {
    const outcome = await requestAppInstall();
    if (outcome !== 'unavailable') setVisible(false);
  };

  if (!visible) return null;

  return (
    <aside className="fixed bottom-[calc(var(--bottom-nav-height)+var(--safe-bottom)+0.75rem)] left-3 right-3 z-50 mx-auto max-w-md rounded-2xl border border-primary/30 bg-card/95 p-4 shadow-2xl backdrop-blur-xl">
      <button onClick={dismiss} className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground hover:bg-secondary" aria-label="Dismiss install prompt">
        <X className="h-4 w-4" />
      </button>
      <div className="flex gap-3 pr-7">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          {showIosHelp ? <Share className="h-5 w-5" /> : <Download className="h-5 w-5" />}
        </div>
        <div>
          <p className="font-heading text-lg">INSTALL {clientConfig.brandName.toUpperCase()}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {showIosHelp ? 'Tap Share, then “Add to Home Screen” for faster ordering.' : 'Add the app to your phone for faster ordering and live updates.'}
          </p>
        </div>
      </div>
      {canPrompt && <Button onClick={install} className="mt-4 w-full">INSTALL APP</Button>}
    </aside>
  );
}
