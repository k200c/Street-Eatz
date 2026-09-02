import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppSettings } from '@/hooks/useAppSettings';

/**
 * Banner height, measured: py-2 (8px + 8px) plus the text-sm line box (20px)
 * = 36px. That is the exact 36px the browse test saw the hero H1 jump by —
 * the banner arrives after app_settings loads and pushes everything down.
 *
 * Fix: hold a 36px slot while settings are loading, so the page lays out at
 * its final height from the first paint. Whether to hold the slot on a cold
 * visit is remembered from the last visit, so a site with the banner off does
 * not pay for an empty band either. First-ever visit reserves — a downward
 * shift is worse than an empty band collapsing.
 */
const BANNER_HEIGHT_PX = 36;
const LAST_KNOWN_KEY = 'marketing-banner-last-shown';

function readLastKnown(): boolean {
  try {
    const value = localStorage.getItem(LAST_KNOWN_KEY);
    return value === null ? true : value === 'true';
  } catch {
    return true;
  }
}

export function MarketingBanner() {
  const { data: settings, isLoading } = useAppSettings();
  const [dismissed, setDismissed] = useState(false);
  const [reserve] = useState<boolean>(() => (typeof window === 'undefined' ? true : readLastKnown()));

  const shouldShow = Boolean(settings?.marketing_banner_enabled && settings?.marketing_banner_text);

  useEffect(() => {
    if (isLoading) return;
    try {
      localStorage.setItem(LAST_KNOWN_KEY, String(shouldShow));
    } catch {
      // Storage unavailable — the next visit falls back to reserving the slot.
    }
  }, [isLoading, shouldShow]);

  if (isLoading) {
    return reserve ? <div aria-hidden="true" style={{ height: BANNER_HEIGHT_PX }} /> : null;
  }

  if (!shouldShow || dismissed) return null;

  return (
    <div
      className="bg-primary text-primary-foreground py-2 px-4 flex items-center justify-center gap-2 relative"
      style={{ minHeight: BANNER_HEIGHT_PX }}
    >
      <span className="text-sm font-medium text-center">
        {settings!.marketing_banner_text}
      </span>
      {/* 44px target — the previous 24px dismiss button was browse-test finding 16 */}
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-1 flex h-11 w-11 items-center justify-center rounded hover:bg-primary-foreground/10"
        aria-label="Dismiss banner"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
