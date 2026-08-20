export const CLOUDINARY_CONFIG = {
  cloudName: 'dkat1eovk',
  apiKey: '866351516314228',
  apiSecret: 'b64EG7cgYI8LiPyuuJ75klfXToE',
  uploadPreset: 'utsav_photos',
};

export const AWS_CONFIG = {
  region: 'ap-south-1',
  collectionPrefix: 'utsav_event_',
};

export const RAZORPAY_CONFIG = {
  keyId: 'rzp_test_TNzvCwHKjCy31S',
  currency: 'INR',
  appName: 'Utsav',
};

// The official public host for shared links (RSVP, provider profiles,
// gate passes, etc.). Still served by `eas deploy` (Expo Hosting) behind
// the scenes — this domain needs its DNS pointed at that deployment before
// links actually resolve. NOT yet live: as of 2026-08-14 this domain's
// hosting is the separate Next.js marketing site (theutsavapp.com), which
// has no /rsvp, /p, /provider, etc. routes — those only exist in this app's
// own web build. Every link-generating call site imports from here rather
// than hardcoding it, so once DNS/hosting is sorted, this is the only line
// that needs to change.
export const PUBLIC_WEB_URL = 'https://www.theutsavapp.com';