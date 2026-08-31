const DIRECT_REVIEW_PATH = '/local/writereview';

export function normalizeGoogleReviewUrl(value: string): string | null {
  const candidate = value.trim();
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:') return null;

    const hostname = url.hostname.toLowerCase();
    if (hostname === 'search.google.com') {
      const placeId = url.searchParams.get('placeid')?.trim();
      if (url.pathname !== DIRECT_REVIEW_PATH || !placeId) return null;
      return `https://search.google.com${DIRECT_REVIEW_PATH}?placeid=${encodeURIComponent(placeId)}`;
    }

    if (hostname === 'g.page' && /\/review\/?$/i.test(url.pathname)) {
      url.hash = '';
      return url.toString();
    }

    return null;
  } catch {
    return null;
  }
}

