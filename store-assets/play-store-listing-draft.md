# Utsav — Play Store Listing Draft

Draft only — review and edit before pasting into Play Console. Character
limits are Play Store's actual enforced limits.

## App title (max 30 characters)

```
Utsav - Event Planner
```
(21 characters)

Alternates if you want something more descriptive:
- `Utsav: Plan & Book Events` (26 chars)
- `Utsav - Events & Vendors` (25 chars)

## Short description (max 80 characters)

```
Plan your event, book trusted vendors, manage guests — all in one app.
```
(72 characters)

## Full description (max 4000 characters)

```
Utsav is your all-in-one event planning companion — built for weddings,
birthdays, housewarmings, corporate events, and everything in between.

PLAN YOUR EVENT
Tell Utsav what you're planning and get an instant checklist of everything
you'll need, with real price estimates based on your city, guest count, and
budget. No more guessing what you're forgetting.

BOOK TRUSTED VENDORS
Browse verified caterers, decorators, photographers, venues, and every
other vendor category you need. Chat directly, compare prices, and book —
all inside the app.

MANAGE YOUR GUEST LIST
Track RSVPs, send digital invites, organize seating, and keep everyone's
meal preferences and gift details in one place. Share your invite over
WhatsApp with one tap.

GATE PASSES & CHECK-IN
For society functions, banquet halls, or office events — issue QR gate
passes for your guests and scan them in at the door. Works even without
signal, so it never lets you down when it matters most.

YOUR EVENT'S PHOTO ALBUM
Every event gets its own shared photo album. Guests can add their photos
too, and face-recognition search helps everyone find their own pictures
from the event in seconds.

FOR VENDORS
List your services, manage bookings, generate invoices, and grow your
business — Utsav's vendor tools handle the operational side so you can
focus on the work.

Whether you're planning a small family gathering or a 500-guest wedding,
Utsav keeps everything — vendors, guests, budget, and memories — in one
place.
```
(1,464 characters — well under the 4000 limit, room to expand later)

## Category

**Primary:** Events
**Secondary (if allowed):** Lifestyle

## Contact details (required)

- Email: *(your support email — use a real, monitored inbox, not a personal one if avoidable)*
- Website: `https://www.theutsavapp.com` (official domain for the app — NOT the same as the marketing site's `theutsavapp.com` deployment; confirm DNS/hosting is pointed at the app's EAS Hosting deployment before submitting; `https://utsav.expo.app` is the still-live fallback if not)
- Privacy policy URL: `https://www.theutsavapp.com/privacy-policy.html` (re-confirm live once the domain is pointed; `https://utsav.expo.app/privacy-policy.html` is confirmed live today)

## Content rating questionnaire — what to expect

Google's IARC questionnaire is filled out interactively in Play Console, but
here's what the honest answers look like based on what the app actually
does, so you're not guessing when you get there:

- Violence, sexual content, profanity: None
- User-generated content: **Yes** — guest lists, chat messages between
  customers and vendors, uploaded event photos. Expect a question about
  whether users can share content with others (yes, guest photo albums)
  and whether there's any moderation (yes — `AlbumModeration.js` lets
  hosts hide/delete photos).
- Shares user location: Only in the loose sense of a manually-typed city
  for event planning — not device GPS/location-tracking. Answer "no" to
  precise location sharing.
- In-app purchases / real-money transactions: **Yes** — vendor bookings
  are paid through Razorpay.

This will very likely land in the "Everyone" or "Everyone 10+" rating tier.

## Data safety section — what to declare

This must match what the app actually collects. Based on the codebase:

| Data type | Collected? | Purpose | Shared with third parties? |
|---|---|---|---|
| Name | Yes | Account, guest list, invites | No |
| Email address | Yes | Account/auth | No |
| Phone number | Yes | Account/auth, guest contact, WhatsApp share | No |
| Physical address | Yes (typed, not GPS) | Event venue, home address for invites | No |
| Photos | Yes | Event albums, face-recognition search, profile/portfolio | Yes — Cloudinary (image hosting), AWS Rekognition (face search) |
| Payment info | Yes | Vendor booking payments | Yes — Razorpay (payment processor; Utsav does not store card numbers) |
| App activity / in-app messages | Yes | Vendor chat, notifications | No |
| Device ID / push token | Yes | Push notifications | No |

Declare data is **encrypted in transit** (Supabase/HTTPS — true for this
stack) and that users **can request account and data deletion** — now true:
`ProfileScreen.js` has a "Delete my account" option (customer accounts;
Settings → Delete my account), 14-day grace period, then permanent removal.
Play Console will ask for the deletion path — answer "in-app" and you can
optionally list `https://www.theutsavapp.com/privacy-policy.html` as a
supporting reference since the policy should describe this process too
(worth adding a line there if it doesn't already).

Note: provider (vendor) accounts don't have self-service deletion yet —
their business listing is referenced by other customers' bookings and
reviews, so deleting it isn't as simple as a customer account. If Play
Console asks whether this applies to *all* accounts, the honest answer is
"customer accounts only, providers can request removal via support" —
worth having a real support contact ready to handle that.

## Screenshots — still needed

Play requires at least 2 phone screenshots (1080×1920 or similar 9:16,
JPEG or 24-bit PNG). These need to come from the actual running app, not
generated — I can help capture these once we have a build to run, but they
can't be mocked up from code alone.

## Assets already generated

- `store-assets/play-store-icon-512.png` — 512×512 hi-res icon
- `store-assets/play-store-feature-graphic-1024x500.png` — feature graphic
