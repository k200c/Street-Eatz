import { useEffect, useState } from 'react';
import { useStoreStatus } from '@/hooks/useStoreStatus';
import { formatCheckedAt, isStatusStale } from '@/lib/staffConnection';

/**
 * Store status for staff headers.
 *
 * Shows when it last heard from the server, and turns amber when that is more
 * than three minutes ago. A screen that has lost its connection must look
 * broken, not normal: on 16 Oct the truck screen looked fine for three hours
 * while nothing it did reached the server.
 */
export function StaffStoreStatusBadge({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const { isStoreOpen, statusUpdatedAt, refetch } = useStoreStatus();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const stale = isStatusStale(statusUpdatedAt, now);
  const checkedAt = formatCheckedAt(statusUpdatedAt);
  const text = size === 'md' ? 'text-sm' : 'text-xs';

  if (stale) {
    return (
      <button
        type="button"
        onClick={() => window.location.reload()}
        className={`px-3 py-1 rounded-full ${text} font-bold bg-amber-500/25 text-amber-300 border border-amber-400/60 animate-pulse`}
        title="This screen has stopped getting updates. Tap to reload."
      >
        ⚠ NOT UPDATING · TAP TO RELOAD
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => refetch()}
      className={`px-3 py-1 rounded-full ${text} font-bold ${
        isStoreOpen ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
      }`}
      title="Tap to check again"
    >
      {isStoreOpen ? '● STORE OPEN' : '○ STORE CLOSED'}
      {checkedAt && <span className="ml-2 font-normal opacity-70">checked {checkedAt}</span>}
    </button>
  );
}
