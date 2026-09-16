// Wave 13 — single source of truth for the desktop shell's own chrome
// palette, extracted out of DesktopEventShell.js/GuestTable.js so every
// new desktop screen (gifts, checklist, invite designer, RSVP dashboard)
// pulls the same warm maroon/cream/gold language instead of each
// re-deriving its own close-but-not-identical set — exactly the kind of
// drift this whole effort's colour-sourcing rule exists to prevent.
//
// Ten interchangeable desktop themes (Sept 16) — see
// claude/desktop-themes.md for the full design. The 11 "brand" tokens below
// (MAROON through TEXT) now come from whichever palette
// lib/desktopThemePalettes.js says is active, instead of being hardcoded
// literals — but every name below is EXACTLY what it always was, so none
// of the 41 files that import from this file needed to change. Switching
// themes reloads the page (applyDesktopTheme(), called from
// ProfileScreen.js's picker) rather than trying to live-update colors —
// see that file's own comment for why that's the right call here, not a
// shortcut.
import { DESKTOP_THEME_PALETTES, DEFAULT_DESKTOP_THEME, getCachedDesktopThemeId } from './desktopThemePalettes';

const activePalette = DESKTOP_THEME_PALETTES[getCachedDesktopThemeId()] || DESKTOP_THEME_PALETTES[DEFAULT_DESKTOP_THEME];

export const MAROON = activePalette.maroon;
export const MAROON_DEEP = activePalette.maroonDeep;
export const GOLD = activePalette.gold;
// No existing token is a lighter gold — this one literal (matching the
// approved guest-list reference's own --gold-soft) stays undocumented-
// in-inviteThemes on purpose, same shell-chrome exception as MAROON_DEEP.
export const GOLD_SOFT = activePalette.goldSoft;
// The small-caps "eyebrow" label colour used above every page heading
// across all five desktop screens — was a raw '#B57A16' literal repeated
// in each file until a copy/paste mistake building this one nearly drifted
// it; centralized here instead of relying on every file getting it right.
export const EYEBROW = activePalette.eyebrow;
export const CREAM = activePalette.cream;
export const CARD = activePalette.card;
export const LINE = activePalette.line;
export const LINE_SOFT = activePalette.lineSoft;
export const MUTED = activePalette.muted;
export const TEXT = activePalette.text;

// Status colors mean something specific (confirmed/pending/declined/undo)
// everywhere else in the app too — fixed across every theme on purpose,
// not part of the palette registry above.
export const OK = '#3E7D45', OK_BG = '#EAF3E9';
export const WAIT = '#BD7A1E', WAIT_BG = '#FBF0DC';
export const NO = '#B3453A', NO_BG = '#FBEAE7';
// The one non-warm accent in this palette, deliberately: matches
// SwipeableRow's own existing app-wide blue "undo" convention (Phase 3's
// actionColor/actionIcon variant, e.g. BlockedProviders.js's real mobile
// swipe action) -- reused verbatim here for a desktop "Undo" button rather
// than re-deriving a warm-palette equivalent for a semantic (not
// decorative) colour that already means one specific thing everywhere
// else in this app.
export const UNDO = '#3B82F6', UNDO_BG = '#EFF6FF', UNDO_BORDER = '#BFDBFE';
