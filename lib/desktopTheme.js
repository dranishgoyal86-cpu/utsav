// Wave 13 — single source of truth for the desktop shell's own chrome
// palette, extracted out of DesktopEventShell.js/GuestTable.js so every
// new desktop screen (gifts, checklist, invite designer, RSVP dashboard)
// pulls the same warm maroon/cream/gold language instead of each
// re-deriving its own close-but-not-identical set — exactly the kind of
// drift this whole effort's colour-sourcing rule exists to prevent.
import { inviteThemes } from './inviteThemes';

// toran.gradient is the real two-stop maroon gradient ToranCoverCard.js
// already uses for its own card background — reused here, not a second
// "shell maroon" literal.
export const [MAROON, MAROON_DEEP] = inviteThemes.toran.gradient; // ['#6E1A2E', '#2E0713']
export const GOLD = inviteThemes.toran.colors.accent; // '#D4A03C'
// No existing token is a lighter gold — this one literal (matching the
// approved guest-list reference's own --gold-soft) stays undocumented-
// in-inviteThemes on purpose, same shell-chrome exception as MAROON_DEEP.
export const GOLD_SOFT = '#F4C563';
// The small-caps "eyebrow" label colour used above every page heading
// across all five desktop screens — was a raw '#B57A16' literal repeated
// in each file until a copy/paste mistake building this one nearly drifted
// it; centralized here instead of relying on every file getting it right.
export const EYEBROW = '#B57A16';
export const CREAM = '#FBF6EC';
export const CARD = '#FFFFFF';
export const LINE = '#EFE4D2';
export const LINE_SOFT = '#F7F0E2';
export const MUTED = '#93816A';
export const TEXT = '#332419';
export const OK = '#3E7D45', OK_BG = '#EAF3E9';
export const WAIT = '#BD7A1E', WAIT_BG = '#FBF0DC';
export const NO = '#B3453A', NO_BG = '#FBEAE7';
