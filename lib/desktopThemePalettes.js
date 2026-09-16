// Ten interchangeable desktop themes — see claude/desktop-themes.md for the
// full design and reasoning. This file is the registry of all 10 palettes'
// "brand" tokens (the colors that actually vary by theme — sidebar, accent,
// page background, body text) plus the small helpers that read/write which
// one is active. lib/desktopTheme.js is the file that actually re-exports
// the ACTIVE palette's values under the same names every existing screen
// already imports — this file never gets imported directly by a screen.
//
// Why a page reload, not live-updating colors: almost every one of the 41
// files that import lib/desktopTheme.js build their StyleSheet.create({...})
// once, at module load, outside any component — not fresh on every render.
// A changed value wouldn't visually reach an already-built style object
// without a fresh load anyway, so switching themes just does that reload on
// purpose, the same "pick a theme, the page refreshes with it" pattern most
// websites use for a full look change. No screen file needs to change for
// this to work.
//
// Status colors (OK/WAIT/NO/UNDO + their _BG/_BORDER variants) are NOT part
// of this registry — they mean something specific (confirmed/pending/
// declined/undo) everywhere else in the app and stay fixed across every
// theme; lib/desktopTheme.js keeps exporting those as plain literals,
// unchanged by any of this.
export const DESKTOP_THEME_PALETTES = {
  // Unchanged from what lib/desktopTheme.js always exported — every
  // account that exists before this feature ships gets backfilled to this
  // one (see the migration), so nobody's screen changes color on its own.
  toran: {
    label: 'Toran',
    maroon: '#6E1A2E', maroonDeep: '#2E0713', gold: '#D4A03C', goldSoft: '#F4C563', eyebrow: '#B57A16',
    cream: '#FBF6EC', card: '#FFFFFF', line: '#EFE4D2', lineSoft: '#F7F0E2', muted: '#93816A', text: '#332419',
  },
  // The new default for a brand-new signup — plain and minimal, per
  // Anish's ask to keep the very first look simple.
  simple: {
    label: 'Simple',
    maroon: '#3A3F47', maroonDeep: '#24272C', gold: '#C08A3E', goldSoft: '#D9AD6E', eyebrow: '#8A6A3E',
    cream: '#FAFAF9', card: '#FFFFFF', line: '#E7E5E2', lineSoft: '#F1F0EE', muted: '#7A7670', text: '#2B2A28',
  },
  sapphire: {
    label: 'Sapphire',
    maroon: '#1B2A4A', maroonDeep: '#0C1526', gold: '#7FA8C9', goldSoft: '#A9C6DE', eyebrow: '#3E6690',
    cream: '#F5F8FB', card: '#FFFFFF', line: '#DCE6EF', lineSoft: '#EAF1F6', muted: '#6B7C8F', text: '#1E2733',
  },
  emerald: {
    label: 'Emerald',
    maroon: '#1F4D3A', maroonDeep: '#0E2A1E', gold: '#C7A046', goldSoft: '#E0C578', eyebrow: '#8A6B1E',
    cream: '#F5F9F4', card: '#FFFFFF', line: '#DCEAE0', lineSoft: '#EBF3EC', muted: '#6E8377', text: '#1D2E24',
  },
  blush: {
    label: 'Blush',
    maroon: '#8A3B54', maroonDeep: '#4E1E2E', gold: '#D9A05C', goldSoft: '#EFC48D', eyebrow: '#A6683A',
    cream: '#FDF4F3', card: '#FFFFFF', line: '#F2DEDE', lineSoft: '#F8EBEA', muted: '#9C7B7E', text: '#3A2429',
  },
  sandstone: {
    label: 'Sandstone',
    maroon: '#8A4A2E', maroonDeep: '#4E2515', gold: '#C77B45', goldSoft: '#E3A472', eyebrow: '#9C5B26',
    cream: '#FBF4EC', card: '#FFFFFF', line: '#EEDDCB', lineSoft: '#F6ECE1', muted: '#977C68', text: '#3A2A1E',
  },
  lavender: {
    label: 'Lavender',
    maroon: '#4C3B70', maroonDeep: '#281F3D', gold: '#A794C9', goldSoft: '#C7B9E0', eyebrow: '#6A4F94',
    cream: '#F7F5FA', card: '#FFFFFF', line: '#E5DFEF', lineSoft: '#F0ECF6', muted: '#83779A', text: '#2A2438',
  },
  ocean: {
    label: 'Ocean',
    maroon: '#144B52', maroonDeep: '#0A2A2E', gold: '#7FC2AE', goldSoft: '#A9DBCA', eyebrow: '#2E7A6C',
    cream: '#F2F9F8', card: '#FFFFFF', line: '#D8ECE8', lineSoft: '#E9F4F2', muted: '#5E8783', text: '#17332F',
  },
  ruby: {
    label: 'Ruby',
    maroon: '#7A1420', maroonDeep: '#3D0810', gold: '#D98B6E', goldSoft: '#EBB49E', eyebrow: '#A3502F',
    cream: '#FBF3F1', card: '#FFFFFF', line: '#F0DDD8', lineSoft: '#F7EBE8', muted: '#97756F', text: '#35201C',
  },
  slate: {
    label: 'Slate',
    maroon: '#33414D', maroonDeep: '#1B242C', gold: '#B79A6A', goldSoft: '#D3BD94', eyebrow: '#7C6740',
    cream: '#F6F7F8', card: '#FFFFFF', line: '#E1E5E8', lineSoft: '#EEF1F3', muted: '#78838C', text: '#232A30',
  },
};

export const DESKTOP_THEME_IDS = Object.keys(DESKTOP_THEME_PALETTES);
export const DEFAULT_DESKTOP_THEME = 'toran';

const CACHE_KEY = 'utsav_desktop_theme';

function hasLocalStorage() {
  return typeof window !== 'undefined' && !!window.localStorage;
}

// Read synchronously, at module-eval time — this is what lets
// lib/desktopTheme.js's top-level exports pick the right palette on the
// very first render, before any Supabase call could possibly resolve.
// Falls back to 'toran' (today's real global behavior) whenever there's no
// cached value yet — a brand-new browser/incognito session, or any native
// build where this feature doesn't apply at all.
export function getCachedDesktopThemeId() {
  if (!hasLocalStorage()) return DEFAULT_DESKTOP_THEME;
  try {
    const cached = window.localStorage.getItem(CACHE_KEY);
    return cached && DESKTOP_THEME_PALETTES[cached] ? cached : DEFAULT_DESKTOP_THEME;
  } catch (err) {
    // Private-browsing/storage-blocked — never let this break the page.
    return DEFAULT_DESKTOP_THEME;
  }
}

// Called once auth resolves and the host's real users.desktop_theme comes
// back from Supabase — keeps the cache in sync so the NEXT page load (a
// fresh tab, a bookmark, a reload) picks the right theme immediately
// without waiting on that fetch again. Deliberately does NOT reload the
// page itself (that would fight the user mid-session for a value that's
// usually already correct) — only applyDesktopTheme(), the explicit
// "I picked a new theme" action below, does that.
export function syncCachedDesktopThemeId(themeId) {
  if (!hasLocalStorage() || !DESKTOP_THEME_PALETTES[themeId]) return;
  try {
    window.localStorage.setItem(CACHE_KEY, themeId);
  } catch (err) {
    // Ignore — worst case, the next load re-fetches from Supabase instead.
  }
}

// The explicit "host picked a new theme" action — saves it to their
// account, updates the cache, then reloads so every one of the 41 files
// reading lib/desktopTheme.js's exports picks up the new palette. Caller
// (ProfileScreen.js's picker) is expected to have already confirmed the
// Supabase write succeeded before calling this.
export function applyDesktopTheme(themeId) {
  if (!DESKTOP_THEME_PALETTES[themeId]) return;
  syncCachedDesktopThemeId(themeId);
  if (typeof window !== 'undefined' && window.location) {
    window.location.reload();
  }
}
