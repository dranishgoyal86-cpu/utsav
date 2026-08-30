const linking = {
  prefixes: [
    'utsav://',
    // Real, live official domain for the app (see config.js's
    // PUBLIC_WEB_URL, which generates all new share/RSVP/pass links
    // against this host) — served by Cloudflare Pages (project
    // "utsav-app"), with app.theutsavapp.com attached as a verified
    // custom domain.
    'https://app.theutsavapp.com',
    // theutsavapp.com (bare) and www.theutsavapp.com are the SEPARATE
    // marketing site (Next.js, its own Cloudflare Pages project) — the app
    // does not live at either of these. Kept here only in case any link
    // generated during the earlier misconfigured-DNS window (when www
    // briefly served the app instead of the marketing site) is still in
    // the wild; not a real target going forward.
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
      // Deliberately NOT nested under 'provider/...' -- ProviderProfile's
      // 'provider/:providerId' pattern would ambiguously also match a
      // literal 'provider/import' segment. Only meaningfully resolves for
      // an already-logged-in provider (this screen lives inside App.js's
      // auth-gated provider stack, unlike every other entry above) -- the
      // bulk-import invite email (lib/bulkImportInvite.js) links here, with
      // a plain-text fallback in the email itself for a recipient who
      // isn't logged in yet.
      BulkImportServices: 'import-services',
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
      // Provider verification, Task 1 (email) -- reachable regardless of
      // auth state (the recipient may click this on a different, logged-out
      // device), same cross-auth-state reasoning as RSVP below.
      VerifyEmailToken: 'verify-email/:token',
    },
  },
};

export default linking;