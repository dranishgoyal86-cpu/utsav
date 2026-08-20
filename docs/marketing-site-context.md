# Utsav marketing site — context for Claude Code

This file briefs Claude Code on the **live marketing site** at
https://www.theutsavapp.com so it can wire it up to the Utsav Android app
(Expo/React Native) and web app. Paste this whole file into a new Claude
Code session, or save it as `docs/marketing-site-context.md` in the app repo
and reference it.

## What this project is

`theutsavapp.com` is the public marketing/landing page for **Utsav**, an
Expo (React Native) events-planning marketplace app for India — customers
plan weddings/birthdays/etc., get an auto-generated checklist, book vendors,
and manage guests (RSVP, invites, gate passes/QR check-in, gifts, seating).
Providers list services and run a lightweight ERP. The marketing site is a
**separate codebase and separate deploy** from the app — it does not import
app code and has no shared backend today.

It replaced an older static site (`index.html` / `customer.html` /
`provider.html`) — that static version is retired, not just deprecated.

## Live deployment

- **Domain**: `theutsavapp.com` (registered + DNS on Cloudflare), live via
  **Cloudflare Pages**. This is the canonical domain.
- A second domain, `utsavapp.co.in` (GoDaddy), is **not** independently
  hosted — it 301-redirects to `https://theutsavapp.com` via GoDaddy's
  domain forwarding. No separate deploy, no DNS pointing at Vercel or
  anywhere else. If Claude Code ever sees references to a planned Vercel
  deploy for `utsavapp.co.in` in old notes, that plan was superseded by
  this redirect.
- Build: Next.js App Router, static export (`output: "export"` in
  `next.config.ts`, `images.unoptimized: true`). No API routes, no server
  actions — everything is static + client-side React.
- Cloudflare Pages build settings: framework preset "Next.js (Static HTML
  Export)", build command `npm run build`, output directory `out`.
- Fonts are self-hosted via `@fontsource` (Manrope/Inter/IBM Plex Mono),
  not `next/font/google` — deliberate, avoids a runtime dependency on
  Google's font CDN.

## Design system (source of truth — reuse these values, don't reinvent)

```css
/* Primary UI accent */
--accent: #e8a020;

/* Secondary palette, sampled directly from the Utsav logo mark */
--brand-blue: #3b9dff;
--brand-violet: #9066ff;
--brand-magenta: #ff4f9e;
--brand-orange: #ff9a3d;

/* Light theme */
--bg: #ffffff;
--ink: #1a1a1a;

/* Dark theme */
--bg (dark): #121212;
--ink (dark): #f2efea;
```

- Aesthetic: Apple/Notion-inspired — clean, minimal, generous whitespace.
- Fonts: Manrope (display/headings), Inter (body), IBM Plex Mono (tags,
  counts, data-like UI bits — checklist tags, RSVP counts, pass IDs).
- Each product surface on the marketing site has a assigned brand color:
  guest management = blue, digital invites = magenta, gate passes = violet,
  gifts = orange. Haldi/Sangeet/Reception progress bars use orange
  (turmeric), magenta (festive), violet (formal) respectively — these
  color choices are intentional, not arbitrary, keep them if extending.
- Full token set lives in `app/globals.css` (`:root` and `.dark` blocks).

## What's real vs. placeholder on the site today

- **Copy/features are real**: guest list (RSVP, plus-ones, household
  entries), digital invites (auto-filled, WhatsApp send), gate passes (QR,
  offline-first check-in, geofenced auto check-in), gift + return-gift
  tracking, and the smart checklist (adapts to event type, season, day/
  night, venue, diet, and per-function tracking for Haldi/Sangeet/
  Reception) are all pulled from the actual app feature set — not generic
  marketing filler. Keep new copy consistent with this list; don't invent
  features that don't exist in the app.
- **Feature "glimpses" are stylized UI mockups**, not real app screenshots
  (`components/FeatureMockups.tsx`). No screenshots were available when
  built. Swappable for real screenshots later.
- **Smart checklist demo** (`components/SmartChecklist.tsx`) is fully
  interactive, real client-side logic (not a static mock) — useful as a
  reference for how the actual app's checklist-generation rules should
  behave if you're implementing that logic in the app.
- **Photo gallery** (`components/MomentsGallery.tsx`): 6 real (stock,
  Pexels-sourced) photos are in place as placeholders. Two of them
  (`reception.jpg`, `procession.jpg`) are visually off-brand (not Indian
  wedding imagery) and should be first in line to replace with real
  photography or better stock.
- **Every login/signup CTA is `href="#"`.** There are 5 locations — grep
  the codebase for `Placeholder` to find all of them (nav has 2, hero,
  providers band, footer). This is the main integration point Claude Code
  needs to close.

## Decided: login/signup flow (customer)

Tapping **"Customer login" / "Start planning your event"** on the marketing
site does **not** deep-link to the native app or the Play Store directly.
The flow is:

1. CTA → **registration/signup page on the webapp**
   (`app.theutsavapp.com/signup` or similar — exact path TBD by Claude
   Code), where a first-time visitor creates their account.
2. After registering, they land in the **webapp**, logged in, using it
   in-browser.
3. The webapp surfaces an **"install the app for the full experience"**
   prompt (banner or modal, not forced) — since QR scanning, offline-first
   check-in, and geofenced auto check-in are native-only and won't work in
   a browser. This should be persistent but dismissible, not a hard gate.
4. Returning users hit the same URL and see a **login** form instead of
   signup (standard "already have an account?" pattern).

**Open question for Claude Code to confirm with the user**: does the
provider side follow the identical pattern (register on webapp → login →
install-app nudge), or does it differ? Assumed identical unless told
otherwise, since the marketing site treats both audiences symmetrically
today.

## Integration TODOs for Claude Code

1. **Build the webapp registration/login flow** described above at
   `app.theutsavapp.com` (Expo web export + whatever auth/backend the app
   already uses). Once the real URLs exist, replace all 5 `href="#"`
   placeholders in the marketing site (grep for `Placeholder`) with:
   - Customer-facing CTAs (nav, hero, footer) → customer signup URL
   - Provider-facing CTAs (nav, providers band, footer) → provider signup
     URL
   Remove the `{/* Placeholder */}` comments once wired.
2. **Build the "install the app" prompt inside the webapp** — surfaced
   after login/registration, not before. Should clearly name which
   features are native-only (QR gate-pass scanning, offline-first
   check-in, geofenced auto check-in) rather than vaguely saying "better
   experience," so users understand *why* to install rather than just
   being nagged.
3. **Expo web export caveats to check**: native-only modules (camera,
   native maps, native QR scanning, geofenced/background location) likely
   need web fallbacks or graceful disabling on the webapp — this is what
   the install-app prompt in item 2 is compensating for.
4. **Keep design tokens in sync.** If the web app has its own Tailwind/CSS
   setup, pull the token values above so the jump from marketing site →
   webapp/app doesn't feel like a different product.
5. **Once the webapp domain is live**, update `metadataBase` in
   `app/layout.tsx` (currently `https://theutsavapp.com`) and add
   cross-links (e.g. marketing site footer → webapp, webapp → marketing
   site) as needed.
6. ~~Resolve the two-domain question~~ — **done**: `utsavapp.co.in` 301-
   redirects to `theutsavapp.com` via GoDaddy forwarding. Nothing further
   needed here unless the redirect breaks.

## Repo structure (marketing site)

```
app/
  layout.tsx      — fonts, metadata, theme-flash prevention script
  page.tsx        — the entire homepage
  globals.css     — design tokens (light/dark), Tailwind v4 theme
components/
  Nav.tsx
  ThemeToggle.tsx          — class-based light/dark, persisted to localStorage
  SmartChecklist.tsx       — interactive hero demo, real generation logic
  FeatureMockups.tsx       — guest list / invite / gate pass / gift UI cards
  MomentsGallery.tsx       — photo grid, 6 slots
public/
  brand/          — logo marks, favicons, OG image (from official brand kit)
  photos/         — the 6 gallery photos
```
