import clientLogo from '@/assets/street-eatz-logo-new.jpeg';

export const clientConfig = {
  brandName: 'Street Eatz',
  wordmark: 'StreetEatz',
  legalName: 'Street Eatz Waterford',
  city: 'Waterford',
  category: 'Gourmet Street Food',
  tagline: 'Fresh · Bold · Waterford',
  email: 'streeteatzwaterford@gmail.com',
  phoneDisplay: '086 361 9157',
  phoneHref: 'tel:+353863619157',
  venueName: 'Crystal Sports and Leisure Centre',
  venueShortName: 'Crystal Sports',
  addressLines: [
    'Crystal Sports and Leisure Centre',
    'Cork Rd, Ballynaneashagh',
    'Waterford, X91 E6PX, Ireland',
  ],
  instagramUrl: 'https://www.instagram.com/streeteatzwaterford',
  instagramHandle: '@streeteatzwaterford',
  facebookUrl: 'https://www.facebook.com/223559870839289',
  mapEmbedUrl: 'https://www.google.com/maps?q=Crystal%20Sports%20and%20Leisure%20Centre%2C%20Cork%20Road%2C%20Waterford%2C%20Ireland&output=embed',
  legalLastUpdated: '2026-08-30',
  openingHours: [
    { day: 'Thursday', time: '12pm - 7pm' },
    { day: 'Friday', time: '12pm - 7pm' },
    { day: 'Saturday', time: '1pm - 7pm' },
    { day: 'Sunday', time: '1pm - 7pm' },
  ],
} as const;

export const clientMailto = `mailto:${clientConfig.email}`;
export const appStoreUrl = import.meta.env.VITE_APP_STORE_URL?.trim() || null;

export const clientAssets = {
  logo: clientLogo,
} as const;

export const clientLegalLastUpdated = new Intl.DateTimeFormat('en-IE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
}).format(new Date(`${clientConfig.legalLastUpdated}T00:00:00Z`));
