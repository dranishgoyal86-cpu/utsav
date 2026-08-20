const linking = {
  prefixes: [
    'utsav://',
    // Official domain (registered — see config.js's PUBLIC_WEB_URL, which
    // now generates all new share/RSVP/pass links against this host). NOT
    // yet live for the app: DNS/hosting still needs to be pointed at this
    // project's web build rather than the separate marketing site.
    'https://www.theutsavapp.com',
    'https://theutsavapp.com',
    // Previously-attempted official domain — DNS ended up parked at
    // GoDaddy's site builder instead of this app, kept as a fallback prefix
    // in case any link generated during that window is still in the wild.
    'https://www.utsavapp.co.in',
    'https://utsavapp.co.in',
    // Still-live EAS Hosting URL — kept so links already shared/printed
    // before the domain switches keep deep-linking correctly.
    'https://utsav.expo.app',
    // 'utsav.app' was never an owned domain — kept only in case any old
    // shared link/QR code out there references it.
    'https://utsav.app',
    'http://utsav.app',
  ],
  config: {
    screens: {
      CustomerTabs: {
        screens: {
          Discover: 'discover',
        },
      },
      ProviderProfile: 'provider/:providerId',
      GuestAccess: 'event/:inviteCode',
      // guestId is optional — old-style broadcast links (posted to a
      // family WhatsApp group, no third segment) still match exactly as
      // before, blank form. A per-guest link (GuestList.js embeds the
      // guest's own event_invitees.id) additionally prefills/dedupes by
      // that id — see RSVPScreen.js and submit-rsvp/index.ts.
      RSVP: 'rsvp/:inviteCode/:guestId?',
      DelegateRedeem: 'delegate/:inviteCode',
      GuestPass: 'p/:passCode',
      Login: 'login',
      Signup: 'signup',
      GuestSignup: 'guest-signup',
    },
  },
};

export default linking;