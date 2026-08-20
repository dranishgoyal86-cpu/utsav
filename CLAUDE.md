# Utsav App — Claude Code Context

## Stack
- React Native (Expo), Supabase, React web admin
- npm install --legacy-peer-deps (always)
- Create files via VS Code right-click (not terminal touch — encoding issues)

## Supabase Rules
- Never use joins — always run two separate queries and combine in JS
- 14 RLS-enabled tables, 10% commission model

## UI Rules
- Apple/Notion aesthetic, ThemeContext light/dark, amber accent #E8A020
- Pass useTheme() as a prop, not inside non-component functions
- Custom horizontal ScrollView date picker (no @react-native-community/datetimepicker)

## Current Blockers
- EAS development build needed to test on native (iOS/Android): Razorpay native checkout (`react-native-razorpay`), real push notifications, and native voice input (`expo-speech-recognition`) are all coded and wired up, but none of them run in Expo Go — they need a dev-client build to actually test on a device. Web equivalents (Razorpay checkout.js, browser SpeechRecognition) work today without a rebuild.
- Seeder debugging (Supabase schema alignment with OSM Overpass data)
- QR check-in (`screens/customer/CheckInScanner.js`) is coded and wired using `expo-camera` (already installed, already proven live in `FaceScan.js`) — unlike Razorpay/speech-recognition this should run in Expo Go without an EAS dev-client rebuild, but has not been verified with a real physical device scanning a real printed pass in this environment (no device available). QR generation/printing (`GatePass.js`) works today with zero blockers.
- SMS OTP provider: `ClaimVendorFlow.js`'s mobile-number verification step (`supabase.auth.signInWithOtp({phone})` / `verifyOtp(...)`) is fully coded and wired, but Supabase Auth has no SMS provider configured (`supabase/config.toml` has no `[auth]` phone section) — needs a real Twilio/MSG91/Vonage/etc. account + API keys set in the Supabase dashboard before real texts can send. Build-complete, credential-blocked — same shape as the (now-resolved) Razorpay credentials issue was. Email OTP (same screen, verifying the vendor's email) works today with zero new credentials — Supabase's built-in email sending just needs the "Change Email Address" template edited in the dashboard to include `{{ .Token }}` so it sends a 6-digit code instead of a confirmation link. **Currently held**: `ClaimVendorFlow.js` has `const OTP_ENABLED = false` at the top of the file — while held, signup uses a plain email+password 'account' step (`createAccountNoOtp()`, real `supabase.auth.signUp()`, verified working end-to-end) instead of phone-otp/email-otp/password. All the OTP code stays in the file untouched; flip the flag back to `true` once a real SMS provider is configured — it's a must-have before the app goes live, not a removed feature.

## App Scope Already Built
[list what's done so it doesn't rebuild things]