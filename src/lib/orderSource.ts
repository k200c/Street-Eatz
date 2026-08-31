export type OrderChannel = 'web' | 'qr' | 'pwa' | 'app';

export interface OrderSourceContext {
  channel: OrderChannel;
  campaign?: string;
  location?: string;
  table?: string;
  capturedAt: string;
}

const STORAGE_KEY = 'street-eatz-order-source-v1';
const MAX_ATTRIBUTION_AGE_MS = 24 * 60 * 60 * 1000;

const clean = (value: string | null): string | undefined => {
  const normalized = value?.trim().replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 64);
  return normalized || undefined;
};

const isOrderChannel = (value: string | null): value is OrderChannel =>
  value === 'web' || value === 'qr' || value === 'pwa' || value === 'app';

const isNativeApp = (): boolean => {
  const capacitor = (window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  return capacitor?.isNativePlatform?.() === true;
};

const isInstalledPwa = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);

const inferredChannel = (): OrderChannel => {
  if (isNativeApp()) return 'app';
  if (isInstalledPwa()) return 'pwa';
  return 'web';
};

export function captureOrderSource(
  search: string | URLSearchParams,
  forcedChannel?: OrderChannel,
): OrderSourceContext {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const requestedChannel = params.get('source');
  const channel = forcedChannel ?? (isOrderChannel(requestedChannel) ? requestedChannel : inferredChannel());
  const context: OrderSourceContext = {
    channel,
    campaign: clean(params.get('campaign')),
    location: clean(params.get('location')),
    table: clean(params.get('table')),
    capturedAt: new Date().toISOString(),
  };

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(context));
  } catch {
    // Attribution must never block ordering when storage is unavailable.
  }

  return context;
}

export function getOrderSource(): OrderSourceContext {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<OrderSourceContext>;
      const capturedAt = parsed.capturedAt ? Date.parse(parsed.capturedAt) : Number.NaN;
      if (
        isOrderChannel(parsed.channel ?? null) &&
        Number.isFinite(capturedAt) &&
        Date.now() - capturedAt < MAX_ATTRIBUTION_AGE_MS
      ) {
        return parsed as OrderSourceContext;
      }
    }
  } catch {
    // Fall through to a safe inferred source.
  }

  return {
    channel: inferredChannel(),
    capturedAt: new Date().toISOString(),
  };
}

export function buildQrOrderUrl(
  baseUrl: string,
  details: Pick<OrderSourceContext, 'campaign' | 'location' | 'table'>,
): string {
  const url = new URL('/qr/order', baseUrl);
  if (details.campaign) url.searchParams.set('campaign', details.campaign);
  if (details.location) url.searchParams.set('location', details.location);
  if (details.table) url.searchParams.set('table', details.table);
  return url.toString();
}
