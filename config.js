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
  keyId: 'rzp_test_TRwRvFdKUZlcls',
  currency: 'INR',
  appName: 'Utsav',
};

// The official public host for shared links (RSVP, provider profiles,
// gate passes, etc.). Served by Cloudflare Pages (project "utsav-app"),
// with app.theutsavapp.com attached as a verified custom domain. Every
// link-generating call site imports from here rather than hardcoding it.
export const PUBLIC_WEB_URL = 'https://app.theutsavapp.com';