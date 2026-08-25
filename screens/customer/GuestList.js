import { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, Modal, ActivityIndicator, ScrollView, Share, Platform, Image, ImageBackground, Linking, KeyboardAvoidingView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import LocationAutocomplete from '../../components/LocationAutocomplete';
import SwipeableRow from '../../components/SwipeableRow';
import GuestDetailModal, { timeAgo } from '../../components/GuestDetailModal';
// Deliberately NOT importing EVENT_TYPES from planLogic.js here — that now
// reflects the eventTaxonomy.js 10-category system used by the Plan flow,
// which doesn't line up with this file's own TEMPLATE_CATALOG keys (a
// smaller, purpose-built set of *visual invite styles*, not the full event
// taxonomy — trying to give every one of ~110 taxonomy sub-events its own
// invite templates would be wildly disproportionate to the actual need).
const INVITE_STYLE_TYPES = [
  { id: 'wedding', label: 'Wedding', icon: '💍' },
  { id: 'birthday', label: 'Birthday', icon: '🎂' },
  { id: 'engagement', label: 'Engagement', icon: '💑' },
  { id: 'corporate', label: 'Corporate', icon: '💼' },
  { id: 'diwali', label: 'Diwali Party', icon: '🪔' },
  { id: 'babyshower', label: 'Baby Shower', icon: '🍼' },
  { id: 'anniversary', label: 'Anniversary', icon: '❤️' },
  { id: 'other', label: 'Other', icon: '🎉' },
];
import { callEdgeFunction, renameEvent, showAlert, confirmDestructive, confirmAction, deleteEventCascade, toWhatsappNumber, resolveGuestPartySize, getSignedGuestDocumentUrl } from '../../helpers';
import { buildHotelGuestListText, buildHotelGuestListPdfHtml } from '../../hotelGuestListTemplate';
import AppHeader from '../../components/AppHeader';
import { resolveVenue, resolveDietary, formatTimeLabel } from '../../lib/eventContext';
import { PUBLIC_WEB_URL } from '../../config';
import { useCapabilities } from '../../hooks/useCapabilities';
import { isEnabled } from '../../lib/capabilities';
import { buildPassCardHtml } from '../../gatePassTemplate';
import { registerTourTarget } from '../../lib/tourTargets';
import { useTour } from '../../hooks/useTour';
import CoachMarkTour from '../../components/CoachMarkTour';

// First-time-on-this-screen tour — 4 targets. All are unconditional except
// the Gate Pass chip: confirmed via Step 1's investigation that "Functions"
// is ALWAYS rendered (its label just varies between "+ Functions" and
// "Functions (N)" depending on whether any exist — not conditionally
// mounted at all, contrary to this task's original "if defined" framing),
// while the Gate Pass chip genuinely only renders when showGatePass is true
// (entryControl resolves to something other than 'no_entry_control') — the
// engine's own built-in "unmeasurable step gets skipped" behavior handles
// that automatically, no special-casing needed here.
const GUESTLIST_TOUR_STEPS = [
  {
    key: 'add-guest',
    target: 'guestlist-add-btn',
    title: 'Add your guests',
    description: 'Tap here to add a guest one at a time, or import a whole list at once.',
  },
  {
    key: 'invite',
    target: 'guestlist-invite-cta',
    title: 'Design & share your invite',
    description: 'Create a real invite card in seconds — pick a style, add your details, and share it straight to WhatsApp.',
  },
  {
    key: 'functions',
    target: 'guestlist-functions-chip',
    title: 'Multi-day wedding?',
    description: 'Group guests by function — Haldi, Sangeet, Reception — so each one gets exactly the right guest list.',
  },
  {
    key: 'gatepass',
    target: 'guestlist-gatepass-chip',
    title: 'Gate passes',
    description: 'Issue QR passes so your gate knows exactly who to expect — this only appears for venues that need entry management.',
  },
];
import {
  ArrowLeft, Plus, X, Trash, PaperPlaneTilt, Palette, Users, AddressBook, Check,
  Image as ImageIcon, ClipboardText, CaretLeft, CaretRight, MagnifyingGlass,
  DotsThreeVertical, Star, ForkKnife, Gift, Table, QrCode, UserPlus, ChartBar
} from 'phosphor-react-native';

// Native-only — the contact book, image picking/pasting, and PDF export have
// no meaningful web equivalent. Every screen file is statically imported by
// App.js at startup, so an unconditional top-level import here would try to
// load these native modules as soon as the app launches, not just when this
// screen opens.
let Sharing, Contacts, ImagePicker, Print, ClipboardAPI, ViewShot, MediaLibrary, NativeShare, FileSystem;
if (Platform.OS !== 'web') {
  Sharing = require('expo-sharing');
  Contacts = require('expo-contacts/legacy');
  ImagePicker = require('expo-image-picker');
  Print = require('expo-print');
  ViewShot = require('react-native-view-shot').default;
  MediaLibrary = require('expo-media-library');
  FileSystem = require('expo-file-system/legacy');
  // react-native-share, not Expo's Sharing/RN's own Share — those can't
  // combine an image and a text message in one Android intent (Android's
  // build of RN's core Share only supports `message`, not `url`; Expo's
  // Sharing.shareAsync only takes a file, no text at all). This library
  // constructs a real combined intent, so the invite image and the RSVP +
  // venue links go out as one share action instead of two.
  NativeShare = require('react-native-share').default;
  // expo-clipboard's image-paste support is newer than the other native
  // modules here — guard it separately so a stale Expo Go build missing it
  // can't take the whole app down on launch (GuestList is statically
  // imported by App.js, so this require runs at startup either way).
  try {
    ClipboardAPI = require('expo-clipboard');
  } catch (err) {
    console.log('expo-clipboard unavailable:', err.message);
  }
}

const RSVP = {
  pending: { label: 'Pending', color: '#9E9E9E', bg: '#9E9E9E22' },
  yes:     { label: 'Coming',  color: '#4CAF50', bg: '#4CAF5022' },
  no:      { label: 'Declined',color: '#F44336', bg: '#F4433622' },
  maybe:   { label: 'Maybe',   color: '#FF9800', bg: '#FF980022' },
};

// Guests set this via the public RSVP form (RSVPScreen.js) — "any" is the
// default and not worth a badge; only shown when they picked something specific.
const FOOD_PREF_LABELS = {
  veg: '🥦 Veg', nonveg: '🍗 Non-veg', jain: '🙏 Jain',
};

// Suggested tags — quick-pick starting points. Hosts can also type their own
// (e.g. a specific city or community name), since "tag" here is really just
// a free-text grouping label, not a fixed enum.
const SUGGESTED_TAGS = ['Family', 'Relatives', 'Friends', 'College', 'Work', 'Neighbors', 'VIP'];

// Templates grouped by event type — at least 5 per type. `motif` is a strip
// of emoji rendered large at the top of the card in place of a flat "✦ ✦ ✦"
// ornament — the closest thing to themed illustration achievable without an
// image-generation or stock-art pipeline (there isn't one in this project).
// Birthday and baby shower templates carry a `variants` map (boy/girl/
// neutral) since those are what hosts most often want a gendered palette
// for; every other type stays single-palette per template.
const TEMPLATE_CATALOG = {
  wedding: [
    { id: 'wedding-royal', name: 'Royal', bg: '#1A1225', accent: '#D4AF37', text: '#FFF8E7', motif: ['💍', '✨', '👰', '🤵', '✨', '💍'] },
    { id: 'wedding-ivory', name: 'Ivory Minimal', bg: '#F7F3EE', accent: '#B08968', text: '#2D2A26', motif: ['🕊️', '🤍', '🕊️'] },
    { id: 'wedding-floral', name: 'Floral Blush', bg: '#FBEAF0', accent: '#C9779A', text: '#4A1F30', motif: ['🌸', '🌷', '💐', '🌷', '🌸'] },
    { id: 'wedding-mandap', name: 'Mandap Gold', bg: '#2A1608', accent: '#E8B84B', text: '#FFF1D6', motif: ['🪔', '💐', '🕉️', '💐', '🪔'] },
    { id: 'wedding-midnight', name: 'Midnight Rose', bg: '#160B1E', accent: '#E39FC2', text: '#FBEAF3', motif: ['🌹', '✨', '🌙', '✨', '🌹'] },
  ],
  birthday: [
    {
      id: 'birthday-celebration', name: 'Celebration', hasVariant: true,
      variants: {
        boy: { bg: '#12263A', accent: '#4FC3F7', text: '#EAF6FF', motif: ['🎈', '🚗', '🎉', '🚗', '🎈'] },
        girl: { bg: '#3A1230', accent: '#F48FB1', text: '#FFF0F6', motif: ['🦋', '🎀', '🎉', '🎀', '🦋'] },
        neutral: { bg: '#7B1E3C', accent: '#FFC93C', text: '#FFF5E1', motif: ['🎈', '🎉', '🎂', '🎉', '🎈'] },
      },
    },
    {
      id: 'birthday-confetti', name: 'Confetti Pop', hasVariant: true,
      variants: {
        boy: { bg: '#0E3B2E', accent: '#5FD8A8', text: '#EAFFF6', motif: ['🚀', '⭐', '🎊', '⭐', '🚀'] },
        girl: { bg: '#3D1436', accent: '#F2A6D6', text: '#FFF0FA', motif: ['🌈', '⭐', '🎊', '⭐', '🌈'] },
        neutral: { bg: '#1F1B3A', accent: '#8C7CF0', text: '#F1EEFF', motif: ['🎊', '🎉', '🎁', '🎉', '🎊'] },
      },
    },
    {
      id: 'birthday-pastel', name: 'Pastel Dream', hasVariant: true,
      variants: {
        boy: { bg: '#EAF4FB', accent: '#5B9BD5', text: '#1B3A52', motif: ['🧸', '🎈', '🧸'] },
        girl: { bg: '#FDEDF3', accent: '#E38FB5', text: '#5A1F38', motif: ['🦄', '🎀', '🦄'] },
        neutral: { bg: '#FFF6E5', accent: '#F0A93F', text: '#4A3410', motif: ['🎂', '🕯️', '🎂'] },
      },
    },
    { id: 'birthday-golden', name: 'Golden Number', bg: '#1C1408', accent: '#E8B84B', text: '#FFF3D6', motif: ['✨', '🎂', '🥳', '🎂', '✨'] },
    { id: 'birthday-tropical', name: 'Tropical Bash', bg: '#0B3D2E', accent: '#FFC93C', text: '#F5FFF0', motif: ['🌴', '🍍', '🎉', '🍍', '🌴'] },
  ],
  engagement: [
    { id: 'engagement-rose', name: 'Rose', bg: '#2B0F1A', accent: '#E8A0BE', text: '#FFEAF2', motif: ['💐', '💍', '💐'] },
    { id: 'engagement-garden', name: 'Garden', bg: '#1E3D2F', accent: '#A7D7A9', text: '#F0FFF4', motif: ['🌿', '💍', '🌿'] },
    { id: 'engagement-blush', name: 'Blush Ring', bg: '#FBEAF0', accent: '#C9779A', text: '#4A1F30', motif: ['💕', '💍', '💕'] },
    { id: 'engagement-starlit', name: 'Starlit', bg: '#141034', accent: '#B8A6F0', text: '#F1EEFF', motif: ['✨', '💍', '🌙', '💍', '✨'] },
    { id: 'engagement-gold', name: 'Gilded', bg: '#241205', accent: '#E8B84B', text: '#FFF1D6', motif: ['💍', '✨', '🥂', '✨', '💍'] },
  ],
  corporate: [
    { id: 'corporate-navy', name: 'Navy', bg: '#0F1B2D', accent: '#5B8DEF', text: '#EAF0FF', motif: ['💼', '📈', '🥂'] },
    { id: 'corporate-slate', name: 'Slate', bg: '#F4F5F7', accent: '#37474F', text: '#1C2126', motif: ['🏢', '🤝', '🏢'] },
    { id: 'corporate-emerald', name: 'Emerald', bg: '#0B2E23', accent: '#4FD8A0', text: '#EAFFF6', motif: ['🌟', '🚀', '🌟'] },
    { id: 'corporate-crimson', name: 'Crimson', bg: '#2B0E12', accent: '#E85D5D', text: '#FFEEEE', motif: ['🎯', '🏆', '🎯'] },
    { id: 'corporate-minimal', name: 'Paper White', bg: '#FFFFFF', accent: '#1A1A1A', text: '#1A1A1A', motif: ['—', '✦', '—'] },
  ],
  diwali: [
    { id: 'diwali-festive', name: 'Festive', bg: '#7B1E3C', accent: '#FFC93C', text: '#FFF5E1', motif: ['🪔', '✨', '🪔', '✨', '🪔'] },
    { id: 'diwali-diya', name: 'Golden Diya', bg: '#3B1D0A', accent: '#FFB100', text: '#FFF3D6', motif: ['🪔', '🎆', '🪔'] },
    { id: 'diwali-royal', name: 'Royal Rangoli', bg: '#1A1225', accent: '#E8B84B', text: '#FFF8E7', motif: ['🌸', '🪔', '🌸', '🪔', '🌸'] },
    { id: 'diwali-crimson', name: 'Crimson Lights', bg: '#2B0E12', accent: '#FFC93C', text: '#FFF5E1', motif: ['🎇', '🪔', '🎇'] },
    { id: 'diwali-emerald', name: 'Emerald Glow', bg: '#0B2E23', accent: '#FFD666', text: '#F5FFF0', motif: ['✨', '🪔', '🕉️', '🪔', '✨'] },
  ],
  babyshower: [
    {
      id: 'babyshower-littleone', name: 'Little One', hasVariant: true,
      variants: {
        boy: { bg: '#0F2A3D', accent: '#7EC8E3', text: '#EAF7FF', motif: ['🍼', '👶', '🍼'] },
        girl: { bg: '#3D1B2E', accent: '#F2A6C8', text: '#FFF0F6', motif: ['🎀', '👶', '🎀'] },
        neutral: { bg: '#2E3D1F', accent: '#C7E27A', text: '#F5FFEA', motif: ['🧸', '👶', '🧸'] },
      },
    },
    {
      id: 'babyshower-clouds', name: 'Soft Clouds', hasVariant: true,
      variants: {
        boy: { bg: '#EAF4FB', accent: '#5B9BD5', text: '#1B3A52', motif: ['☁️', '⭐', '☁️'] },
        girl: { bg: '#FDEDF3', accent: '#E38FB5', text: '#5A1F38', motif: ['☁️', '🌸', '☁️'] },
        neutral: { bg: '#FFF6E5', accent: '#F0A93F', text: '#4A3410', motif: ['🌈', '☁️', '🌈'] },
      },
    },
    { id: 'babyshower-stork', name: 'Stork Delivery', bg: '#EAF4FB', accent: '#4FA0D8', text: '#1B3A52', motif: ['🕊️', '🍼', '🕊️'] },
    { id: 'babyshower-blossom', name: 'Blossom', bg: '#FDEDF3', accent: '#E38FB5', text: '#5A1F38', motif: ['🌸', '👶', '🌸'] },
    { id: 'babyshower-mint', name: 'Mint Sweet', bg: '#EAF7F0', accent: '#4FBF8B', text: '#12362A', motif: ['🍃', '🧸', '🍃'] },
  ],
  anniversary: [
    { id: 'anniversary-garden', name: 'Garden Romance', bg: '#1E3D2F', accent: '#A7D7A9', text: '#F0FFF4', motif: ['🌿', '💞', '🌿'] },
    { id: 'anniversary-royal', name: 'Royal', bg: '#1A1225', accent: '#D4AF37', text: '#FFF8E7', motif: ['💍', '✨', '💍'] },
    { id: 'anniversary-rose', name: 'Golden Rose', bg: '#2B0F1A', accent: '#E8A0BE', text: '#FFEAF2', motif: ['🌹', '💛', '🌹'] },
    { id: 'anniversary-candlelight', name: 'Candlelight', bg: '#241205', accent: '#E8B84B', text: '#FFF1D6', motif: ['🕯️', '💑', '🕯️'] },
    { id: 'anniversary-starlit', name: 'Starlit Vows', bg: '#141034', accent: '#B8A6F0', text: '#F1EEFF', motif: ['✨', '💑', '🌙', '💑', '✨'] },
  ],
  other: [
    { id: 'other-royal', name: 'Royal', bg: '#1A1225', accent: '#D4AF37', text: '#FFF8E7', motif: ['✦', '✧', '✦'] },
    { id: 'other-festive', name: 'Festive', bg: '#7B1E3C', accent: '#FFC93C', text: '#FFF5E1', motif: ['🎊', '🎉', '🎊'] },
    { id: 'other-minimal', name: 'Minimal', bg: '#F7F3EE', accent: '#B08968', text: '#2D2A26', motif: ['—', '✦', '—'] },
    { id: 'other-garden', name: 'Garden', bg: '#1E3D2F', accent: '#A7D7A9', text: '#F0FFF4', motif: ['🌿', '✧', '🌿'] },
    { id: 'other-starlit', name: 'Starlit', bg: '#141034', accent: '#B8A6F0', text: '#F1EEFF', motif: ['✨', '✧', '✨'] },
  ],
};

// ── Message variety: a small hand-written pool of opener/middle/closer
// phrases per event type, recombined so the actual number of distinct
// messages is in the hundreds without hand-authoring hundreds of them.
// {name}/{names} placeholders get filled from the conditional name fields
// where the event type collects them (child's name, couple's names, etc.).
const MESSAGE_PARTS = {
  wedding: {
    openers: ['With hearts full of love,', 'Together with our families,', 'With immense joy,', 'Surrounded by blessings,', "With God's grace,", 'Hand in hand,', 'As two souls become one,', 'With everlasting love,', 'Filled with gratitude,', 'On this beautiful journey,'],
    middles: ['we invite you to witness {names} unite in marriage', 'we request the honour of your presence at {names} wedding', 'we joyfully invite you to celebrate {names} wedding', 'we would be delighted to have you join {names} as they say "I do"', 'we invite you to share in {names} happiness', 'we welcome you to {names} wedding celebration'],
    closers: ['Your presence will make our day complete.', 'We look forward to celebrating with you.', 'Come shower the couple with your blessings.', 'Your love and support mean the world to us.', "Let's celebrate love together!", "We can't wait to see you there.", 'Join us for an unforgettable celebration.'],
  },
  birthday: {
    openers: ["It's time to celebrate!", 'Get ready for a party!', 'The countdown is over!', 'Come one, come all!', 'A special day is here!', 'Balloons are up, cake is ready!', 'The celebration begins!'],
    middles: ['Join us as {name} turns a year older', "come celebrate {name}'s big day", "we're throwing a party for {name}", "it's {name}'s birthday bash", "help us celebrate {name} in style"],
    closers: ['Come for the cake, stay for the fun!', "There'll be games, food and lots of laughter.", "Your presence is the best gift we could ask for.", "Can't wait to celebrate with you!", 'Bring your dancing shoes!', 'See you there for cake and celebrations!'],
  },
  engagement: {
    openers: ['Two hearts, one promise.', 'Love is in the air!', 'A new chapter begins,', 'With joy and excitement,', 'Surrounded by love,'],
    middles: ['join us as {names} get engaged', 'we celebrate the engagement of {names}', "come witness {names} beginning of forever", "we invite you to {names} engagement ceremony"],
    closers: ['Join us as we celebrate the beginning of forever.', 'We look forward to seeing you there!', 'Your blessings mean so much to us.', "Come celebrate love with us!"],
  },
  corporate: {
    openers: ["You're invited", 'We cordially invite you', 'Join us', "It's our pleasure to invite you", 'On behalf of our team, we invite you'],
    middles: ['to an evening of networking, insights, and celebration', 'to be part of this milestone occasion', 'to join us as we celebrate our journey', 'for an evening celebrating our achievements together'],
    closers: ['We look forward to your presence.', 'Your presence would mean a lot to us.', "See you there!", 'Looking forward to celebrating with you.'],
  },
  diwali: {
    openers: ['Lights, laughter, and celebration await!', 'May this Diwali bring joy and prosperity.', 'The festival of lights is here!', 'Diyas are lit, hearts are full,'],
    middles: ['join us for an evening to remember', 'come celebrate Diwali with us', 'we invite you to our Diwali celebration', 'let\'s light up the season together'],
    closers: ['Wishing you light, joy and prosperity.', 'See you for sweets, lights and celebration!', "Can't wait to celebrate with you.", 'Happy Diwali — join us for the festivities!'],
  },
  babyshower: {
    openers: ['A little one is on the way!', 'Sweet beginnings are here,', 'With love and excitement,', 'A bundle of joy is coming soon!'],
    middles: ['join us for an afternoon of joy and blessings', "come celebrate {name}'s upcoming arrival", 'we invite you to a baby shower full of love', 'help us welcome the newest member of our family'],
    closers: ['Your blessings mean the world to us.', 'Come shower us with love!', "Can't wait to celebrate with you.", 'See you for an afternoon of joy!'],
  },
  anniversary: {
    openers: ['Celebrating a beautiful journey of love,', 'Years of love, laughter and togetherness,', 'With hearts full of gratitude,', 'Another year of love to celebrate,'],
    middles: ['join us as {names} celebrate their anniversary', 'come celebrate the love story of {names}', 'we invite you to toast to {names} milestone', "celebrate this special day with {names}"],
    closers: ['Join us for this special milestone.', 'Your presence would mean so much to us.', "Come raise a toast with us!", "Can't wait to celebrate with you."],
  },
  other: {
    openers: ['With great joy,', "You're invited!", 'Come celebrate with us,', 'With warm regards,'],
    middles: ['we invite you to celebrate with us', 'we would love for you to join us', 'we invite you to this special occasion', "we'd be honoured to have you join us"],
    closers: ['Your presence will make our day complete.', 'We look forward to celebrating with you.', "Can't wait to see you there.", 'Join us for an unforgettable celebration.'],
  },
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Fills {name}/{names} placeholders from whatever conditional name fields
// the event type collected (see NAME_FIELDS below) — falls back to leaving
// a friendly generic phrase if nothing's been typed in yet.
function fillNames(text, page) {
  const single = (page.subjectName || '').trim();
  const pair = [page.partner1Name, page.partner2Name].map(n => (n || '').trim()).filter(Boolean).join(' & ');
  return text
    .replace('{names}', pair || 'the happy couple')
    .replace('{name}', single || 'us');
}

function generateMessage(eventType, page) {
  const parts = MESSAGE_PARTS[eventType] || MESSAGE_PARTS.other;
  const raw = `${pick(parts.openers)} ${fillNames(pick(parts.middles), page)}. ${pick(parts.closers)}`;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// Per-field sync bookkeeping for the three plan-linked invite fields tracked
// via updateActivePage (date/dietary/rsvpBy). `autoFilled: true` = still
// linked to the plan, silently takes fresh values. `autoFilled: false` =
// host edited it, frozen until they choose to re-sync (see the drift-nudge
// effect). Venue has no autoFilled flag — it's the one field the invite
// writes back to events.venue itself (persistVenue), so it's never
// "auto-filled" in this sense, only ever checked for drift caused by some
// *other* screen changing the venue.
function freshFieldMeta() {
  return {
    date: { autoFilled: true, snapshot: '' },
    time: { autoFilled: true, snapshot: '' },
    venue: { snapshot: '' },
    dietary: { autoFilled: true, snapshot: '' },
    rsvpBy: { autoFilled: true, snapshot: '' },
    title: { autoFilled: true, snapshot: '' },
  };
}
const TRACKED_FIELDS = ['date', 'time', 'dietary', 'rsvpBy', 'title']; // venue excluded — handled by persistVenue instead

// Which conditional name field(s) an event type needs, and how to label
// them — birthdays/baby showers ask for one name, weddings/engagements/
// anniversaries ask for two. Types not listed here need neither.
const NAME_FIELDS = {
  birthday: [{ key: 'subjectName', label: "Birthday person's name", ph: 'e.g. Adhira' }],
  babyshower: [{ key: 'subjectName', label: "Guest of honour's name (if known)", ph: 'e.g. Baby Mehta' }],
  wedding: [
    { key: 'partner1Name', label: "Bride's name", ph: 'e.g. Riya' },
    { key: 'partner2Name', label: "Groom's name", ph: 'e.g. Arjun' },
  ],
  engagement: [
    { key: 'partner1Name', label: "Partner 1's name", ph: 'e.g. Riya' },
    { key: 'partner2Name', label: "Partner 2's name", ph: 'e.g. Arjun' },
  ],
  anniversary: [
    { key: 'partner1Name', label: "Partner 1's name", ph: 'e.g. Riya' },
    { key: 'partner2Name', label: "Partner 2's name", ph: 'e.g. Arjun' },
  ],
};

// Best-effort guess from the event's name, same keyword approach planLogic.js
// uses — just a starting point; the type selector always lets the host change it.
// Only actually used when there's no linked event, or its real event_type_slug
// hasn't loaded/doesn't map to an invite style yet — see
// EVENT_TYPE_SLUG_TO_INVITE_STYLE below for the authoritative source.
function guessEventType(name) {
  const lower = (name || '').toLowerCase();
  if (/wedding|shaadi|marriage/.test(lower)) return 'wedding';
  if (/birthday|bday/.test(lower)) return 'birthday';
  if (/engagement|ring ceremony|roka/.test(lower)) return 'engagement';
  if (/corporate|office|company|conference/.test(lower)) return 'corporate';
  if (/diwali|deepavali/.test(lower)) return 'diwali';
  if (/baby shower|godh bharai/.test(lower)) return 'babyshower';
  if (/anniversary/.test(lower)) return 'anniversary';
  return 'other';
}

// events.event_type_slug (the real, structured field — 16 values, see
// lib/eventTypeNames.js) doesn't line up with INVITE_STYLE_TYPES (8 values,
// purpose-built visual invite styles, not the full event taxonomy — same
// mismatch noted where INVITE_STYLE_TYPES is defined above). Slugs with no
// real invite-style equivalent (mundan, housewarming, naming-ceremony,
// religious-event, exhibition, concert, festival-fair, sports-event)
// correctly fall through to null — 'other' is the honest default for those,
// not a wrong guess this map should paper over. No entry maps to 'diwali':
// nothing in the live taxonomy distinguishes a Diwali party from any other
// festival-fair, so it stays a manual-only style choice.
const EVENT_TYPE_SLUG_TO_INVITE_STYLE = {
  'hindu-wedding': 'wedding',
  'engagement': 'engagement',
  'kids-birthday': 'birthday',
  'adult-birthday': 'birthday',
  'anniversary': 'anniversary',
  'baby-shower': 'babyshower',
  'corporate-conference': 'corporate',
  'product-launch': 'corporate',
};
function mapEventTypeSlugToInviteStyle(slug) {
  return EVENT_TYPE_SLUG_TO_INVITE_STYLE[slug] || null;
}

// Resolves a template to flat { bg, accent, text } colors, picking the right
// variant when the template has boy/girl/neutral options.
function resolveTemplateColors(tmpl, variant) {
  if (tmpl.hasVariant) return { ...tmpl, ...tmpl.variants[variant || 'neutral'] };
  return tmpl;
}

// Exposed for PlanView.js's palette-reuse from a host's saved invite design —
// wraps the catalog lookup + variant resolution behind one call so callers
// outside this file only need a template_id + variant, not TEMPLATE_CATALOG's
// internal per-event-type bucket shape. Template ids are unique across every
// bucket (see the ids above, e.g. 'wedding-royal', 'birthday-celebration'),
// so a flat search across all buckets is safe and doesn't need the event's
// own type to pick the right one. Returns null if nothing matches (no
// template_id, or a template_id that's since been removed from the catalog).
export function resolveInviteDesignColors(templateId, variant) {
  if (!templateId) return null;
  for (const bucket of Object.values(TEMPLATE_CATALOG)) {
    const tmpl = bucket.find(t => t.id === templateId);
    if (tmpl) return resolveTemplateColors(tmpl, variant);
  }
  return null;
}

function googleMapsUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

// A design's own "date" field only ever gets set from the linked event's
// event_date at creation time — standalone designs (no event picked) have
// none. Prefer showing the actual occasion date (what a guest would see on
// the invite itself, e.g. "15 Dec 2026") since that's what tells two
// similarly-named saved designs apart; fall back to when it was saved.
function formatSavedDesignDate(design) {
  const rawDate = design.pages?.[0]?.date;
  if (rawDate) {
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  }
  return `Saved ${new Date(design.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export default function GuestList({ route, navigation }) {
  // openModal: generic auto-open param for GlobalSearch's four modal-backed
  // registry entries ('functions' | 'invite' | 'travel' | 'manageAccess') —
  // same one-time-initial-state shape openDesigner already used below, just
  // generalized instead of adding three more one-off params. openDesigner
  // itself is untouched (still drives inviteModal's initial state AND the
  // "no event, standalone Invites tool tile" bypass on its own, unchanged)
  // — openModal:'invite' is simply OR'd in as a second, additive way to
  // reach the same modal, for search specifically.
  const { event: routeEvent, openDesigner, openModal, forceTour } = route.params || {};
  const { theme } = useTheme();
  const s = styles(theme);

  // First-time-on-this-screen tour, independent of the core-loop tour and
  // every other screen's own tour — its own tour_key, its own
  // user_tour_progress row.
  const guestListTour = useTour('guestlist_intro');
  useEffect(() => {
    // forceTour (ProfileScreen.js's Replay Tutorial) bypasses the completed
    // check — works whether reached with a specific event already (the
    // targets are on-screen immediately) or standalone (the tour resolves
    // once the host picks an event and the real view mounts, since this
    // effect re-runs when the ref registrations settle — see the engine's
    // own retry-then-skip behavior for anything still unmounted).
    if (forceTour === 'guestlist_intro') {
      guestListTour.forceRestart();
    } else if (guestListTour.checked) {
      guestListTour.startTour();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestListTour.checked, forceTour]);
  const addGuestBtnRef = useRef(null);
  const inviteCtaRef = useRef(null);
  const functionsChipRef = useRef(null);
  const gatePassChipRef = useRef(null);
  useEffect(() => {
    registerTourTarget('guestlist-add-btn', addGuestBtnRef);
    registerTourTarget('guestlist-invite-cta', inviteCtaRef);
    registerTourTarget('guestlist-functions-chip', functionsChipRef);
    registerTourTarget('guestlist-gatepass-chip', gatePassChipRef);
  }, []);

  // Reached with a specific event (from an album's "Guests" button) — use it
  // directly. Reached standalone (from the Tools tile) — the user picks
  // which event's guest list they want first, so different events' guests
  // never get mixed together.
  const [pickedEvent, setPickedEvent] = useState(null);
  const event = routeEvent || pickedEvent;

  const [eventsList, setEventsList] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(!routeEvent);

  // New guest list modal — creates a standalone `events` row to hang the
  // list off of. No Rekognition/invite-code setup here; that's only needed
  // for the face-matching album flow, not for a plain guest list.
  const [newListModal, setNewListModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [creatingList, setCreatingList] = useState(false);

  // An invite designed standalone (no event picked — e.g. from the "Invites"
  // tool tile) has nowhere for its RSVP link to point until it's attached to
  // a real guest list. Rather than a dead-end "can't share" message, offer
  // to attach it to one of the host's existing lists (or start a new one)
  // right where the block happened.
  const [linkPickerModal, setLinkPickerModal] = useState(false);
  const [linkingInvite, setLinkingInvite] = useState(false);

  // Renaming propagates to the linked album + saved plan too (renameEvent
  // in helpers.js) — displayName shadows event.name locally so the header
  // updates immediately without needing to mutate route.params or the
  // pickedEvent object directly.
  const [renameModal, setRenameModal] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [displayName, setDisplayName] = useState(event?.name || '');

  // Delegate/co-host access — a delegate manages guests/invites/functions
  // for this one event without event-edit rights (see
  // supabase/migrations/event_delegates.sql). isDelegateView is derived
  // once userId + event are both known: true when the viewer isn't the
  // event's own host_id, which only happens by reaching this screen via an
  // accepted event_delegates row (RLS wouldn't have returned guests at all
  // otherwise) — used to hide host-only actions in Step 5.
  const [delegatesModal, setDelegatesModal] = useState(openModal === 'manageAccess');
  const [delegates, setDelegates] = useState([]);
  const [delegatesLoading, setDelegatesLoading] = useState(false);
  const [delegatePhone, setDelegatePhone] = useState('');
  const [invitingDelegate, setInvitingDelegate] = useState(false);
  const isDelegateView = !!(event?.id && userId && event.host_id && event.host_id !== userId);
  useEffect(() => {
    setDisplayName(event?.name || ''); // optimistic — avoids a blank header while the fetch below is in flight
    // `event` is whatever route params/pickedEvent handed us, which can be a
    // stale snapshot cached by another screen before a rename happened
    // elsewhere (EventPlanner's rename-on-blur, or GuestList's own rename
    // modal reached via a different navigation path) — that screen may not
    // have unmounted/refetched since. Re-fetch the name directly so this
    // screen is never wrong about it regardless of how it got here.
    if (!event?.id) return;
    supabase.from('events').select('name').eq('id', event.id).maybeSingle()
      .then(({ data }) => { if (data?.name) setDisplayName(data.name); });
  }, [event?.id]);

  // Capability-relevant fields fetched fresh by id, same staleness concern
  // as displayName above (route.params.event can be an older snapshot from
  // before venue_type/etc. existed on this row, or before they were set).
  const [capFields, setCapFields] = useState(null);
  const [venueRow, setVenueRow] = useState(null);
  useEffect(() => {
    if (!event?.id) return;
    supabase.from('events')
      .select('venue_type, venue_id, venue, is_dry_event, is_veg_only, dietary_profile, event_type_slug, guest_count, child_age, budget_total, event_date, event_time, rsvp_deadline')
      .eq('id', event.id).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setCapFields(data);
        if (data.venue_id) {
          supabase.from('venues').select('*').eq('id', data.venue_id).maybeSingle()
            .then(({ data: v }) => setVenueRow(v || null));
        } else {
          setVenueRow(null);
        }
      });
  }, [event?.id]);

  // Plus-one cap — a separate, defensive fetch rather than bundled into
  // capFields' shared select above: events.default_plus_one_limit may not
  // exist yet on this database (migration printed, not applied
  // automatically), and one missing column in a combined select fails the
  // WHOLE query, which would silently break venue/dietary/etc. too.
  const [plusOneLimit, setPlusOneLimit] = useState(null);
  const [plusOneLimitModal, setPlusOneLimitModal] = useState(false);
  const [plusOneLimitInput, setPlusOneLimitInput] = useState('');
  useEffect(() => {
    if (!event?.id) return;
    supabase.from('events').select('default_plus_one_limit').eq('id', event.id).maybeSingle()
      .then(({ data, error }) => {
        if (error) { console.log('default_plus_one_limit fetch error:', error.message); return; }
        setPlusOneLimit(data?.default_plus_one_limit ?? null);
      });
  }, [event?.id]);

  function openPlusOneLimitModal() {
    setPlusOneLimitInput(plusOneLimit != null ? String(plusOneLimit) : '');
    setPlusOneLimitModal(true);
  }

  async function savePlusOneLimit() {
    const trimmed = plusOneLimitInput.trim();
    const value = trimmed === '' ? null : Math.max(0, parseInt(trimmed, 10) || 0);
    try {
      const { error } = await supabase.from('events').update({ default_plus_one_limit: value }).eq('id', event.id);
      if (error) throw error;
      setPlusOneLimit(value);
      setPlusOneLimitModal(false);
    } catch (err) {
      showAlert('Error', err.message);
    }
  }

  // Per-function guest-list scoping — event_functions/event_invitee_functions
  // (supabase/migrations/event_functions.sql) may not exist yet on this
  // database (printed, not applied automatically). Fails silently into "no
  // functions" rather than surfacing an error — an event with zero
  // functions is supposed to look and behave exactly like today, and a
  // still-pending migration is functionally identical to "host hasn't set
  // any up yet" from this screen's point of view.
  useEffect(() => {
    if (!event?.id) return;
    supabase.from('event_functions').select('*').eq('event_id', event.id).order('sort_order', { ascending: true })
      .then(({ data, error }) => {
        if (error) { console.log('event_functions fetch skipped:', error.message); setEventFunctions([]); return; }
        setEventFunctions(data || []);
        if ((data || []).length > 0) {
          const functionIds = data.map(f => f.id);
          supabase.from('event_invitee_functions').select('invitee_id, function_id').in('function_id', functionIds)
            .then(({ data: mapRows, error: mapError }) => {
              if (mapError) { console.log('event_invitee_functions fetch error:', mapError.message); return; }
              const map = {};
              (mapRows || []).forEach(r => {
                if (!map[r.invitee_id]) map[r.invitee_id] = [];
                map[r.invitee_id].push(r.function_id);
              });
              setGuestFunctionMap(map);
            });
        } else {
          setGuestFunctionMap({});
        }
      });
  }, [event?.id]);

  // event_accommodations may not exist yet on this database (see
  // supabase/migrations/outstation_travel.sql — printed, not applied
  // automatically) — same "silently look like zero, never an error" shape
  // as event_functions above.
  useEffect(() => {
    if (!event?.id) return;
    supabase.from('event_accommodations').select('*').eq('event_id', event.id).order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) { console.log('event_accommodations fetch skipped:', error.message); setEventAccommodations([]); return; }
        setEventAccommodations(data || []);
      });
  }, [event?.id]);

  // guest_accompanying may not exist yet on this database (see
  // supabase/migrations/rsvp_prefill_and_guest_documents.sql — printed, not
  // applied automatically) — same "silently look like zero, never an
  // error" shape as event_accommodations above. Scoped to outstation
  // guests only (the only ones this can ever apply to); refetches whenever
  // the guest list itself changes, matching this screen's established
  // self-correcting-refetch pattern rather than the newer eventId-only
  // context hook (GuestList.js was deliberately left on this pattern).
  useEffect(() => {
    const outstationIds = guests.filter(g => g.is_outstation).map(g => g.id);
    if (outstationIds.length === 0) { setGuestAccompanying({}); return; }
    supabase.from('guest_accompanying').select('*').in('invitee_id', outstationIds)
      .then(({ data, error }) => {
        if (error) { console.log('guest_accompanying fetch skipped:', error.message); setGuestAccompanying({}); return; }
        const map = {};
        (data || []).forEach(row => {
          if (!map[row.invitee_id]) map[row.invitee_id] = [];
          map[row.invitee_id].push(row);
        });
        setGuestAccompanying(map);
      });
  }, [guests]);

  async function saveAccommodation() {
    if (!accForm.name.trim()) {
      showAlert('Required', 'Enter a name for this accommodation.');
      return;
    }
    setSavingAcc(true);
    try {
      const payload = { name: accForm.name.trim(), address: accForm.address.trim() || null, notes: accForm.notes.trim() || null };
      if (editingAccId) {
        const { data, error } = await supabase.from('event_accommodations').update(payload).eq('id', editingAccId).select().single();
        if (error) throw error;
        setEventAccommodations(prev => prev.map(a => a.id === editingAccId ? data : a));
      } else {
        const { data, error } = await supabase.from('event_accommodations').insert({ ...payload, event_id: event.id }).select().single();
        if (error) throw error;
        setEventAccommodations(prev => [...prev, data]);
      }
      setAccForm({ name: '', address: '', notes: '' });
      setEditingAccId(null);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSavingAcc(false);
    }
  }

  function openEditAccommodation(acc) {
    setAccForm({ name: acc.name, address: acc.address || '', notes: acc.notes || '' });
    setEditingAccId(acc.id);
  }

  function cancelEditAccommodation() {
    setAccForm({ name: '', address: '', notes: '' });
    setEditingAccId(null);
  }

  function removeAccommodation(acc) {
    confirmDestructive(
      'Remove accommodation?',
      `"${acc.name}" will be removed. Any guests assigned to it will keep their room number but lose the accommodation name.`,
      'Remove',
      async () => {
        try {
          const { error } = await supabase.from('event_accommodations').delete().eq('id', acc.id);
          if (error) throw error;
          setEventAccommodations(prev => prev.filter(a => a.id !== acc.id));
          setGuests(prev => prev.map(g => g.accommodation_id === acc.id ? { ...g, accommodation_id: null } : g));
        } catch (err) {
          showAlert('Error', err.message);
        }
      }
    );
  }

  // Suggests real names from the global sub_events taxonomy (Haldi/Sangeet/
  // Reception/...) when this event's type has any — event_types/sub_events
  // are joined by slug/id in two plain queries (no join), matching this
  // project's convention. Purely a suggestion source; the host can still
  // type anything. Silent no-op if the event type has none (most types).
  useEffect(() => {
    if (!capFields?.event_type_slug) { setSuggestedFunctionNames([]); return; }
    supabase.from('event_types').select('id').eq('slug', capFields.event_type_slug).maybeSingle()
      .then(({ data: typeRow }) => {
        if (!typeRow) { setSuggestedFunctionNames([]); return; }
        supabase.from('sub_events').select('name, sort_order, id').eq('event_type_id', typeRow.id).order('sort_order', { ascending: true })
          .then(({ data: subRows }) => setSuggestedFunctionNames(subRows || []));
      });
  }, [capFields?.event_type_slug]);

  // Per-function budget (Step 6) — genuinely optional, host-set, never
  // auto-derived from the whole-event budget. Draft text kept per function
  // id only while actively being edited (not in it -> falls back to the
  // real saved value); saves on blur rather than per keystroke, matching
  // LocationAutocomplete's onBlur-persist pattern elsewhere in this file.
  const [functionBudgetInputs, setFunctionBudgetInputs] = useState({});
  function functionBudgetInputValue(func) {
    if (func.id in functionBudgetInputs) return functionBudgetInputs[func.id];
    return func.budget_total != null ? String(func.budget_total) : '';
  }
  async function saveFunctionBudget(func) {
    if (!(func.id in functionBudgetInputs)) return; // untouched this session, nothing to save
    const trimmed = functionBudgetInputs[func.id].trim();
    const value = trimmed === '' ? null : Math.max(0, parseInt(trimmed, 10) || 0);
    try {
      const { error } = await supabase.from('event_functions').update({ budget_total: value }).eq('id', func.id);
      if (error) throw error;
      setEventFunctions(prev => prev.map(f => f.id === func.id ? { ...f, budget_total: value } : f));
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setFunctionBudgetInputs(prev => { const next = { ...prev }; delete next[func.id]; return next; });
    }
  }

  async function addFunction(name, sourceSubEvent) {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    setSavingFunction(true);
    try {
      const { data, error } = await supabase.from('event_functions').insert({
        event_id: event.id,
        name: trimmed,
        sort_order: eventFunctions.length,
        source_sub_event_id: sourceSubEvent?.id || null,
      }).select().single();
      if (error) throw error;
      setEventFunctions(prev => [...prev, data]);
      setNewFunctionName('');
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSavingFunction(false);
    }
  }

  function removeFunction(func) {
    const taggedCount = Object.values(guestFunctionMap).filter(ids => ids.includes(func.id)).length;
    const doRemove = async () => {
      try {
        const { error } = await supabase.from('event_functions').delete().eq('id', func.id);
        if (error) throw error;
        setEventFunctions(prev => prev.filter(f => f.id !== func.id));
        setGuestFunctionMap(prev => {
          const next = {};
          Object.entries(prev).forEach(([guestId, ids]) => { next[guestId] = ids.filter(id => id !== func.id); });
          return next;
        });
        if (activeFunctionFilter === func.name) setActiveFunctionFilter('All');
      } catch (err) {
        showAlert('Error', err.message);
      }
    };
    // Removing a function silently un-scopes those guests back to "invited
    // to everything" — a safe default, but still worth confirming rather
    // than doing it with no warning, same as this project's other
    // confirmDestructive-gated removals.
    if (taggedCount > 0) {
      confirmDestructive(
        'Remove this function?',
        `${taggedCount} guest${taggedCount > 1 ? 's are' : ' is'} tagged with "${func.name}" — removing it doesn't remove those guests, they'll just no longer be scoped to it.`,
        'Remove',
        doRemove
      );
    } else {
      doRemove();
    }
  }

  const capabilities = useCapabilities({
    eventTypeSlug: capFields?.event_type_slug ?? null,
    venueType: capFields?.venue_type ?? null,
    guestCount: capFields?.guest_count ?? null,
    age: capFields?.child_age ?? null,
    isDryEvent: capFields?.is_dry_event ?? false,
    isVegOnly: capFields?.is_veg_only ?? false,
    hasBudget: capFields?.budget_total != null,
  });
  const showVisitorList = isEnabled(capabilities, 'society_gate_pass');
  // GatePass.js itself routes to the right sub-actions (issue/scan/visitor
  // list/CSV export) per entryControl.capability_key — a single gated chip
  // here, not one per capability_key like the old showAttendanceQr split
  // used to require.
  const showGatePass = !!capabilities.entryControl && capabilities.entryControl.capability_key !== 'no_entry_control';
  const showRsvpTracking = isEnabled(capabilities, 'rsvp_tracking');
  const showMealPreferences = isEnabled(capabilities, 'meal_preferences');
  const showVipFlagging = isEnabled(capabilities, 'vip_flagging');

  // The one resolved shape the drift-check and auto-fill logic read from —
  // same resolveVenue/resolveDietary calls EventHeader/SlotField use
  // elsewhere, just assembled locally instead of via useEventContext (this
  // file stays off that hook — see displayName's own staleness-guard above
  // for why: it already has its own working refetch-fresh pattern).
  //
  // Two corrections vs. the raw resolver output, both because these values
  // land in guest-facing invite text, not just host-facing status display:
  // - venue.label prefers the real address over the venue's name — the
  //   invite's venue field becomes the "View on Google Maps" link (see
  //   googleMapsUrl below), so the specific street address is more useful
  //   there than a business name, and it's what a home event actually has
  //   (venue.label there is venue_label, an optional field nothing in the
  //   UI currently sets — falling back to address is what makes the
  //   home-event case work at all, not just a minor preference).
  // - dietary.label falls back to the literal string "No dietary
  //   restrictions set" when nothing's configured — fine for a host-facing
  //   summary, wrong to auto-type into an invite. Blanked out here so an
  //   event with no dietary info doesn't get that sentence silently
  //   inserted into the Dietary field.
  const resolvedPlanContext = useMemo(() => {
    if (!event || !capFields) return null;
    const merged = { ...event, ...capFields };
    const venueCtx = resolveVenue(merged, venueRow);
    const dietaryCtx = resolveDietary(merged);
    const hasDietaryInfo = dietaryCtx.profile.length > 0 || dietaryCtx.isVegOnly || dietaryCtx.isDry;
    return {
      venue: { ...venueCtx, label: venueCtx.address || venueCtx.label || '' },
      dietary: { ...dietaryCtx, label: hasDietaryInfo ? dietaryCtx.label : '' },
      dateLabel: capFields.event_date
        ? new Date(capFields.event_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
        : '',
      timeLabel: formatTimeLabel(capFields.event_time) || '',
      // No host-facing UI sets rsvp_deadline anywhere in this app yet, so
      // it's always null in practice — default to 5 days before the event
      // instead of leaving the invite's RSVP-by field permanently blank.
      // Still a plain string in page.rsvpBy, same as before, so the host can
      // freely override it by typing a different date.
      rsvpDeadlineLabel: (() => {
        const explicit = capFields.rsvp_deadline;
        if (explicit) return new Date(explicit + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
        if (!capFields.event_date) return '';
        const d = new Date(capFields.event_date + 'T00:00:00');
        d.setDate(d.getDate() - 5);
        if (d < new Date(new Date().toDateString())) return ''; // event's under 5 days out — no sensible default
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
      })(),
    };
  }, [event?.id, capFields, venueRow]);

  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);

  // Add/Edit guest modal — editingGuestId null means "adding new"
  const [guestModal, setGuestModal] = useState(false);
  const [guestForm, setGuestForm] = useState({ name: '', phone: '', tag: '', functionIds: [], entryType: 'individual', householdSize: '' });
  const [saving, setSaving] = useState(false);
  const [editingGuestId, setEditingGuestId] = useState(null);
  const [activeTagFilter, setActiveTagFilter] = useState('All');
  const [activeFunctionFilter, setActiveFunctionFilter] = useState('All');

  // Multi-function guest-list scoping (haldi/sangeet/reception etc.) — an
  // event with zero rows here means "not in use," everything behaves
  // exactly as before (single undivided list). eventFunctions is the
  // per-event, host-named list; guestFunctionMap is invitee_id -> [function
  // ids], fetched separately and merged in JS (two-query convention, and
  // this is a many-to-many join table, not a column on either side).
  const [eventFunctions, setEventFunctions] = useState([]);
  const [eventAccommodations, setEventAccommodations] = useState([]);
  // invitee_id -> [{ id, name, govt_id_doc_path }] — sub-records only (per
  // the confirmed design), not separate event_invitees rows.
  const [guestAccompanying, setGuestAccompanying] = useState({});
  const [travelModal, setTravelModal] = useState(openModal === 'travel');
  const [travelTab, setTravelTab] = useState('accommodations'); // 'accommodations' | 'pickup' | 'hotel_list'
  const [generatingHotelList, setGeneratingHotelList] = useState(false);
  const [accForm, setAccForm] = useState({ name: '', address: '', notes: '' });
  const [editingAccId, setEditingAccId] = useState(null);
  const [savingAcc, setSavingAcc] = useState(false);
  const [guestFunctionMap, setGuestFunctionMap] = useState({});
  const [functionsModal, setFunctionsModal] = useState(openModal === 'functions');
  const [newFunctionName, setNewFunctionName] = useState('');
  const [suggestedFunctionNames, setSuggestedFunctionNames] = useState([]);
  const [savingFunction, setSavingFunction] = useState(false);

  // Import from contacts — bulk (add several new guests at once)
  const [contactsModal, setContactsModal] = useState(false);
  const [contactsList, setContactsList] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [contactsSearch, setContactsSearch] = useState('');

  // Import from contacts — single pick, for filling in the phone number of
  // a guest already on the list who was saved with just a name. Shares the
  // same contactsList/contactsSearch state as the bulk picker above (same
  // underlying device contact book), just a different modal + selection
  // behavior (one tap applies and closes, no multi-select confirm step).
  const [phonePickModal, setPhonePickModal] = useState(false);

  // Invite designer modal — auto-opens when reached via the "Invites" tool
  // tile (no guest-list context needed, so jump straight to it). Templates
  // are grouped by event type; the type is guessed from the event's name as
  // a starting point but always stays user-editable via the type chips.
  const [inviteModal, setInviteModal] = useState(!!openDesigner || openModal === 'invite');
  const [inviteEventType, setInviteEventType] = useState(guessEventType(event?.name));
  // Starts false so the auto-correct effect below is free to switch from
  // the name-guess to the real event_type_slug-mapped style once capFields
  // loads. Flips true the moment the host picks a type themselves (or loads
  // a saved design, which already has its own explicit type) so that
  // choice is never silently overridden.
  const [typeTouchedByHost, setTypeTouchedByHost] = useState(false);
  const [inviteVariant, setInviteVariant] = useState('neutral');
  const [template, setTemplate] = useState(TEMPLATE_CATALOG[guessEventType(event?.name)][0]);
  // An invite is one or more pages sharing the same template/theme — each
  // page has its own text and optional image (e.g. page 1 = the invite
  // itself, page 2 = venue directions with a map photo).
  const [pages, setPages] = useState([{
    id: 1,
    title: event?.name || 'You\'re Invited!',
    hostName: '',
    subjectName: '', partner1Name: '', partner2Name: '',
    message: generateMessage(guessEventType(event?.name), {}),
    date: event?.event_date || '',
    time: event?.event_time || '',
    venue: event?.venue || '',
    imageUri: null,
    imagePlacement: 'top',
    dietary: '',
    rsvpBy: '',
    fieldMeta: freshFieldMeta(),
  }]);
  const [activePage, setActivePage] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [sendingAllPasses, setSendingAllPasses] = useState(false);
  // Which function (if any) THIS invite design is for — session-only, not
  // persisted onto event_invite_designs (no function_id column there;
  // adding one is a real option later, deliberately skipped here to avoid
  // another pending migration for a value only this screen's own send flow
  // ever reads). null = not tied to a specific function, offered to
  // everyone, same as before this feature existed.
  const [designFunctionId, setDesignFunctionId] = useState(null);
  const [savingImage, setSavingImage] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [savedDesigns, setSavedDesigns] = useState([]);
  const [savingDesign, setSavingDesign] = useState(false);
  // Remembered across invites — host name and preferred photo placement
  // rarely change from one invite to the next for the same host, so both
  // new designs and older saved ones missing these carry the last-used
  // values forward instead of resetting to blank every time.
  const [invitePrefs, setInvitePrefs] = useState({});
  // 'new' = the editor below; 'saved' = the "My Invites" browser. Loading a
  // saved design sets editingDesignId so the Save button updates that same
  // row in place instead of always inserting a new one — "Duplicate" (in the
  // saved list) is the explicit way to fork a copy instead.
  // Reached via the standalone "Invites" tool tile (openDesigner, no event
  // context) lands on the saved list first, same as every other list screen
  // in the app (Albums, Event Workspaces, etc.) — "+ New invite" starts a
  // fresh one from there. Reached from inside a specific event's guest list
  // (openInviteDesigner) goes straight to the editor since that's already a
  // deliberate "design an invite for this event" action.
  const [designerTab, setDesignerTab] = useState(openDesigner ? 'saved' : 'new');
  const [editingDesignId, setEditingDesignId] = useState(null);
  const [saveChoiceModal, setSaveChoiceModal] = useState(false);
  const [waQueueModal, setWaQueueModal] = useState(false);
  // Lets "+ Add new guest" inside the send-queue modal hand off to the
  // existing quick-add form without losing the queue — closeGuestModal()
  // reopens the queue once the new guest is saved (or the add is cancelled).
  const [reopenWaQueueAfterAddGuest, setReopenWaQueueAfterAddGuest] = useState(false);
  const [reminderQueueModal, setReminderQueueModal] = useState(false);

  // Per-guest detail sheet (meal/allergies/VIP/gift/status) + the two
  // cross-cutting summary modals — all additive to the existing name/phone/
  // tag quick-add modal above, which stays untouched.
  const [detailGuest, setDetailGuest] = useState(null);
  const [showVipOnly, setShowVipOnly] = useState(false);
  const [mealCountsModal, setMealCountsModal] = useState(false);
  const [giftsModal, setGiftsModal] = useState(false);
  const cardRef = useRef(null);
  const activeTemplate = resolveTemplateColors(template, inviteVariant);
  const activePageData = pages[activePage];
  const nameFields = NAME_FIELDS[inviteEventType] || [];
  // Once the event's own type is known (picked back in the plan flow via
  // SlotField's sub_type_slug/event_type_slug), asking again in the invite
  // designer is redundant — only surface the type chips when there's no
  // linked event, or its type_slug doesn't map to any invite style at all
  // (mapEventTypeSlugToInviteStyle returns null), same "hide what's already
  // answered" principle SlotField/PlanView apply to the plan's own fields.
  const typeAutoDetected = !!(event && mapEventTypeSlugToInviteStyle(capFields?.event_type_slug));
  const [planNudges, setPlanNudges] = useState([]); // [{ pageIndex, key, liveValue, label }]

  // On every modal open: fields still linked to the plan (autoFilled !==
  // false) silently take the fresh value; fields the host has edited
  // (autoFilled: false) get flagged as a dismissable nudge instead of being
  // overwritten. resolvedPlanContext is a deliberate dependency here —
  // capFields/venueRow only resolve once per event load (not per
  // keystroke), so omitting it would mean opening the modal before that
  // fetch settles permanently skips this check for the whole session
  // (inviteModal never changes again on its own to retrigger it).
  useEffect(() => {
    if (!inviteModal || !resolvedPlanContext) return;
    const nudges = [];
    setPages(prev => prev.map((page, i) => {
      const meta = page.fieldMeta || freshFieldMeta();
      let changed = false;
      const nextMeta = { ...meta };
      const applyOrNudge = (key, liveValue, label, pageField) => {
        if (!liveValue) return;
        if (meta[key]?.autoFilled !== false) {
          // still linked (or a field this design predates) — take the fresh
          // value silently, no nudge needed
          if (page[pageField] !== liveValue) changed = true;
          nextMeta[key] = { autoFilled: true, snapshot: liveValue };
          if (changed) page = { ...page, [pageField]: liveValue };
        } else if ((meta[key].snapshot || '') !== liveValue) {
          nudges.push({ pageIndex: i, key, liveValue, label });
        }
      };
      applyOrNudge('date', resolvedPlanContext.dateLabel, 'Date', 'date');
      applyOrNudge('time', resolvedPlanContext.timeLabel, 'Time', 'time');
      applyOrNudge('dietary', resolvedPlanContext.dietary.label, 'Dietary note', 'dietary');
      applyOrNudge('rsvpBy', resolvedPlanContext.rsvpDeadlineLabel, 'RSVP-by date', 'rsvpBy');
      // Title: page 0 only, sourced from the event's own name (not the
      // plan) — same silent-while-linked / nudge-once-edited shape as
      // everything else above. Previously this was hard-locked to the
      // event name (a separate effect, always overwriting, no edit
      // possible) — now the host can type a custom invite title, and it
      // only re-syncs on its own until they do.
      if (i === 0 && event) applyOrNudge('title', displayName, 'Event title', 'title');
      // Venue: silently prefilled only while blank — a fresh invite (or one
      // whose initial event.venue snapshot was stale/empty) has nothing to
      // protect yet, so there's no reason to make the host tap Update just
      // to see what's already the real venue. The moment any text exists —
      // host-typed or previously synced — this switches to nudge-only; the
      // invite's venue text is what persistVenue() writes back to
      // events.venue, and shouldn't silently change under the host once
      // it's meaningful.
      if (!page.venue?.trim()) {
        if (resolvedPlanContext.venue.label) {
          page = { ...page, venue: resolvedPlanContext.venue.label };
          nextMeta.venue = { snapshot: resolvedPlanContext.venue.label };
        }
      } else if ((meta.venue?.snapshot || '') !== resolvedPlanContext.venue.label && resolvedPlanContext.venue.label) {
        nudges.push({ pageIndex: i, key: 'venue', liveValue: resolvedPlanContext.venue.label, label: 'Venue' });
      }
      return { ...page, fieldMeta: nextMeta };
    }));
    setPlanNudges(nudges);
  }, [inviteModal, resolvedPlanContext, event, displayName]);

  function resyncField(pageIndex, key, liveValue) {
    setPages(prev => prev.map((p, i) => {
      if (i !== pageIndex) return p;
      const pageField = key; // date/dietary/rsvpBy/venue all match their fieldMeta key
      return {
        ...p,
        [pageField]: liveValue,
        fieldMeta: { ...p.fieldMeta, [key]: key === 'venue' ? { snapshot: liveValue } : { autoFilled: true, snapshot: liveValue } },
      };
    }));
    setPlanNudges(prev => prev.filter(n => !(n.pageIndex === pageIndex && n.key === key)));
    if (key === 'venue') persistVenue(liveValue); // pulling the plan's venue back in should also flow back to events.venue
  }

  function dismissNudge(pageIndex, key) {
    setPlanNudges(prev => prev.filter(n => !(n.pageIndex === pageIndex && n.key === key)));
    // Snapshot is untouched on purpose — if the plan changes again, the
    // same drift resurfaces instead of going silent forever.
  }

  // Corrects the name-guessed event type to the real event_type_slug once
  // capFields loads (fetched on mount, tied to event?.id — normally well
  // settled before a host has navigated to and opened the designer, so this
  // fires before there's anything typed to protect). Mirrors pickEventType's
  // own template + message regeneration so the switch is a clean one, not
  // a half-applied type change.
  useEffect(() => {
    if (typeTouchedByHost) return;
    const mapped = mapEventTypeSlugToInviteStyle(capFields?.event_type_slug);
    if (!mapped || mapped === inviteEventType) return;
    setInviteEventType(mapped);
    setInviteVariant('neutral');
    setTemplate(TEMPLATE_CATALOG[mapped][0]);
    setPages(prev => prev.map((p, i) => i === 0 ? { ...p, message: generateMessage(mapped, p) } : p));
  }, [capFields?.event_type_slug, typeTouchedByHost]);

  // Saved designs are a personal template library, not locked to one event —
  // a host can build a design with no event picked at all (from the
  // standalone "Invites" tool tile) and reuse it for any event later, so
  // this fetches by host, not by event_id (which is nullable for exactly
  // this reason).
  useEffect(() => { if (inviteModal && userId) { fetchSavedDesigns(); fetchInvitePrefs(); } }, [inviteModal, userId]);

  async function fetchSavedDesigns() {
    const { data, error } = await supabase
      .from('event_invite_designs')
      .select('*')
      .eq('host_id', userId)
      .order('created_at', { ascending: false });
    if (!error) setSavedDesigns(data || []);
  }

  async function fetchInvitePrefs() {
    const { data } = await supabase.from('users').select('invite_preferences').eq('id', userId).single();
    const prefs = data?.invite_preferences || {};
    setInvitePrefs(prefs);
    // The very first page was already created before prefs finished
    // loading — backfill it only while it's still untouched (fresh, no
    // event, nothing typed yet), so this never clobbers real edits.
    if (!editingDesignId && !event && !activePageData.hostName?.trim()) {
      setPages(prev => prev.map((p, i) => i === activePage ? {
        ...p,
        hostName: prefs.hostName || p.hostName,
        imagePlacement: p.imagePlacement || prefs.imagePlacement || 'top',
      } : p));
    }
  }

  // Fire-and-forget, non-blocking — mirrors persistVenue()'s pattern.
  function rememberInvitePrefs(page) {
    if (!userId) return;
    const next = { hostName: page.hostName || '', imagePlacement: page.imagePlacement || 'top' };
    setInvitePrefs(next);
    supabase.from('users').update({ invite_preferences: next }).eq('id', userId)
      .then(({ error }) => { if (error) console.log('rememberInvitePrefs error:', error.message); });
  }

  // Lets a host build several different invite designs — for the same event
  // or as reusable templates with no event at all — and pick which one to
  // send to which guest later, rather than being locked into a single invite.
  // `saveAsNew` forks a copy instead of updating in place — used when editing
  // an already-saved design and choosing not to overwrite it (see
  // handleSavePress/saveChoiceModal below).
  async function saveInviteDesign(saveAsNew = false) {
    if (!userId) {
      showAlert('Log in required', 'Please log in to save invite designs.');
      return;
    }
    setSavingDesign(true);
    try {
      rememberInvitePrefs(activePageData);
      const label = event ? displayName.trim() : (activePageData.title?.trim() || `${inviteEventType} invite`);
      const payload = {
        event_id: event?.id || null,
        host_id: userId,
        label,
        event_type: inviteEventType,
        variant: inviteVariant,
        template_id: template.id,
        pages,
      };
      if (editingDesignId && !saveAsNew) {
        const { data, error } = await supabase
          .from('event_invite_designs')
          .update(payload)
          .eq('id', editingDesignId)
          .select()
          .single();
        if (error) throw error;
        setSavedDesigns(prev => prev.map(d => d.id === editingDesignId ? data : d));
        showAlert('Updated!', 'Your changes to this design have been saved.');
      } else {
        const { data, error } = await supabase
          .from('event_invite_designs')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        setSavedDesigns(prev => [data, ...prev]);
        setEditingDesignId(data.id); // further saves now update this same design, not insert duplicates
        showAlert(
          saveAsNew ? 'Saved as a new invite!' : 'Saved!',
          saveAsNew
            ? 'This is now a separate invite — the original is unchanged. Find both under "My Invites".'
            : 'This design is saved — find it anytime under "My Invites".'
        );
      }
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSavingDesign(false);
      setSaveChoiceModal(false);
    }
  }

  // Editing a design loaded from "My Invites" is ambiguous at save time —
  // overwrite the original, or keep it and fork these changes into a new
  // one? Ask, rather than silently always overwriting (the old behavior) or
  // requiring the separate "Duplicate" button to be tapped pre-emptively
  // before making any edits.
  function handleSavePress() {
    if (editingDesignId) {
      setSaveChoiceModal(true);
    } else {
      saveInviteDesign(false);
    }
  }

  // Explicit fork: keeps the original design untouched and adds a second,
  // independent row the host can then edit separately (e.g. one invite
  // reused with small tweaks for a different guest group).
  async function duplicateSavedDesign(design) {
    try {
      const { data, error } = await supabase
        .from('event_invite_designs')
        .insert({
          event_id: design.event_id,
          host_id: userId,
          label: `${design.label} (copy)`,
          event_type: design.event_type,
          variant: design.variant,
          template_id: design.template_id,
          pages: design.pages,
        })
        .select()
        .single();
      if (error) throw error;
      setSavedDesigns(prev => [data, ...prev]);
    } catch (err) {
      showAlert('Error', err.message);
    }
  }

  function loadSavedDesign(design) {
    setTypeTouchedByHost(true); // the design's own saved event_type is already an explicit choice
    setInviteEventType(design.event_type);
    setInviteVariant(design.variant);
    const tmpl = TEMPLATE_CATALOG[design.event_type]?.find(t => t.id === design.template_id) || TEMPLATE_CATALOG[design.event_type][0];
    setTemplate(tmpl);
    // Older saved designs predate imagePlacement/host-name-remembering — fill
    // in the current remembered defaults for whichever of those they're
    // missing, without touching anything the design already has set.
    setPages(design.pages.map((p, i) => ({
      ...p,
      // Only re-sync page 0's title to the (possibly since-renamed) event
      // name if this design predates title-tracking or was never
      // customized — a host who already typed their own invite title keeps
      // it, matching how date/venue below preserve pre-existing host edits.
      title: (event && i === 0 && p.fieldMeta?.title?.autoFilled !== false) ? displayName : p.title,
      hostName: p.hostName || invitePrefs.hostName || '',
      imagePlacement: p.imagePlacement || invitePrefs.imagePlacement || 'top',
      dietary: p.dietary || '',
      rsvpBy: p.rsvpBy || '',
      // Older saved designs predate fieldMeta entirely. Treat their
      // existing date/venue as host-set and frozen (autoFilled: false) —
      // never silently overwrite content from a design saved before this
      // feature existed. Dietary/rsvpBy are brand new fields with nothing
      // saved yet, so those start auto-filled.
      fieldMeta: p.fieldMeta || {
        date: { autoFilled: false, snapshot: p.date || '' },
        venue: { snapshot: p.venue || '' },
        dietary: { autoFilled: true, snapshot: '' },
        rsvpBy: { autoFilled: true, snapshot: '' },
      },
    })));
    setActivePage(0);
    setEditingDesignId(design.id);
    setDesignerTab('new');
  }

  function deleteSavedDesign(design) {
    confirmDestructive('Delete this design?', design.label, 'Delete', async () => {
      await supabase.from('event_invite_designs').delete().eq('id', design.id);
      setSavedDesigns(prev => prev.filter(d => d.id !== design.id));
      if (editingDesignId === design.id) setEditingDesignId(null);
    });
  }

  // Resets the editor to a blank invite — the explicit way to leave "editing
  // an existing design" mode, since just switching tabs to browse the saved
  // list and back must not silently discard which design is being edited.
  function startNewDesign() {
    // Prefer the real event_type_slug (capFields has almost always loaded
    // by the time a host reaches "+ New invite" mid-session) over the
    // name-guess; typeTouchedByHost resets to false so the auto-correct
    // effect can still fix this once capFields does resolve, in the rarer
    // case it hasn't yet.
    const freshType = mapEventTypeSlugToInviteStyle(capFields?.event_type_slug) || guessEventType(event?.name);
    setEditingDesignId(null);
    setTypeTouchedByHost(false);
    setInviteEventType(freshType);
    setInviteVariant('neutral');
    setTemplate(TEMPLATE_CATALOG[freshType][0]);
    setPages([{
      id: 1,
      title: event?.name || 'You\'re Invited!',
      hostName: invitePrefs.hostName || '', subjectName: '', partner1Name: '', partner2Name: '',
      message: generateMessage(freshType, {}),
      date: event?.event_date || '', time: event?.event_time || '', venue: event?.venue || '',
      imageUri: null,
      imagePlacement: invitePrefs.imagePlacement || 'top',
      dietary: '', rsvpBy: '',
      fieldMeta: freshFieldMeta(),
    }]);
    setActivePage(0);
    setDesignFunctionId(null);
    setDesignerTab('new');
  }

  async function saveInviteImage() {
    if (Platform.OS === 'web') {
      showAlert('Use the mobile app', 'Saving the invite as an image works in the Utsav mobile app.');
      return;
    }
    setSavingImage(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Permission needed', 'Please allow access to save photos.');
        return;
      }
      const uri = await cardRef.current.capture();
      await MediaLibrary.saveToLibraryAsync(uri);
      showAlert('Saved! 📸', 'Invite card saved to your gallery.');
    } catch (err) {
      showAlert('Error', 'Could not save the invite image.');
    } finally {
      setSavingImage(false);
    }
  }

  // Calls the generate-invite-image edge function (OpenAI image generation
  // server-side, so the API key never sits in the client). Needs
  // OPENAI_API_KEY set as a Supabase secret to actually return an image.
  async function generateAiImage() {
    setGeneratingImage(true);
    try {
      const motifWords = (activeTemplate.motif || []).filter(m => /\p{Emoji}/u.test(m));
      const prompt = `An elegant, tasteful background illustration for a ${inviteEventType} invitation`
        + (motifWords.length ? `, themed around ${motifWords.join(' ')}` : '')
        + `, soft and celebratory colors matching a ${activeTemplate.bg} and ${activeTemplate.accent} palette, no text, no words, high quality digital illustration, decorative border`;
      const { imageUrl } = await callEdgeFunction('generate-invite-image', { prompt });
      updateActivePage('imageUri', imageUrl);
    } catch (err) {
      showAlert('Could not generate image', err.message || 'Please try again.');
    } finally {
      setGeneratingImage(false);
    }
  }

  // Guest lists created before invite_code was wired up here (or created
  // directly via createGuestList(), which doesn't need it for anything else)
  // may not have one yet — mirrored in local state so it can be generated
  // and persisted lazily the first time the invite designer actually needs
  // it, without touching the event object's own creation paths.
  const [eventInviteCode, setEventInviteCode] = useState(event?.invite_code || null);
  useEffect(() => { setEventInviteCode(event?.invite_code || null); }, [event?.id]);

  // Drives the CTA's label — "Share Invite" once one exists for this event,
  // "Create & Share Invite" while there's nothing to share yet.
  const [eventHasInvite, setEventHasInvite] = useState(false);
  useEffect(() => {
    if (!event?.id) { setEventHasInvite(false); return; }
    supabase.from('event_invite_designs').select('id', { count: 'exact', head: true }).eq('event_id', event.id)
      .then(({ count }) => setEventHasInvite((count || 0) > 0));
  }, [event?.id]);

  async function openInviteDesigner() {
    if (event && !eventInviteCode) {
      // Goes through stamp_event_invite_code() (SECURITY DEFINER — see
      // supabase/migrations/stamp_event_invite_code.sql), not a direct
      // .update() — events' own UPDATE policy is host-only, so a delegate
      // hitting this for an event that's never had an invite before would
      // otherwise silently fail with no error and no code, shipping a
      // broken/empty RSVP link.
      //
      // stamp_event_invite_code() may not exist yet on this database (that
      // migration is printed, not applied automatically) — falling back to
      // the direct host-side .update() this used to be is what keeps a
      // HOST's own invite creation working in the meantime; it still fails
      // correctly for a delegate (events' UPDATE policy is host-only), just
      // without the improved error message until the migration lands. Only
      // a genuine failure of BOTH paths shows the hard error.
      let { data: code, error } = await supabase.rpc('stamp_event_invite_code', { p_event_id: event.id });
      if (error) {
        const fallbackCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const { error: updateError } = await supabase.from('events').update({ invite_code: fallbackCode }).eq('id', event.id);
        if (updateError) {
          showAlert('Error', "Couldn't set up this event's invite link. Please try again.");
          return;
        }
        code = fallbackCode;
      }
      setEventInviteCode(code);
    }
    // An existing invite for this event → land on the list to pick/share it,
    // same as the standalone "Invites" tool tile does. Nothing yet → go
    // straight to the editor, this button's whole point is "make one".
    setDesignerTab(eventHasInvite ? 'saved' : 'new');
    setInviteModal(true);
  }

  // Reached standalone (no event) with the modal auto-opened, the screen
  // behind it is a real, interactive guest-list layout with nothing to show
  // (0 guests, no name) — falls back to generic placeholders per the design,
  // but a back-swipe/Android-back closing just the modal left the host
  // staring at what looked exactly like a real, broken empty guest list.
  // With no event ever picked/linked, closing the modal means leaving this
  // screen entirely instead of revealing that dead-end background.
  function closeInviteModal() {
    setInviteModal(false);
    if (!event) navigation.goBack();
  }

  // The picker->list transition happens via local state, not real navigation,
  // so there's only one screen on the stack. Without this, the back arrow
  // AND the iOS swipe-back gesture would pop straight out to whatever screen
  // opened GuestList (e.g. Plan), skipping the picker entirely. Intercept
  // back navigation and step back to the picker first when a picked event
  // (not one passed in via route params) is showing.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (pickedEvent && e.data.action.type === 'GO_BACK') {
        e.preventDefault();
        setPickedEvent(null);
      }
    });
    return unsubscribe;
  }, [navigation, pickedEvent]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) return;
      setUserId(data.user.id);
      if (routeEvent) {
        fetchGuests(data.user.id, routeEvent);
      } else {
        setLoading(false); // no guests to show until an event is picked (or none needed, e.g. Invite Designer)
        fetchMyEvents(data.user.id);
      }
    });
  }, []);

  // Live "Arrived" status from CheckInScanner.js — same channel-subscription
  // pattern ChatScreen.js already uses, so a scan at the gate shows up here
  // without the host needing to pull-to-refresh.
  useEffect(() => {
    if (!event?.id) return;
    const channelName = `checkins-${event.id}`;
    supabase.channel(channelName).on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'event_invitees', filter: `event_id=eq.${event.id}`,
    }, ({ new: row }) => setGuests(prev => prev.map(g => g.id === row.id ? row : g))).subscribe();
    return () => { supabase.channel(channelName).unsubscribe(); };
  }, [event?.id]);

  async function fetchMyEvents(uid) {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('host_id', uid)
        .order('created_at', { ascending: false });
      if (error) throw error;
      let owned = data || [];

      // Merge in events this user has accepted delegate access to (see
      // supabase/migrations/event_delegates.sql) — event_delegates may not
      // exist yet on this database, so a failure here just means "no
      // delegated events" rather than blocking the whole picker.
      try {
        const { data: delRows, error: delErr } = await supabase
          .from('event_delegates')
          .select('event_id')
          .eq('delegate_user_id', uid)
          .eq('status', 'accepted');
        if (!delErr && delRows?.length) {
          const delegatedIds = delRows.map(d => d.event_id).filter(id => !owned.some(e => e.id === id));
          if (delegatedIds.length) {
            // events' own SELECT policy is open ("Anyone can view events by
            // invite code" — qual true), so this read needs no new policy.
            const { data: delegatedEvents, error: evErr } = await supabase
              .from('events').select('*').in('id', delegatedIds);
            if (!evErr && delegatedEvents) {
              owned = [...owned, ...delegatedEvents.map(e => ({ ...e, _delegateAccess: true }))];
            }
          }
        }
      } catch (delErr) {
        console.log('fetchMyEvents delegate lookup error:', delErr.message);
      }

      setEventsList(owned);
    } catch (err) {
      console.log('fetchMyEvents error:', err.message);
    } finally {
      setEventsLoading(false);
    }
  }

  function choosePickedEvent(chosen) {
    setPickedEvent(chosen);
    setLoading(true);
    fetchGuests(userId, chosen);
  }

  // Share/Send both need a real guest list to point their RSVP link at —
  // if one's already picked, just run the action; otherwise open the picker
  // and let the host attach one (or start a new one) instead of a dead end.
  function requireGuestList(action) {
    if (event?.id) { action(); return; }
    setLinkPickerModal(true);
  }

  async function linkInviteToEvent(chosenEvent) {
    setLinkingInvite(true);
    try {
      let ev = chosenEvent;
      if (!ev.invite_code) {
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        const { data, error } = await supabase
          .from('events').update({ invite_code: code }).eq('id', ev.id).select().single();
        if (error) throw error;
        ev = data;
      }
      choosePickedEvent(ev);
      if (editingDesignId) {
        await supabase.from('event_invite_designs').update({ event_id: ev.id }).eq('id', editingDesignId);
      }
      setLinkPickerModal(false);
      showAlert('Linked!', `This invite is now attached to "${ev.name}". Tap Share or Send again to continue.`);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setLinkingInvite(false);
    }
  }

  async function saveRename() {
    if (!renameInput.trim() || !event?.id) return;
    setRenaming(true);
    try {
      await renameEvent(event.id, renameInput);
      setDisplayName(renameInput.trim());
      setRenameModal(false);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setRenaming(false);
    }
  }

  async function fetchDelegates() {
    if (!event?.id) return;
    setDelegatesLoading(true);
    try {
      const { data, error } = await supabase
        .from('event_delegates')
        .select('*')
        .eq('event_id', event.id)
        .neq('status', 'revoked')
        .order('invited_at', { ascending: false });
      if (error) throw error;
      setDelegates(data || []);
    } catch (err) {
      console.log('fetchDelegates error:', err.message);
    } finally {
      setDelegatesLoading(false);
    }
  }

  function openDelegatesModal() {
    setDelegatesModal(true);
    fetchDelegates();
  }

  // delegatesModal's initial state can already be true on mount (openModal
  // === 'manageAccess', from GlobalSearch) — openDelegatesModal() above
  // only runs on a real tap, so that path alone would open the modal empty
  // (fetchDelegates() never called). Mirrors inviteModal's own
  // useEffect(() => {...}, [inviteModal, userId]) shape: fires once event.id
  // resolves, same as the tap path, just for the auto-opened case.
  useEffect(() => {
    if (openModal === 'manageAccess' && event?.id) fetchDelegates();
  }, [openModal, event?.id]);

  async function inviteDelegate() {
    const phone = delegatePhone.trim();
    if (phone.replace(/\D/g, '').length < 10) {
      showAlert('Invalid phone', 'Enter a valid 10-digit phone number.');
      return;
    }
    setInvitingDelegate(true);
    try {
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      const { data, error } = await supabase
        .from('event_delegates')
        .insert({ event_id: event.id, host_id: userId, delegate_phone: phone, invite_code: code, status: 'pending' })
        .select()
        .single();
      if (error) throw error;
      setDelegates(prev => [data, ...prev]);
      setDelegatePhone('');

      const number = toWhatsappNumber(phone);
      const link = `${PUBLIC_WEB_URL}/delegate/${code}`;
      const text = `You've been invited to help manage the guest list for "${displayName}" on Utsav. Tap to accept: ${link}`;
      if (number) {
        const url = `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
        Linking.openURL(url).catch(() => {
          showAlert('Invite created', `Could not open WhatsApp — share this link with them: ${link}`);
        });
      } else {
        showAlert('Invite created', `Share this link with them: ${link}`);
      }
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setInvitingDelegate(false);
    }
  }

  function revokeDelegate(delegate) {
    confirmDestructive(
      'Revoke access?',
      `${delegate.delegate_phone || 'This delegate'} will immediately lose access to this guest list.`,
      'Revoke',
      async () => {
        try {
          const { error } = await supabase.from('event_delegates').update({ status: 'revoked' }).eq('id', delegate.id);
          if (error) throw error;
          setDelegates(prev => prev.filter(d => d.id !== delegate.id));
        } catch (err) {
          showAlert('Error', err.message);
        }
      }
    );
  }

  async function createGuestList() {
    if (!newListName.trim()) {
      showAlert('Name required', 'Give this guest list a name — an event, city, or community works.');
      return;
    }
    setCreatingList(true);
    try {
      const { data, error } = await supabase
        .from('events')
        .insert({
          host_id: userId,
          name: newListName.trim(),
          invite_code: Math.random().toString(36).substring(2, 8).toUpperCase(),
        })
        .select()
        .single();
      if (error) throw error;

      // Same pairing EventPlanner.js does when it creates a guest list —
      // one consistent "guest list → named album" behavior everywhere a
      // new events row gets created, not just from the Plan flow.
      await supabase.from('albums').insert({ user_id: userId, name: newListName.trim(), event_id: data.id });

      // If this "+ New guest list" was reached from the invite-share link
      // picker (an unattached invite mid-edit), attach it to this brand-new
      // list too — otherwise it'd still have nowhere for its RSVP link to go.
      if (linkPickerModal && editingDesignId) {
        await supabase.from('event_invite_designs').update({ event_id: data.id }).eq('id', editingDesignId);
      }
      setLinkPickerModal(false);

      setEventsList(prev => [data, ...prev]);
      setNewListName('');
      setNewListModal(false);
      choosePickedEvent(data); // jump straight in so they can start adding guests
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setCreatingList(false);
    }
  }

  async function fetchGuests(uid, forEvent) {
    try {
      // Deliberately NOT filtering by owner_user_id here (which is always
      // the HOST's id, not necessarily the current session's — see
      // isDelegateView) — RLS is what actually gates access now (host's own
      // policy OR an accepted event_delegates row), same as PassIssue.js/
      // CreateBookingScreen.js's own guest queries. A delegate viewing their
      // own uid here would silently see zero guests if this stayed
      // owner-filtered, since the host owns every row, not the delegate.
      const { data, error } = await supabase
        .from('event_invitees')
        .select('*')
        .eq('event_id', forEvent.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setGuests(data || []);
    } catch (err) {
      console.log('fetchGuests error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveGuest() {
    if (!guestForm.name.trim()) {
      showAlert('Required', 'Enter guest name.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: guestForm.name.trim(),
        phone: guestForm.phone.trim(),
        tag: guestForm.tag.trim() || null,
      };
      // entry_type/household_size may not exist yet on this database (see
      // supabase/migrations/household_entries.sql — printed, not applied
      // automatically). Retry without them rather than block a guest save
      // over columns that are still pending, same defensive shape as every
      // other migration-ahead-of-schema write in this file.
      const householdPayload = guestForm.entryType === 'household'
        ? { entry_type: 'household', household_size: parseInt(guestForm.householdSize, 10) || null }
        : { entry_type: 'individual', household_size: null };

      if (editingGuestId) {
        let { data, error } = await supabase
          .from('event_invitees')
          .update({ ...payload, ...householdPayload })
          .eq('id', editingGuestId)
          .select()
          .single();
        if (error) {
          ({ data, error } = await supabase
            .from('event_invitees')
            .update(payload)
            .eq('id', editingGuestId)
            .select()
            .single());
        }
        if (error) throw error;
        setGuests(prev => prev.map(g => g.id === editingGuestId ? data : g));
        await syncGuestFunctions(editingGuestId, guestForm.functionIds);
      } else {
        // owner_user_id is always the EVENT'S HOST, never the current
        // session's uid outright — a delegate adding a guest must still
        // write the host's id here, or the row would end up owned by the
        // delegate instead and the host's own "Owner manages invitees"
        // policy would stop covering it. event.host_id falls back to
        // userId for the (normal, host-is-viewing) case where they match.
        let { data, error } = await supabase
          .from('event_invitees')
          .insert({ ...payload, ...householdPayload, event_id: event.id, owner_user_id: event.host_id || userId })
          .select()
          .single();
        if (error) {
          ({ data, error } = await supabase
            .from('event_invitees')
            .insert({ ...payload, event_id: event.id, owner_user_id: event.host_id || userId })
            .select()
            .single());
        }
        if (error) throw error;
        setGuests(prev => [...prev, data]);
        await syncGuestFunctions(data.id, guestForm.functionIds);
      }
      closeGuestModal();
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  function openEditGuest(guest) {
    setGuestForm({
      name: guest.name, phone: guest.phone || '', tag: guest.tag || '',
      functionIds: guestFunctionMap[guest.id] || [],
      entryType: guest.entry_type === 'household' ? 'household' : 'individual',
      householdSize: guest.household_size ? String(guest.household_size) : '',
    });
    setEditingGuestId(guest.id);
    setGuestModal(true);
  }

  function closeGuestModal() {
    setGuestModal(false);
    setGuestForm({ name: '', phone: '', tag: '', functionIds: [], entryType: 'individual', householdSize: '' });
    setEditingGuestId(null);
    if (reopenWaQueueAfterAddGuest) {
      setReopenWaQueueAfterAddGuest(false);
      setWaQueueModal(true);
    }
  }

  // Mirrors closeGuestModal()'s reopen-WA-queue behavior, for the same
  // reason: if the contacts picker was reached via "Send to guest list" ->
  // "Add new guest" -> "Import from Contacts", finishing (or cancelling)
  // the import should land back on the WA queue the host actually came
  // from, not the plain guest list.
  function closeContactsModal() {
    setContactsModal(false);
    if (reopenWaQueueAfterAddGuest) {
      setReopenWaQueueAfterAddGuest(false);
      setWaQueueModal(true);
    }
  }

  // Opens the existing quick-add form from inside the WhatsApp send-queue
  // modal — a host scanning that list for a missing guest shouldn't have to
  // back out to the main guest list first. Swaps modals rather than
  // stacking two <Modal>s at once (no precedent for that in this file).
  function addGuestFromWaQueue() {
    setWaQueueModal(false);
    setReopenWaQueueAfterAddGuest(true);
    setGuestModal(true);
  }

  function toggleGuestFormFunction(functionId) {
    setGuestForm(prev => ({
      ...prev,
      functionIds: prev.functionIds.includes(functionId)
        ? prev.functionIds.filter(id => id !== functionId)
        : [...prev.functionIds, functionId],
    }));
  }

  // Simplest correct sync for a many-to-many tag set: replace this guest's
  // rows wholesale rather than diffing adds/removes — the set is always
  // small (a handful of functions per event) and this is only called from
  // one explicit Save tap, not on every keystroke.
  async function syncGuestFunctions(guestId, functionIds) {
    if (eventFunctions.length === 0) return; // nothing to sync, table may not even exist yet
    try {
      const { error: deleteError } = await supabase.from('event_invitee_functions').delete().eq('invitee_id', guestId);
      if (deleteError) throw deleteError;
      if (functionIds.length > 0) {
        const { error: insertError } = await supabase.from('event_invitee_functions')
          .insert(functionIds.map(function_id => ({ invitee_id: guestId, function_id })));
        if (insertError) throw insertError;
      }
      setGuestFunctionMap(prev => ({ ...prev, [guestId]: functionIds }));
    } catch (err) {
      // event_invitee_functions may not exist yet on this database — log,
      // don't block/alert over a still-pending migration; the guest's own
      // core fields (name/phone/tag) already saved successfully by this point.
      console.log('syncGuestFunctions error:', err.message);
    }
  }

  // Single-chip instant toggle for GuestDetailModal — add/remove ONE row,
  // not a wholesale replace (unlike syncGuestFunctions, which is only ever
  // called once per Save tap from the quick add/edit form).
  async function toggleGuestFunction(guestId, functionId) {
    const current = guestFunctionMap[guestId] || [];
    const isActive = current.includes(functionId);
    const next = isActive ? current.filter(id => id !== functionId) : [...current, functionId];
    setGuestFunctionMap(prev => ({ ...prev, [guestId]: next }));
    try {
      if (isActive) {
        const { error } = await supabase.from('event_invitee_functions')
          .delete().eq('invitee_id', guestId).eq('function_id', functionId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('event_invitee_functions')
          .insert({ invitee_id: guestId, function_id: functionId });
        if (error) throw error;
      }
    } catch (err) {
      showAlert('Error', err.message);
      setGuestFunctionMap(prev => ({ ...prev, [guestId]: current })); // revert optimistic update
    }
  }

  async function openContactsImport() {
    if (Platform.OS === 'web') {
      showAlert('Not available on web', 'Importing contacts works in the Utsav mobile app.');
      return;
    }
    setContactsLoading(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Permission needed', 'Please allow access to your contacts to import guests.');
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
      });
      const withPhones = (data || [])
        .filter(c => c.name && c.phoneNumbers?.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name));
      setContactsList(withPhones);
      setSelectedContacts(new Set());
      setContactsSearch('');
      // Deliberately NOT closeGuestModal() — that fires the "reopen WA
      // queue" side effect meant for actually leaving the add-guest flow,
      // which this isn't: we're swapping straight into the contacts
      // picker, not exiting. Was the actual bug (reported: opening the
      // contacts picker via Send to guest list -> Add new guest ->
      // Import from Contacts briefly showed the WA queue again on the
      // first tap) — both waQueueModal and contactsModal ended up true at
      // once. closeContactsModal() carries the equivalent reopen behavior
      // now, for whenever the contacts flow actually finishes.
      setGuestModal(false);
      setGuestForm({ name: '', phone: '', tag: '', functionIds: [], entryType: 'individual', householdSize: '' });
      setContactsModal(true);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setContactsLoading(false);
    }
  }

  // Single-pick variant, opened from the Edit Guest modal for a guest who
  // was saved with just a name — layers the picker on top instead of
  // closing the edit modal (unlike openContactsImport above), so the
  // in-progress name/tag edits in guestForm aren't lost.
  async function openContactsPickForPhone() {
    if (Platform.OS === 'web') {
      showAlert('Not available on web', 'Importing a contact works in the Utsav mobile app.');
      return;
    }
    setContactsLoading(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Permission needed', 'Please allow access to your contacts to import a phone number.');
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
      });
      const withPhones = (data || [])
        .filter(c => c.name && c.phoneNumbers?.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name));
      setContactsList(withPhones);
      setContactsSearch('');
      setPhonePickModal(true);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setContactsLoading(false);
    }
  }

  function pickPhoneFromContact(contact) {
    const number = contact.phoneNumbers?.[0]?.number?.trim() || '';
    setGuestForm(prev => ({ ...prev, phone: number }));
    setPhonePickModal(false);
  }

  function toggleContactSelection(id) {
    setSelectedContacts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function importSelectedContacts() {
    if (selectedContacts.size === 0) {
      closeContactsModal();
      return;
    }
    setImporting(true);
    try {
      const toImport = contactsList.filter(c => selectedContacts.has(c.id));
      const rows = toImport.map(c => ({
        event_id: event.id,
        owner_user_id: event.host_id || userId, // see saveGuest()'s comment — must stay the host's id
        name: c.name,
        phone: c.phoneNumbers[0]?.number?.trim() || '',
      }));
      const { data, error } = await supabase
        .from('event_invitees')
        .insert(rows)
        .select();
      if (error) throw error;
      setGuests(prev => [...prev, ...(data || [])]);
      closeContactsModal();
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setImporting(false);
    }
  }

  async function cycleRsvp(guest) {
    const order = ['pending', 'yes', 'maybe', 'no'];
    const next = order[(order.indexOf(guest.rsvp_status) + 1) % order.length];
    // A host tapping this chip IS logging on the guest's behalf, whether or
    // not they frame it that way — same rsvp_source as the more deliberate
    // "Log RSVP" entry point in GuestDetailModal, just without a note.
    setGuests(prev => prev.map(g => g.id === guest.id ? { ...g, rsvp_status: next, rsvp_source: 'host_logged' } : g));
    // event_invitees.rsvp_source may not exist yet on this database — this
    // is this app's single most-tapped RSVP write (no confirmation, no
    // error surfaced before this change either), so retry without it rather
    // than have every tap silently no-op until the migration lands.
    let { error } = await supabase.from('event_invitees').update({ rsvp_status: next, rsvp_source: 'host_logged' }).eq('id', guest.id);
    if (error) {
      ({ error } = await supabase.from('event_invitees').update({ rsvp_status: next }).eq('id', guest.id));
    }
    if (error) console.log('cycleRsvp error:', error.message);
  }

  // Backs GuestDetailModal's Save button and its instant check-in toggle —
  // optimistic local update (both the list and, if open, the modal's own
  // guest prop) then the real write, matching cycleRsvp()'s pattern above.
  const TRAVEL_PATCH_KEYS = [
    'is_outstation', 'arrival_date', 'arrival_time', 'arrival_details',
    'departure_date', 'departure_time', 'pickup_needed', 'pickup_notes',
    'accommodation_id', 'room_number',
  ];

  async function saveGuestDetails(guestId, patch) {
    setGuests(prev => prev.map(g => g.id === guestId ? { ...g, ...patch } : g));
    setDetailGuest(prev => (prev && prev.id === guestId ? { ...prev, ...patch } : prev));
    let attempt = patch;
    let { error } = await supabase.from('event_invitees').update(attempt).eq('id', guestId);
    // rsvp_source/host_logged_note may not exist yet on this database — if
    // this patch included the new "Log RSVP" fields and failed, retry with
    // just those stripped so the rest of the save (food_pref/gift/VIP/etc.)
    // still lands instead of the whole Save silently failing.
    if (error && ('rsvp_source' in attempt || 'host_logged_note' in attempt)) {
      const { rsvp_source, host_logged_note, ...rest } = attempt;
      attempt = rest;
      ({ error } = await supabase.from('event_invitees').update(attempt).eq('id', guestId));
    }
    // Same defensive shape for the travel/accommodation columns
    // (supabase/migrations/outstation_travel.sql — printed, not applied
    // automatically) — strip those too, from whatever attempt got this far,
    // rather than let a still-pending migration block every other field.
    if (error && TRAVEL_PATCH_KEYS.some(k => k in attempt)) {
      const rest = { ...attempt };
      TRAVEL_PATCH_KEYS.forEach(k => delete rest[k]);
      attempt = rest;
      ({ error } = await supabase.from('event_invitees').update(attempt).eq('id', guestId));
    }
    if (error) showAlert('Error', error.message);
  }

  // Acknowledges the "guest changed their name/phone" flag once the host
  // has actually opened this guest's detail view — same clear-on-view
  // shape notifications.is_read already uses. Deliberately silent on
  // failure (not saveGuestDetails' generic error alert) since
  // info_changed_at may not exist yet on this database and clearing a
  // best-effort flag isn't worth surfacing an error over.
  async function clearInfoChangedFlag(guestId) {
    setGuests(prev => prev.map(g => g.id === guestId ? { ...g, info_changed_at: null } : g));
    const { error } = await supabase.from('event_invitees').update({ info_changed_at: null }).eq('id', guestId);
    if (error) console.log('clearInfoChangedFlag skipped:', error.message);
  }

  // Host-manual check-in — for guests who never scan/tap/geofence at all
  // (a large share of real guests, especially older relatives, per this
  // task's whole premise). Unlike saveGuestDetails() above, this goes
  // through the host's own session directly (event_invitees' existing
  // "Owner manages invitees" RLS policy already covers it — no RPC needed,
  // this is the host writing their own event's data, not a guest writing
  // someone else's) and adds a DB-level guard the generic patch-apply
  // doesn't: `.is('checked_in_at', null)` so this can never clobber a
  // genuine scan/proximity/geofence check-in that landed in the moment
  // between this modal opening and the host tapping the button.
  async function markGuestArrived(guestId) {
    const now = new Date().toISOString();
    setGuests(prev => prev.map(g => g.id === guestId ? { ...g, checked_in_at: now, checkin_source: 'host_manual' } : g));
    setDetailGuest(prev => (prev && prev.id === guestId ? { ...prev, checked_in_at: now, checkin_source: 'host_manual' } : prev));
    const { error } = await supabase.from('event_invitees')
      .update({ checked_in_at: now, checkin_source: 'host_manual' })
      .eq('id', guestId).is('checked_in_at', null);
    if (error) showAlert('Error', error.message);
  }

  async function removeGuest(guest) {
    confirmDestructive('Remove guest?', guest.name, 'Remove', async () => {
      await supabase.from('event_invitees').delete().eq('id', guest.id);
      setGuests(prev => prev.filter(g => g.id !== guest.id));
    });
  }

  // Permanently deletes the guest list AND the event entry it belongs to
  // (so it actually disappears from the picker, not just goes empty). The
  // linked album survives — its event_id FK is ON DELETE SET NULL — but
  // reverts to "face-matching not enabled" since the event it pointed to is
  // gone.
  function deleteGuestList(forEvent, guestCount) {
    confirmDestructive(
      'Delete guest list?',
      `This permanently deletes "${forEvent.name}"'s guest list${guestCount ? ` (${guestCount} guest${guestCount === 1 ? '' : 's'})` : ''}${forEvent.rekognition_collection_id ? ' and turns off face-matching for its album' : ''}. This cannot be undone.`,
      'Delete list',
      async () => {
        try {
          await deleteEventCascade(forEvent.id);
          setEventsList(prev => prev.filter(e => e.id !== forEvent.id));
          if (event?.id === forEvent.id) {
            if (pickedEvent) {
              setPickedEvent(null); // back to the picker, which now excludes this event
            } else {
              navigation.goBack(); // reached directly from an album — nothing left to show here
            }
          }
        } catch (err) {
          showAlert('Error', err.message);
        }
      }
    );
  }

  function pickEventType(type) {
    setTypeTouchedByHost(true);
    setInviteEventType(type);
    setInviteVariant('neutral');
    setTemplate(TEMPLATE_CATALOG[type][0]);
    updateActivePage('message', generateMessage(type, activePageData));
  }

  function pickTemplate(t) {
    setTemplate(t);
    setInviteVariant('neutral');
    // Message is independent of the visual template (color/motif) now —
    // only the event type + names drive it — so picking a different
    // template no longer touches the message text.
  }

  function shuffleMessage() {
    updateActivePage('message', generateMessage(inviteEventType, activePageData));
  }

  function pickVariant(v) {
    setInviteVariant(v);
  }

  function updateActivePage(field, value) {
    setPages(prev => prev.map((p, i) => {
      if (i !== activePage) return p;
      const next = { ...p, [field]: value };
      if (TRACKED_FIELDS.includes(field)) {
        next.fieldMeta = { ...p.fieldMeta, [field]: { autoFilled: false, snapshot: value } };
      }
      return next;
    }));
  }

  // The venue typed into the invite designer is also the canonical address
  // used to build the "View on Google Maps" link guests see on the RSVP
  // page — persist it to the event record (not just local page state) so it
  // survives reopening the designer and is available to the RSVP screen.
  function persistVenue(explicitValue, coords) {
    if (!event?.id) return;
    // Accepts an explicit value for the "just picked a suggestion" path,
    // where persisting needs to happen immediately rather than waiting for
    // blur — reading activePageData.venue there would race the state update
    // from onSelect and could persist the stale pre-selection text.
    const venue = (explicitValue ?? activePageData.venue)?.trim();
    if (!venue) return;
    // coords only ever arrives from the onSelect (suggestion-pick) path —
    // a manually-typed address with no picked suggestion has no known
    // coordinates, which is expected and not an error (see onBlur below).
    const hasCoords = coords?.lat != null && coords?.lng != null;
    const patch = hasCoords ? { venue, venue_lat: coords.lat, venue_lng: coords.lng } : { venue };
    const freezeSnapshot = () => setPages(prev => prev.map((p, i) => i === activePage
      ? { ...p, fieldMeta: { ...p.fieldMeta, venue: { snapshot: venue } } }
      : p));
    supabase.from('events').update(patch).eq('id', event.id)
      .then(({ error }) => {
        if (!error) { freezeSnapshot(); return; }
        // venue_lat/venue_lng may not exist yet on this database (the
        // coordinate-capture migration is applied separately, not
        // automatically) — venue TEXT must still save either way, so retry
        // without the coordinate fields rather than let a missing-column
        // error silently block the address itself from persisting.
        if (hasCoords) {
          supabase.from('events').update({ venue }).eq('id', event.id)
            .then(({ error: retryError }) => {
              if (retryError) { console.log('persistVenue error:', retryError.message); return; }
              freezeSnapshot();
            });
          return;
        }
        console.log('persistVenue error:', error.message);
      });
  }

  function addPage() {
    setPages(prev => [...prev, {
      id: Date.now(),
      title: '', hostName: '', message: '', date: '', time: '', venue: '', imageUri: null,
      subjectName: '', partner1Name: '', partner2Name: '',
      dietary: '', rsvpBy: '',
      fieldMeta: freshFieldMeta(),
    }]);
    setActivePage(pages.length);
  }

  function removePage(index) {
    if (pages.length <= 1) return;
    confirmDestructive('Remove this page?', 'This page and its content will be deleted.', 'Remove', () => {
      setPages(prev => prev.filter((_, i) => i !== index));
      setActivePage(prev => (prev >= index ? Math.max(0, prev - 1) : prev));
    });
  }

  async function pickImage() {
    if (Platform.OS === 'web') {
      showAlert('Not available on web', 'Adding photos works in the Utsav mobile app.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled) return;
    updateActivePage('imageUri', result.assets[0].uri);
  }

  async function pasteImage() {
    if (Platform.OS === 'web') {
      showAlert('Not available on web', 'Pasting images works in the Utsav mobile app.');
      return;
    }
    if (!ClipboardAPI) {
      showAlert('Not available yet', 'Image pasting needs a newer build of the app. Try "Add photo" instead for now.');
      return;
    }
    try {
      const hasImage = await ClipboardAPI.hasImageAsync();
      if (!hasImage) {
        showAlert('Nothing to paste', 'Copy an image first, then try pasting here.');
        return;
      }
      const image = await ClipboardAPI.getImageAsync({ format: 'png' });
      if (image?.data) updateActivePage('imageUri', image.data);
    } catch (err) {
      showAlert('Error', err.message);
    }
  }

  function removeImage() {
    updateActivePage('imageUri', null);
  }

  // A raster image can't carry embedded clickable regions, so the invite
  // goes out as an image (the design) plus a text caption with the two
  // links as plain tappable URLs — Venue opens Google Maps, RSVP opens the
  // guest-facing RSVP form. WhatsApp/SMS auto-link URLs in captions, so both
  // are one-tap for whoever receives it.
  // guestId optional — omitted (null) for every broadcast send (Share as
  // image / text fallback / the standalone "Invites" tool), which can't be
  // tied to one specific person; passed only by sendWhatsappTo(guest),
  // which genuinely knows who it's sending to. See linking.js's optional
  // :guestId? segment and submit-rsvp/index.ts's guest-id-anchored match.
  function buildInviteCaption(guestId = null) {
    const mapsLink = activePageData.venue ? googleMapsUrl(activePageData.venue) : null;
    const rsvpLink = eventInviteCode
      ? `${PUBLIC_WEB_URL}/rsvp/${eventInviteCode}${guestId ? `/${guestId}` : ''}`
      : (event?.id ? `${PUBLIC_WEB_URL}/event/${event.id}` : PUBLIC_WEB_URL);

    return [
      activePageData.title,
      activePageData.message,
      [activePageData.date, activePageData.time].filter(Boolean).join(' · ') || null,
      mapsLink ? `📍 Venue: ${mapsLink}` : null,
      `✅ RSVP: ${rsvpLink}`,
    ].filter(Boolean).join('\n\n');
  }

  // Number-targeted share (wa.me, or react-native-share's shareSingle with
  // whatsAppNumber) was tested on a real Android device and confirmed to
  // silently drop the attached image the moment a number is pre-selected —
  // WhatsApp just doesn't honor media extras on that path. The clipboard
  // "copy image, long-press-paste yourself" workaround this used to fall
  // back to was never true automatic attachment, which is what actually
  // matters here. The only method confirmed to genuinely auto-attach the
  // image is the SAME general share sheet "Share as image" already uses
  // (NativeShare.open with no whatsAppNumber) — the trade is the host picks
  // WhatsApp then the guest's chat themselves (one extra tap) instead of it
  // opening pre-selected, which is the honest cost of an actual attachment.
  async function sendWhatsappTo(guest) {
    const number = toWhatsappNumber(guest.phone);
    if (!number) {
      showAlert('No phone number', `${guest.name} doesn't have a valid phone number saved.`);
      return;
    }
    const personalized = `Dear ${guest.name} Ji,\n\n${buildInviteCaption(guest.id)}`;

    if (Platform.OS !== 'web' && NativeShare && cardRef.current) {
      try {
        const uri = await cardRef.current.capture();
        await NativeShare.open({ url: uri, message: personalized, failOnCancel: false });
      } catch (err) {
        console.log('Invite image share failed:', err.message);
        showAlert('Could not share', 'Make sure WhatsApp is installed, or use "Share as image" instead.');
        return;
      }
    } else {
      // Web has no NativeShare module at all (guarded at import time) —
      // wa.me stays the only option there, text-only, same as before.
      const url = `https://wa.me/${number}?text=${encodeURIComponent(personalized)}`;
      Linking.openURL(url).catch(() => {
        showAlert('Could not open WhatsApp', 'Make sure WhatsApp is installed, or use "Share as image" instead.');
      });
    }

    // Persisted per-guest send tracking — replaces the old session-only
    // waSentIds Set, which reset every time this modal reopened.
    const sentAt = new Date().toISOString();
    setGuests(prev => prev.map(g => g.id === guest.id ? { ...g, invite_sent_at: sentAt } : g));
    supabase.from('event_invitees').update({ invite_sent_at: sentAt }).eq('id', guest.id)
      .then(({ error }) => { if (error) console.log('invite_sent_at update error:', error.message); });
  }

  // A short, distinct nudge — not the full invite caption again (that's
  // what already went out; re-sending it would just look like a duplicate
  // invite, not a reminder). Same one-chat-at-a-time wa.me pattern as
  // sendWhatsappTo — this app has no bulk WhatsApp blast mechanism by
  // design, and a reminder doesn't need the image-attach dance at all
  // (plain text is the right weight for a nudge), so this is simpler than
  // sendWhatsappTo, not a copy of it.
  async function sendRsvpReminder(guest) {
    const number = toWhatsappNumber(guest.phone);
    if (!number) {
      showAlert('No phone number', `${guest.name} doesn't have a valid phone number saved.`);
      return;
    }
    const rsvpLink = eventInviteCode
      ? `${PUBLIC_WEB_URL}/rsvp/${eventInviteCode}/${guest.id}`
      : (event?.id ? `${PUBLIC_WEB_URL}/event/${event.id}` : PUBLIC_WEB_URL);
    const text = `Hi ${guest.name}! Just a quick reminder to RSVP for ${displayName || 'the event'} — we'd love to know if you're coming: ${rsvpLink}`;
    const url = `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
    Linking.openURL(url).catch(() => {
      showAlert('Could not open WhatsApp', 'Make sure WhatsApp is installed.');
    });

    const sentAt = new Date().toISOString();
    setGuests(prev => prev.map(g => g.id === guest.id ? { ...g, rsvp_reminder_sent_at: sentAt } : g));
    supabase.from('event_invitees').update({ rsvp_reminder_sent_at: sentAt }).eq('id', guest.id)
      .then(({ error }) => { if (error) console.log('rsvp_reminder_sent_at update error:', error.message); });
  }

  // wa.me is text-only (see sendWhatsappTo's own comment on why there's no
  // true one-tap bulk blast) — a pass is an image, so the realistic "send
  // every pass over WhatsApp" is one combined multi-page PDF through the
  // system share sheet, WhatsApp included, in a single tap instead of one
  // wa.me chat per guest.
  async function sendAllPasses() {
    if (Platform.OS === 'web' || !Print || !Sharing) {
      showAlert('Not available on web', 'Open the Utsav app on your phone to share passes.');
      return;
    }
    setSendingAllPasses(true);
    try {
      const { data: passes, error } = await supabase
        .from('guest_passes').select('guest_id, pass_code, party_size, status').eq('event_id', event.id);
      if (error) throw error;
      if (!passes || passes.length === 0) {
        showAlert('No passes issued yet', 'Issue gate passes first, from the Gate passes tool above.');
        return;
      }

      const guestIds = [...new Set(passes.map(p => p.guest_id).filter(Boolean))];
      const { data: passGuests } = await supabase.from('event_invitees').select('id, name').in('id', guestIds);
      const nameById = {};
      (passGuests || []).forEach(g => { nameById[g.id] = g.name; });

      const QRCode = require('qrcode-svg');
      const html = buildPassCardHtml(passes.map(p => {
        const raw = new QRCode({ content: `${PUBLIC_WEB_URL}/p/${p.pass_code}`, width: 160, height: 160, padding: 4, color: '#000000', background: '#ffffff', ecl: 'M' }).svg();
        return {
          guestName: nameById[p.guest_id] || 'Guest',
          partySize: p.party_size || 1,
          venueLabel: null,
          venueAddress: null,
          dateLabel: event.event_date ? new Date(event.event_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null,
          entryWindow: null,
          passCode: p.pass_code,
          qrSvgString: raw.replace(/^<\?xml[^>]*\?>\s*/, ''),
        };
      }));

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'All gate passes', UTI: 'com.adobe.pdf' });
      } else {
        showAlert('Saved', 'Gate passes PDF created.');
      }
    } catch (err) {
      showAlert('Error', err.message || 'Could not create the passes PDF.');
    } finally {
      setSendingAllPasses(false);
    }
  }

  // Per-guest pass send — a single-item buildPassCardHtml() call, same
  // shape sendAllPasses() already uses for the combined PDF. Reuses
  // sendWhatsappTo()'s CURRENT mechanism (NativeShare.open with no
  // whatsAppNumber — genuine auto-attach via the general share sheet), not
  // the older clipboard-copy workaround that used to sit there before this
  // session's WhatsApp-attach fix — that code path no longer exists in this
  // file, so this follows what's actually there today.
  async function sendPassToGuest(guest) {
    if (Platform.OS === 'web' || !Print || !Sharing) {
      showAlert('Not available on web', 'Open the Utsav app on your phone to send a pass.');
      return;
    }
    try {
      const { data: pass, error } = await supabase.from('guest_passes')
        .select('pass_code, party_size, status').eq('event_id', event.id).eq('guest_id', guest.id).maybeSingle();
      if (error) throw error;
      if (!pass) {
        showAlert('No pass issued yet', "Issue a gate pass for this guest first, from the Gate passes tool.");
        return;
      }

      const QRCode = require('qrcode-svg');
      const raw = new QRCode({ content: `${PUBLIC_WEB_URL}/p/${pass.pass_code}`, width: 160, height: 160, padding: 4, color: '#000000', background: '#ffffff', ecl: 'M' }).svg();
      const html = buildPassCardHtml([{
        guestName: guest.name,
        partySize: pass.party_size || 1,
        venueLabel: resolvedPlanContext?.venue?.label || null,
        venueAddress: resolvedPlanContext?.venue?.address || null,
        dateLabel: resolvedPlanContext?.dateLabel || null,
        entryWindow: null,
        passCode: pass.pass_code,
        qrSvgString: raw.replace(/^<\?xml[^>]*\?>\s*/, ''),
      }]);
      const { uri } = await Print.printToFileAsync({ html, base64: false });

      if (NativeShare) {
        await NativeShare.open({ url: uri, message: `${guest.name}'s gate pass`, failOnCancel: false });
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${guest.name}'s pass`, UTI: 'com.adobe.pdf' });
      } else {
        showAlert('Saved', 'Pass created.');
      }
    } catch (err) {
      showAlert('Error', err.message || 'Could not create the pass.');
    }
  }

  // Reached via the standalone "Invites" tool tile, no guest list picked —
  // buildInviteCaption() would fall back to the bare PUBLIC_WEB_URL with no
  // invite code, which is a dead end for guests. requireGuestList() offers
  // the link picker instead of sharing something non-functional; save-as-
  // design still works without an event either way.
  function shareInvite() {
    requireGuestList(doShareInvite);
  }

  // Per-guest share, reachable from GuestDetailModal — the WhatsApp queue
  // (waQueueModal) only ever lists guests with a phone number
  // (`guests.filter(g => g.phone)`), so a guest with only an email/other
  // contact method was previously a dead end no matter how the invite
  // designer was used. Deliberately independent of the designer's own
  // pages/activePageData (a saved design might not exist at all) — built
  // straight from the event's own already-resolved data instead.
  function shareInviteToGuest(guest) {
    const rsvpLink = eventInviteCode
      ? `${PUBLIC_WEB_URL}/rsvp/${eventInviteCode}/${guest.id}`
      : (event?.id ? `${PUBLIC_WEB_URL}/event/${event.id}` : PUBLIC_WEB_URL);
    const text = [
      `Dear ${guest.name} Ji,`,
      `You're invited to ${displayName || event?.name || 'our event'}!`,
      resolvedPlanContext?.dateLabel || null,
      resolvedPlanContext?.venue?.label ? `📍 ${resolvedPlanContext.venue.label}` : null,
      `✅ RSVP: ${rsvpLink}`,
    ].filter(Boolean).join('\n\n');
    Share.share({ message: text }).catch(err => console.log('shareInviteToGuest error:', err.message));
  }

  // Fixed template, not the invite system's MESSAGE_PARTS/generateMessage()
  // opener/middle/closer recombination — that machinery is tailored to
  // invite tone/content (event type, RSVP framing) and doesn't map cleanly
  // onto a short thank-you; a single warm fixed template is the right size
  // for this, not a reason to extend the invite generator's scope.
  function sendThankYou(guest) {
    confirmAction(
      'Send a thank-you?',
      `Let ${guest.name} know their gift was appreciated — sent the same way as invites, one WhatsApp chat at a time.`,
      'Send',
      () => {
        const number = toWhatsappNumber(guest.phone);
        if (!number) {
          showAlert('No phone number', `${guest.name} doesn't have a valid phone number saved.`);
          return;
        }
        const giftMention = guest.gift_type === 'item' && guest.gift_note ? ` for the ${guest.gift_note}` : '';
        const text = `Dear ${guest.name} Ji,\n\nThank you so much${giftMention} — it meant a lot to us that you could celebrate ${displayName || 'this occasion'} with us! 🙏`;
        const url = `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
        Linking.openURL(url).catch(() => {
          showAlert('Could not open WhatsApp', 'Make sure WhatsApp is installed.');
        });

        const sentAt = new Date().toISOString();
        setGuests(prev => prev.map(g => g.id === guest.id ? { ...g, thank_you_sent_at: sentAt } : g));
        supabase.from('event_invitees').update({ thank_you_sent_at: sentAt }).eq('id', guest.id)
          .then(({ error }) => { if (error) console.log('thank_you_sent_at update error:', error.message); });
      }
    );
  }

  // Text-only fallback via the OS share sheet — buildInviteCaption() is
  // already plain, WhatsApp-agnostic text (title/message/date-time/venue
  // link/RSVP link joined by blank lines, no markdown), so it's reusable
  // as-is; no bespoke email-sending infra needed, the share sheet itself
  // offers Mail/Messages/whatever's installed. This is the ONLY invite-
  // sending path for a guest with no phone number entered at all (the
  // WhatsApp queue filters to `guests.filter(g => g.phone)`), so it needs
  // requireGuestList the same way shareInvite() does — no point offering a
  // dead RSVP link when reached standalone with no event picked.
  function shareInviteText() {
    requireGuestList(async () => {
      const caption = buildInviteCaption();
      try {
        await Share.share({ message: caption });
        markInvitesSent();
      } catch (err) {
        console.log('shareInviteText error:', err.message);
      }
    });
  }

  async function doShareInvite() {
    setSharing(true);
    try {
      const caption = buildInviteCaption();

      // ViewShot capture has no meaningful web equivalent — share as text
      // there. Many desktop browsers don't implement the Web Share API at
      // all, so Share.share() can reject outright — Alert.alert() renders
      // nothing on web (RN-Web gotcha), so falling into the outer catch
      // would look like the button silently did nothing. Fall back to
      // copying the caption (with both links) to the clipboard instead.
      if (Platform.OS === 'web') {
        try {
          await Share.share({ message: caption });
        } catch (shareErr) {
          if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(caption);
            window.alert("Your browser can't open a share sheet, so the invite text — including the RSVP and venue links — was copied to your clipboard. Paste it anywhere to send.");
          } else {
            window.alert(caption);
          }
        }
        markInvitesSent();
        return;
      }

      const uri = await cardRef.current.capture();
      // react-native-share builds a real combined intent on both platforms,
      // so the image and the RSVP/venue links go out as a single share
      // action — no second dialog, no reliance on a JS timer that Android
      // could throttle while the share sheet has focus (the actual cause of
      // the earlier "links not sharing" bug).
      await NativeShare.open({
        url: uri,
        message: caption,
        failOnCancel: false, // user backing out of the share sheet isn't an error
      });
      markInvitesSent();
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSharing(false);
    }
  }

  // Fire-and-forget: marks this event's "Send guest invites" to-do item done,
  // if it has one and it isn't already. Doesn't block or fail sharing if the
  // to-do list was never opened for this event (no matching row exists yet).
  function markInvitesSent() {
    if (!event?.id) return;
    supabase.from('event_todos')
      .update({ status: 'done', updated_at: new Date().toISOString() })
      .eq('event_id', event.id).eq('category', 'invites').eq('status', 'pending')
      .then(({ error }) => { if (error) console.log('markInvitesSent error:', error.message); });

    // Stamp once, on the first share only — a scheduled job reads this to
    // send the host a 24h-later reminder about guests still pending. Only
    // set where still null so re-sharing doesn't keep pushing the clock.
    supabase.from('events')
      .update({ invites_sent_at: new Date().toISOString() })
      .eq('id', event.id).is('invites_sent_at', null)
      .then(({ error }) => { if (error) console.log('stamp invites_sent_at error:', error.message); });
  }

  // A guest with NO function rows at all (never tagged — covers imported/
  // CSV/contacts-added guests, guests added before any function existed,
  // and a host who just never got around to tagging someone) is "invited
  // to everything," same as this whole feature's stated default — so they
  // must show up under EVERY specific function filter, not just "All".
  // Only a guest with at least one explicit tag gets actually narrowed to
  // just those functions. Centralized here since three separate call sites
  // (summary numbers, row filter, invite-queue filter) all need the exact
  // same rule — duplicating the untagged-means-everyone check three times
  // would be an easy place for them to quietly drift apart.
  function isGuestInFunction(guest, functionId) {
    const ids = guestFunctionMap[guest.id];
    if (!ids || ids.length === 0) return true;
    return ids.includes(functionId);
  }

  // Unlike the tag filter (which only ever affects the row list below, the
  // summary numbers above it stay whole-event regardless of tag), the
  // function filter DOES scope the summary numbers when active — "how many
  // are actually coming to just the sangeet" is a real number a host
  // planning catering/seating for that one function needs, unlike a tag
  // (a soft grouping label with no equivalent per-tag headcount use case).
  // Defaults to whole-event when no function filter is selected, same as
  // every other guest-list view in this app when nothing's actively scoped.
  const activeFunctionObj = activeFunctionFilter === 'All' ? null : eventFunctions.find(f => f.name === activeFunctionFilter);
  const guestsForSummary = activeFunctionObj
    ? guests.filter(g => isGuestInFunction(g, activeFunctionObj.id))
    : guests;

  const counts = {
    yes: guestsForSummary.filter(g => g.rsvp_status === 'yes').length,
    no: guestsForSummary.filter(g => g.rsvp_status === 'no').length,
    maybe: guestsForSummary.filter(g => g.rsvp_status === 'maybe').length,
    pending: guestsForSummary.filter(g => g.rsvp_status === 'pending').length,
  };
  // Confirmed headcount = each "yes" guest plus however many they said
  // they're bringing — this is the number that actually matters for
  // catering/seating, not just how many invitee rows exist.
  const headcount = guestsForSummary
    .filter(g => g.rsvp_status === 'yes')
    .reduce((sum, g) => sum + resolveGuestPartySize(g), 0);

  // The actual "who's driving to the airport when" view (Step 6) — pure
  // derivation over the already-fetched guests array, no new query, same
  // approach as headcount/mealCounts above. Missing arrival_date/time sort
  // to the end rather than the top, since "unknown arrival" is the least
  // actionable case to lead with.
  const pickupList = [...guests]
    .filter(g => g.pickup_needed)
    .sort((a, b) => {
      const ak = `${a.arrival_date || '9999'}${a.arrival_time || '99:99'}`;
      const bk = `${b.arrival_date || '9999'}${b.arrival_time || '99:99'}`;
      return ak < bk ? -1 : ak > bk ? 1 : 0;
    });

  // Every outstation guest, not just ones with an accommodation already
  // assigned — the host may be handing this list to the hotel BEFORE
  // finishing room assignments, and a guest who uploaded a govt ID but has
  // no accommodation_id yet still belongs on the list (just with a blank
  // "Stay" field), not silently dropped.
  const outstationGuestsForHotelList = guests.filter(g => g.is_outstation);

  // Fetches fresh signed URLs (7-day expiry — long enough for a hotel
  // coordinator to actually use the list, short enough not to be a
  // standing leak of private ID documents) and the host's own name/phone,
  // right before use rather than caching — this is a low-frequency action
  // (once per event, right before handing off to a vendor), so the
  // simplicity of "always fresh" outweighs the cost of re-fetching if the
  // host taps Share then Copy then PDF in one sitting.
  async function buildHotelListPayload() {
    const { data: host } = await supabase.from('users').select('name, phone').eq('id', event.host_id).maybeSingle();
    const guestsPayload = await Promise.all(outstationGuestsForHotelList.map(async g => {
      const acc = eventAccommodations.find(a => a.id === g.accommodation_id);
      const govtIdLink = g.govt_id_doc_path ? await getSignedGuestDocumentUrl(g.govt_id_doc_path, 7 * 86400) : null;
      const accompanyingPayload = await Promise.all((guestAccompanying[g.id] || []).map(async a => ({
        name: a.name,
        govtIdLink: a.govt_id_doc_path ? await getSignedGuestDocumentUrl(a.govt_id_doc_path, 7 * 86400) : null,
      })));
      return {
        name: g.name, phone: g.phone,
        accommodationName: acc?.name || null, roomNumber: g.room_number || null,
        arrivalDate: g.arrival_date, arrivalTime: g.arrival_time,
        departureDate: g.departure_date, departureTime: g.departure_time,
        govtIdLink, accompanying: accompanyingPayload,
      };
    }));
    return {
      eventName: displayName || event?.name || 'Event',
      eventDate: event?.event_date
        ? new Date(event.event_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
        : '',
      guests: guestsPayload,
      hostName: host?.name || '',
      hostPhone: host?.phone || '',
    };
  }

  function requireOutstationGuests() {
    if (outstationGuestsForHotelList.length === 0) {
      showAlert('No outstation guests', 'No guests have marked themselves as traveling from outside yet.');
      return false;
    }
    return true;
  }

  async function shareHotelListText() {
    if (!requireOutstationGuests()) return;
    setGeneratingHotelList(true);
    try {
      const text = buildHotelGuestListText(await buildHotelListPayload());
      await Share.share({ message: text });
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setGeneratingHotelList(false);
    }
  }

  async function copyHotelListText() {
    if (!requireOutstationGuests()) return;
    setGeneratingHotelList(true);
    try {
      const text = buildHotelGuestListText(await buildHotelListPayload());
      if (ClipboardAPI?.setStringAsync) {
        await ClipboardAPI.setStringAsync(text);
        showAlert('Copied', 'Guest list copied to clipboard.');
      } else if (Platform.OS === 'web' && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        showAlert('Copied', 'Guest list copied to clipboard.');
      } else {
        showAlert('Not available', 'Clipboard copy is not available on this device.');
      }
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setGeneratingHotelList(false);
    }
  }

  // PDF export is native-only, same established constraint this file's
  // other PDF feature (sendAllPasses) already has — Print/Sharing are only
  // loaded on native (see the top-of-file require() block and its own
  // comment on why). Not a new limitation introduced here.
  async function exportHotelListPdf() {
    if (!requireOutstationGuests()) return;
    if (Platform.OS === 'web' || !Print || !Sharing) {
      showAlert('Not available', 'PDF export works in the Utsav mobile app.');
      return;
    }
    setGeneratingHotelList(true);
    try {
      const html = buildHotelGuestListPdfHtml(await buildHotelListPayload());
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Outstation guest list', UTI: 'com.adobe.pdf' });
      }
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setGeneratingHotelList(false);
    }
  }

  // Meal/gift/arrival aggregates — all pure client-side reductions over the
  // already-fetched guests array, same "no new query" approach as headcount.
  const mealCounts = guestsForSummary
    .filter(g => g.rsvp_status === 'yes')
    .reduce((acc, g) => { const k = g.food_pref || 'any'; acc[k] = (acc[k] || 0) + 1; return acc; }, { any: 0, veg: 0, nonveg: 0, jain: 0 });
  const allergyList = guestsForSummary.filter(g => g.rsvp_status === 'yes' && g.allergies?.trim());

  const cashGiftTotal = guestsForSummary.filter(g => g.gift_type === 'cash').reduce((sum, g) => sum + (Number(g.gift_amount) || 0), 0);
  const itemGiftCount = guestsForSummary.filter(g => g.gift_type === 'item').length;
  const returnGiftsOwed = guestsForSummary.filter(g => g.rsvp_status === 'yes' && !g.return_gift_given).length;

  const arrivedCount = guestsForSummary.filter(g => g.checked_in_at).length;

  const usedTags = [...new Set(guests.map(g => g.tag).filter(Boolean))].sort();
  let filteredGuests = activeTagFilter === 'All' ? guests : guests.filter(g => g.tag === activeTagFilter);
  if (activeFunctionObj) filteredGuests = filteredGuests.filter(g => isGuestInFunction(g, activeFunctionObj.id));
  if (showVipOnly) filteredGuests = filteredGuests.filter(g => g.is_vip);

  // Reached standalone (no specific event passed in) — pick which event's
  // guest list to open first, so different events' guests never mix. The
  // Invite Designer tile is exempt: it works fine without an event context
  // (falls back to generic placeholders), so don't force a pick there.
  if (!event && !openDesigner) {
    return (
      <SafeAreaView style={s.container}>
        <AppHeader
          title="Guest Lists"
          onBack={() => navigation.goBack()}
          theme={theme}
          navigation={navigation}
          rightActions={[
            <TouchableOpacity key="add" style={s.addBtn} onPress={() => setNewListModal(true)}>
              <Plus size={20} color={theme.bg} />
            </TouchableOpacity>,
          ]}
        />

        {eventsLoading ? (
          <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
        ) : eventsList.length === 0 ? (
          <View style={s.empty}>
            <Users size={48} color={theme.border} />
            <Text style={s.emptyTitle}>No guest lists yet</Text>
            <Text style={s.emptySubtitle}>
              Name one after an event, city, or community — or enable guest face-matching on an album to link one automatically
            </Text>
            <TouchableOpacity style={s.emptyCta} onPress={() => setNewListModal(true)}>
              <Plus size={18} color={theme.bg} />
              <Text style={s.emptyCtaText}>New guest list</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={eventsList}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: 16, gap: 10 }}
            renderItem={({ item }) => (
              <SwipeableRow
                style={s.eventPickerCardWrap}
                onPress={() => choosePickedEvent(item)}
                onDelete={item._delegateAccess
                  ? () => showAlert('Not allowed', "Only the host can delete this event's guest list.")
                  : () => deleteGuestList(item)}
              >
                <View style={s.eventPickerCard}>
                  <View style={s.eventPickerIcon}>
                    <Text style={{ fontSize: 20 }}>🎊</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.guestName}>{item.name}</Text>
                    {item.event_date ? (
                      <Text style={s.guestPhone}>
                        {new Date(item.event_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </Text>
                    ) : null}
                    {item._delegateAccess ? (
                      <View style={s.delegateTag}>
                        <Text style={s.delegateTagText}>Delegate access</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </SwipeableRow>
            )}
          />
        )}

        <Modal
          visible={newListModal}
          transparent
          animationType="slide"
          onRequestClose={() => { setNewListModal(false); setNewListName(''); }}
        >
          <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={s.modal}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>New guest list</Text>
                <TouchableOpacity onPress={() => { setNewListModal(false); setNewListName(''); }}>
                  <X size={22} color={theme.text} />
                </TouchableOpacity>
              </View>
              <Text style={s.fieldLabel}>Name</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. Riya's Wedding, College Friends, Bandra"
                placeholderTextColor={theme.textSecondary}
                value={newListName}
                onChangeText={setNewListName}
                autoFocus
              />
              <TouchableOpacity style={s.saveBtn} onPress={createGuestList} disabled={creatingList}>
                {creatingList ? <ActivityIndicator color={theme.bg} /> : <Text style={s.saveBtnText}>Create list</Text>}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <AppHeader
        title={displayName ? `${displayName} · Guests` : 'Guest List'}
        onBack={() => navigation.goBack()}
        onTitlePress={isDelegateView ? undefined : () => { setRenameInput(displayName); setRenameModal(true); }}
        theme={theme}
        navigation={navigation}
        eventId={event?.id}
        rightActions={[
          ...(!isDelegateView ? [
            <TouchableOpacity
              key="delegates"
              style={s.deleteListBtn}
              onPress={openDelegatesModal}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <UserPlus size={17} color={theme.text} />
            </TouchableOpacity>,
          ] : []),
          ...(!isDelegateView && guests.length > 0 ? [
            <TouchableOpacity
              key="delete"
              style={s.deleteListBtn}
              onPress={() => deleteGuestList(event, guests.length)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Trash size={17} color="#F44336" />
            </TouchableOpacity>,
          ] : []),
          <TouchableOpacity key="add" ref={addGuestBtnRef} style={s.addBtn} onPress={() => setGuestModal(true)}>
            <Plus size={20} color={theme.bg} />
          </TouchableOpacity>,
        ]}
      />
      {isDelegateView && <Text style={[s.delegateHeaderTag, { paddingHorizontal: 20, marginTop: -10, marginBottom: 10 }]}>Delegate access</Text>}

      {loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      ) : (
        <>
          {/* RSVP summary */}
          <View style={s.summaryCard}>
            {showRsvpTracking && Object.entries(RSVP).map(([key, val]) => (
              <View key={key} style={s.summaryItem}>
                <Text style={[s.summaryValue, { color: val.color }]}>{counts[key]}</Text>
                <Text style={s.summaryLabel}>{val.label}</Text>
              </View>
            ))}
            <View style={s.summaryItem}>
              <Text style={s.summaryValue}>{guests.length}</Text>
              <Text style={s.summaryLabel}>Total</Text>
            </View>
            <View style={s.summaryItem}>
              <Text style={[s.summaryValue, { color: theme.accent }]}>{headcount}</Text>
              <Text style={s.summaryLabel}>Headcount</Text>
            </View>
            <View style={s.summaryItem}>
              <Text style={[s.summaryValue, { color: '#4CAF50' }]}>{arrivedCount}</Text>
              <Text style={s.summaryLabel}>Arrived</Text>
            </View>
          </View>

          {/* Create/share invite CTA */}
          <TouchableOpacity ref={inviteCtaRef} style={s.inviteCta} onPress={openInviteDesigner}>
            <Palette size={18} color={theme.bg} />
            <Text style={s.inviteCtaText}>{eventHasInvite ? 'Share Invite' : 'Create & Share Invite'}</Text>
          </TouchableOpacity>

          {/* Cross-cutting tools added for meal/gift/seating/check-in tracking */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.utilityRowScroll} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
            {showMealPreferences && (
              <TouchableOpacity style={s.utilityChip} onPress={() => setMealCountsModal(true)}>
                <ForkKnife size={14} color={theme.text} />
                <Text style={s.utilityChipText}>Meal counts</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.utilityChip} onPress={() => setGiftsModal(true)}>
              <Gift size={14} color={theme.text} />
              <Text style={s.utilityChipText}>Gifts</Text>
            </TouchableOpacity>
            {counts.pending > 0 && (
              <TouchableOpacity style={s.utilityChip} onPress={() => setReminderQueueModal(true)}>
                <PaperPlaneTilt size={14} color={theme.text} />
                <Text style={s.utilityChipText}>Remind pending ({counts.pending})</Text>
              </TouchableOpacity>
            )}
            {!isDelegateView && (
              <TouchableOpacity style={s.utilityChip} onPress={openPlusOneLimitModal}>
                <Text style={{ fontSize: 14 }}>👥</Text>
                <Text style={s.utilityChipText}>
                  {plusOneLimit != null ? `+1 limit: ${plusOneLimit}` : 'Set +1 limit'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity ref={functionsChipRef} style={s.utilityChip} onPress={() => setFunctionsModal(true)}>
              <Text style={{ fontSize: 14 }}>🎊</Text>
              <Text style={s.utilityChipText}>
                {eventFunctions.length > 0 ? `Functions (${eventFunctions.length})` : '+ Functions'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.utilityChip} onPress={() => { setTravelTab('accommodations'); setTravelModal(true); }}>
              <Text style={{ fontSize: 14 }}>🧳</Text>
              <Text style={s.utilityChipText}>
                {pickupList.length > 0 ? `Travel (${pickupList.length} pickup)` : 'Travel'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.utilityChip} onPress={() => navigation.navigate('SeatingChart', { eventId: event.id })}>
              <Table size={14} color={theme.text} />
              <Text style={s.utilityChipText}>Seating</Text>
            </TouchableOpacity>
            {!isDelegateView && (
              <TouchableOpacity style={s.utilityChip} onPress={() => navigation.navigate('ToranInvites', { eventId: event.id })}>
                <PaperPlaneTilt size={14} color={theme.text} />
                <Text style={s.utilityChipText}>Toran invites</Text>
              </TouchableOpacity>
            )}
            {showRsvpTracking && !isDelegateView && (
              <TouchableOpacity style={s.utilityChip} onPress={() => navigation.navigate('RsvpDashboard', { eventId: event.id })}>
                <ChartBar size={14} color={theme.text} />
                <Text style={s.utilityChipText}>RSVP dashboard</Text>
              </TouchableOpacity>
            )}
            {showGatePass && !isDelegateView && (
              <TouchableOpacity ref={gatePassChipRef} style={s.utilityChip} onPress={() => navigation.navigate('GatePass', { eventId: event.id })}>
                <QrCode size={14} color={theme.text} />
                <Text style={s.utilityChipText}>Gate passes</Text>
              </TouchableOpacity>
            )}
            {showGatePass && !isDelegateView && (
              <TouchableOpacity style={s.utilityChip} onPress={sendAllPasses} disabled={sendingAllPasses}>
                {sendingAllPasses ? <ActivityIndicator size="small" color={theme.text} /> : (
                  <>
                    <PaperPlaneTilt size={14} color={theme.text} />
                    <Text style={s.utilityChipText}>Send all passes</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            {showVisitorList && (
              <TouchableOpacity style={s.utilityChip} onPress={() => navigation.navigate('VisitorList', { eventId: event.id })}>
                <Text style={{ fontSize: 14 }}>🚪</Text>
                <Text style={s.utilityChipText}>Gate list</Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          {/* Tag/VIP filter — only worth showing once there's something to filter by */}
          {(usedTags.length > 0 || (showVipFlagging && guests.some(g => g.is_vip))) && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tagFilterScroll} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
              {['All', ...usedTags].map(t => (
                <TouchableOpacity
                  key={t}
                  style={[s.tagFilterChip, activeTagFilter === t && s.tagFilterChipActive]}
                  onPress={() => setActiveTagFilter(t)}
                >
                  <Text style={[s.tagFilterChipText, activeTagFilter === t && s.tagFilterChipTextActive]}>
                    {t}{t !== 'All' ? ` (${guests.filter(g => g.tag === t).length})` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
              {showVipFlagging && guests.some(g => g.is_vip) && (
                <TouchableOpacity
                  style={[s.tagFilterChip, showVipOnly && s.tagFilterChipActive]}
                  onPress={() => setShowVipOnly(v => !v)}
                >
                  <Text style={[s.tagFilterChipText, showVipOnly && s.tagFilterChipTextActive]}>⭐ VIP only</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          )}

          {/* Function filter — deliberately a SEPARATE row from tag filter
              above, not merged into it: tag ("College Friends") and function
              ("Sangeet") are different groupings a host uses at the same
              time, and merging them into one chip row would make it
              ambiguous which kind a given chip is. Only shown once the host
              has defined functions for this event. */}
          {eventFunctions.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tagFilterScroll} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
              {['All', ...eventFunctions.map(f => f.name)].map(name => (
                <TouchableOpacity
                  key={name}
                  style={[s.tagFilterChip, activeFunctionFilter === name && s.tagFilterChipActive]}
                  onPress={() => setActiveFunctionFilter(name)}
                >
                  <Text style={[s.tagFilterChipText, activeFunctionFilter === name && s.tagFilterChipTextActive]}>
                    🎊 {name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Guest list */}
          {guests.length === 0 ? (
            <View style={s.empty}>
              <Users size={48} color={theme.border} />
              <Text style={s.emptyTitle}>No guests yet</Text>
              <Text style={s.emptySubtitle}>Tap + to add your first guest</Text>
            </View>
          ) : filteredGuests.length === 0 ? (
            <View style={s.empty}>
              <Users size={48} color={theme.border} />
              <Text style={s.emptyTitle}>No guests in "{activeTagFilter}"</Text>
            </View>
          ) : (
            <FlatList
              data={filteredGuests}
              keyExtractor={item => item.id}
              contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
              renderItem={({ item }) => {
                const rs = RSVP[item.rsvp_status] || RSVP.pending;
                return (
                  <SwipeableRow style={s.guestCardWrap} onPress={() => openEditGuest(item)} onDelete={() => removeGuest(item)}>
                    <View style={s.guestCard}>
                      <View style={s.guestAvatar}>
                        <Text style={s.guestAvatarText}>{item.name[0]}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          {showVipFlagging && item.is_vip ? <Star size={12} color="#F0A93F" weight="fill" /> : null}
                          <Text style={s.guestName}>{item.name}</Text>
                        </View>
                        {item.phone ? <Text style={s.guestPhone}>{item.phone}</Text> : null}
                        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                          {item.tag ? (
                            <View style={s.guestTagBadge}>
                              <Text style={s.guestTagBadgeText}>{item.tag}</Text>
                            </View>
                          ) : null}
                          {item.entry_type === 'household' ? (
                            <View style={[s.guestTagBadge, { backgroundColor: theme.accent + '22' }]}>
                              <Text style={[s.guestTagBadgeText, { color: theme.accent }]}>🏠 {item.household_size || 1} people</Text>
                            </View>
                          ) : item.plus_ones > 0 ? (
                            <View style={s.guestTagBadge}>
                              <Text style={s.guestTagBadgeText}>+{item.plus_ones} guest{item.plus_ones > 1 ? 's' : ''}</Text>
                            </View>
                          ) : null}
                          {item.entry_type !== 'household' && plusOneLimit != null && item.plus_ones > plusOneLimit ? (
                            <View style={[s.guestTagBadge, { backgroundColor: '#FFF3E0' }]}>
                              <Text style={[s.guestTagBadgeText, { color: '#E65100' }]}>⚠ over limit ({plusOneLimit})</Text>
                            </View>
                          ) : null}
                          {item.info_changed_at ? (
                            <View style={[s.guestTagBadge, { backgroundColor: '#FFF3E0' }]}>
                              <Text style={[s.guestTagBadgeText, { color: '#E65100' }]}>✎ Info updated</Text>
                            </View>
                          ) : null}
                          {showMealPreferences && item.food_pref && item.food_pref !== 'any' ? (
                            <View style={s.guestTagBadge}>
                              <Text style={s.guestTagBadgeText}>{FOOD_PREF_LABELS[item.food_pref] || item.food_pref}</Text>
                            </View>
                          ) : null}
                          {item.table_number ? (
                            <View style={s.guestTagBadge}>
                              <Text style={s.guestTagBadgeText}>🪑 Table {item.table_number}</Text>
                            </View>
                          ) : null}
                          {item.checked_in_at ? (
                            <View style={{ alignItems: 'flex-start' }}>
                              <View style={s.guestTagBadge}>
                                <Text style={s.guestTagBadgeText}>✓ Arrived</Text>
                              </View>
                              {item.checkin_source === 'host_manual' ? (
                                <Text style={s.sourceCaption}>logged by host</Text>
                              ) : null}
                            </View>
                          ) : item.invite_sent_at ? (
                            <View style={s.guestTagBadge}>
                              <Text style={s.guestTagBadgeText}>✉️ Sent {timeAgo(item.invite_sent_at)}</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      <TouchableOpacity
                        style={s.guestDetailBtn}
                        onPress={() => { setDetailGuest(item); if (item.info_changed_at) clearInfoChangedFlag(item.id); }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <DotsThreeVertical size={16} color={theme.textSecondary} />
                      </TouchableOpacity>
                      {showRsvpTracking && (
                        <View style={{ alignItems: 'center' }}>
                          <TouchableOpacity
                            style={[s.rsvpChip, { backgroundColor: rs.bg }]}
                            onPress={() => cycleRsvp(item)}
                          >
                            <Text style={[s.rsvpChipText, { color: rs.color }]}>{rs.label}</Text>
                          </TouchableOpacity>
                          {item.rsvp_source === 'host_logged' ? (
                            <Text style={s.sourceCaption}>via host</Text>
                          ) : null}
                        </View>
                      )}
                    </View>
                  </SwipeableRow>
                );
              }}
            />
          )}
        </>
      )}

      {/* ── Add/Edit Guest Modal ── */}
      <Modal visible={guestModal} transparent animationType="fade" onRequestClose={closeGuestModal}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editingGuestId ? 'Edit Guest' : 'Add Guest'}</Text>
              <TouchableOpacity onPress={closeGuestModal}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>
            <View style={s.tagSuggestRow}>
              <TouchableOpacity
                style={[s.tagSuggestChip, guestForm.entryType === 'individual' && s.tagSuggestChipActive]}
                onPress={() => setGuestForm(p => ({ ...p, entryType: 'individual' }))}
              >
                <Text style={[s.tagSuggestChipText, guestForm.entryType === 'individual' && { color: theme.accent }]}>Individual</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.tagSuggestChip, guestForm.entryType === 'household' && s.tagSuggestChipActive]}
                onPress={() => setGuestForm(p => ({ ...p, entryType: 'household' }))}
              >
                <Text style={[s.tagSuggestChipText, guestForm.entryType === 'household' && { color: theme.accent }]}>Household or family</Text>
              </TouchableOpacity>
            </View>
            <TextInput style={s.input}
              placeholder={guestForm.entryType === 'household' ? 'e.g. Sharma Family *' : 'Guest name *'}
              placeholderTextColor={theme.textSecondary}
              value={guestForm.name} onChangeText={v => setGuestForm(p => ({ ...p, name: v }))} autoFocus />
            <TextInput style={s.input} placeholder="Phone (optional)" placeholderTextColor={theme.textSecondary}
              value={guestForm.phone} onChangeText={v => setGuestForm(p => ({ ...p, phone: v }))} keyboardType="phone-pad" />
            {guestForm.entryType === 'household' && (
              <>
                <Text style={s.fieldLabel}>Estimated headcount</Text>
                <TextInput style={s.input} placeholder="e.g. 4" placeholderTextColor={theme.textSecondary}
                  value={guestForm.householdSize} onChangeText={v => setGuestForm(p => ({ ...p, householdSize: v.replace(/[^0-9]/g, '') }))}
                  keyboardType="number-pad" />
              </>
            )}
            {editingGuestId && !guestForm.phone.trim() && (
              <TouchableOpacity style={s.importPhoneLink} onPress={openContactsPickForPhone} disabled={contactsLoading}>
                {contactsLoading ? (
                  <ActivityIndicator size="small" color={theme.accent} />
                ) : (
                  <>
                    <AddressBook size={14} color={theme.accent} />
                    <Text style={s.importPhoneLinkText}>Import number from Contacts</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            <Text style={s.fieldLabel}>Group / Tag (optional)</Text>
            <TextInput style={s.input} placeholder="e.g. College Friends, Relatives, Delhi side"
              placeholderTextColor={theme.textSecondary}
              value={guestForm.tag} onChangeText={v => setGuestForm(p => ({ ...p, tag: v }))} />
            <View style={s.tagSuggestRow}>
              {SUGGESTED_TAGS.map(t => (
                <TouchableOpacity
                  key={t}
                  style={[s.tagSuggestChip, guestForm.tag === t && s.tagSuggestChipActive]}
                  onPress={() => setGuestForm(p => ({ ...p, tag: p.tag === t ? '' : t }))}
                >
                  <Text style={[s.tagSuggestChipText, guestForm.tag === t && { color: theme.accent }]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Only appears once the host has defined functions for this
                event (Functions chip above) — invisible for the common
                single-list case, never required. Distinct from Group/Tag
                above: a guest can be "College Friends" (tag) AND "Sangeet"
                (function) at once, two different groupings. */}
            {eventFunctions.length > 0 && (
              <>
                <Text style={s.fieldLabel}>Invited to which function(s)?</Text>
                <View style={s.tagSuggestRow}>
                  {eventFunctions.map(func => (
                    <TouchableOpacity
                      key={func.id}
                      style={[s.tagSuggestChip, guestForm.functionIds.includes(func.id) && s.tagSuggestChipActive]}
                      onPress={() => toggleGuestFormFunction(func.id)}
                    >
                      <Text style={[s.tagSuggestChipText, guestForm.functionIds.includes(func.id) && { color: theme.accent }]}>
                        {guestForm.functionIds.includes(func.id) ? '✓ ' : ''}{func.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={s.venueHint}>Leave all unchecked to invite them to everything.</Text>
              </>
            )}

            <TouchableOpacity style={s.saveBtn} onPress={saveGuest} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color={theme.bg} /> : (
                <Text style={s.saveBtnText}>{editingGuestId ? 'Update Guest' : 'Add Guest'}</Text>
              )}
            </TouchableOpacity>
            {!editingGuestId && (
              <TouchableOpacity style={s.importBtn} onPress={openContactsImport} disabled={contactsLoading}>
                {contactsLoading ? (
                  <ActivityIndicator size="small" color={theme.accent} />
                ) : (
                  <>
                    <AddressBook size={16} color={theme.accent} />
                    <Text style={s.importBtnText}>Import from Contacts</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Import from Contacts Modal ── */}
      <Modal visible={contactsModal} transparent animationType="slide" onRequestClose={closeContactsModal}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[s.modal, { maxHeight: '75%', paddingBottom: 0 }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Select guests to import</Text>
              <TouchableOpacity onPress={closeContactsModal}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>
            {contactsList.length === 0 ? (
              <Text style={s.emptySubtitle}>No contacts with phone numbers found.</Text>
            ) : (
              <>
                <View style={s.contactsSearchBox}>
                  <MagnifyingGlass size={16} color={theme.textSecondary} />
                  <TextInput
                    style={s.contactsSearchInput}
                    placeholder="Search contacts by name"
                    placeholderTextColor={theme.textSecondary}
                    value={contactsSearch}
                    onChangeText={setContactsSearch}
                    autoCapitalize="none"
                  />
                  {contactsSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setContactsSearch('')}>
                      <X size={16} color={theme.textSecondary} />
                    </TouchableOpacity>
                  )}
                </View>
                {(() => {
                  const filteredContacts = contactsSearch.trim()
                    ? contactsList.filter(c => c.name.toLowerCase().includes(contactsSearch.trim().toLowerCase()))
                    : contactsList;
                  return filteredContacts.length === 0 ? (
                    <Text style={[s.emptySubtitle, { paddingVertical: 20 }]}>No contacts match "{contactsSearch}".</Text>
                  ) : (
                    <FlatList
                      data={filteredContacts}
                      keyExtractor={item => item.id}
                      style={{ maxHeight: 340 }}
                      renderItem={({ item }) => {
                        const isSelected = selectedContacts.has(item.id);
                        return (
                          <TouchableOpacity
                            style={s.contactRow}
                            onPress={() => toggleContactSelection(item.id)}
                          >
                            <View style={[s.contactCheckbox, isSelected && s.contactCheckboxActive]}>
                              {isSelected && <Check size={13} color={theme.bg} />}
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={s.guestName}>{item.name}</Text>
                              <Text style={s.guestPhone}>{item.phoneNumbers[0]?.number}</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      }}
                    />
                  );
                })()}
              </>
            )}
            <TouchableOpacity
              style={[s.saveBtn, { marginVertical: 16 }]}
              onPress={importSelectedContacts}
              disabled={importing}
            >
              {importing ? (
                <ActivityIndicator size="small" color={theme.bg} />
              ) : (
                <Text style={s.saveBtnText}>
                  {selectedContacts.size > 0 ? `Import ${selectedContacts.size} guest${selectedContacts.size > 1 ? 's' : ''}` : 'Cancel'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Import a single contact's number, for the Edit Guest modal ── */}
      <Modal visible={phonePickModal} transparent animationType="slide" onRequestClose={() => setPhonePickModal(false)}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[s.modal, { maxHeight: '75%', paddingBottom: 0 }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Import phone number</Text>
              <TouchableOpacity onPress={() => setPhonePickModal(false)}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>
            {contactsList.length === 0 ? (
              <Text style={s.emptySubtitle}>No contacts with phone numbers found.</Text>
            ) : (
              <>
                <View style={s.contactsSearchBox}>
                  <MagnifyingGlass size={16} color={theme.textSecondary} />
                  <TextInput
                    style={s.contactsSearchInput}
                    placeholder="Search contacts by name"
                    placeholderTextColor={theme.textSecondary}
                    value={contactsSearch}
                    onChangeText={setContactsSearch}
                    autoCapitalize="none"
                  />
                  {contactsSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setContactsSearch('')}>
                      <X size={16} color={theme.textSecondary} />
                    </TouchableOpacity>
                  )}
                </View>
                {(() => {
                  const filteredContacts = contactsSearch.trim()
                    ? contactsList.filter(c => c.name.toLowerCase().includes(contactsSearch.trim().toLowerCase()))
                    : contactsList;
                  return filteredContacts.length === 0 ? (
                    <Text style={[s.emptySubtitle, { paddingVertical: 20 }]}>No contacts match "{contactsSearch}".</Text>
                  ) : (
                    <FlatList
                      data={filteredContacts}
                      keyExtractor={item => item.id}
                      style={{ maxHeight: 400, marginBottom: 16 }}
                      renderItem={({ item }) => (
                        <TouchableOpacity style={s.contactRow} onPress={() => pickPhoneFromContact(item)}>
                          <View style={{ flex: 1 }}>
                            <Text style={s.guestName}>{item.name}</Text>
                            <Text style={s.guestPhone}>{item.phoneNumbers[0]?.number}</Text>
                          </View>
                        </TouchableOpacity>
                      )}
                    />
                  );
                })()}
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Invite Designer Modal ── */}
      <Modal visible={inviteModal} animationType="slide" onRequestClose={closeInviteModal}>
        <SafeAreaView style={s.container}>
          <View style={s.header}>
            <TouchableOpacity onPress={closeInviteModal} style={s.backBtn}>
              <X size={22} color={theme.text} />
            </TouchableOpacity>
            <Text style={s.headerTitle}>Invites</Text>
            {designerTab === 'saved' ? (
              <TouchableOpacity onPress={startNewDesign} style={s.backBtn} accessibilityLabel="New invite">
                <Plus size={22} color={theme.text} />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 36 }} />
            )}
          </View>

          <View style={s.designerTabBar}>
            <TouchableOpacity
              style={[s.designerTab, designerTab === 'new' && s.designerTabActive]}
              onPress={() => (designerTab === 'saved' ? setDesignerTab('new') : startNewDesign())}
            >
              <Text style={[s.designerTabText, designerTab === 'new' && s.designerTabTextActive]}>
                {editingDesignId && designerTab === 'new' ? 'Editing' : '+ New invite'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.designerTab, designerTab === 'saved' && s.designerTabActive]}
              onPress={() => setDesignerTab('saved')}
            >
              <Text style={[s.designerTabText, designerTab === 'saved' && s.designerTabTextActive]}>
                My invites{savedDesigns.length > 0 ? ` (${savedDesigns.length})` : ''}
              </Text>
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {designerTab === 'saved' ? (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
              <Text style={s.modalHint}>
                Every design you've saved, across every event — load one to review, edit, or share it, duplicate it as a starting point, or remove it.
              </Text>
              {savedDesigns.length === 0 ? (
                <View style={[s.empty, { paddingTop: 60 }]}>
                  <ClipboardText size={40} color={theme.border} />
                  <Text style={s.emptyTitle}>No saved invites yet</Text>
                  <Text style={s.emptySubtitle}>Design one in "+ New invite" and tap "Save design" to keep it here.</Text>
                </View>
              ) : savedDesigns.map(item => {
                const tmpl = TEMPLATE_CATALOG[item.event_type]?.find(t => t.id === item.template_id) || TEMPLATE_CATALOG[item.event_type]?.[0];
                const colors = tmpl ? resolveTemplateColors(tmpl, item.variant) : { bg: '#ccc', accent: '#999' };
                return (
                  <SwipeableRow
                    key={item.id}
                    style={s.savedDesignRowWrap}
                    onPress={() => loadSavedDesign(item)}
                    onDelete={() => deleteSavedDesign(item)}
                  >
                    <View style={s.savedDesignRow}>
                      <View style={[s.savedDesignSwatch, { backgroundColor: colors.bg, borderColor: colors.accent }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.savedDesignLabel}>{item.label}</Text>
                        <Text style={s.savedDesignMeta}>
                          {item.event_type} · {formatSavedDesignDate(item)}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => duplicateSavedDesign(item)} style={{ padding: 4 }} accessibilityLabel={`Duplicate ${item.label}`}>
                        <ClipboardText size={16} color={theme.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  </SwipeableRow>
                );
              })}
            </ScrollView>
          ) : (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 60 }}>

            {/* Event type picker — only when it isn't already known from the
                event's own details; drives which templates are on offer below */}
            {!typeAutoDetected && (
              <>
                <Text style={s.sectionTitle}>Event type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {INVITE_STYLE_TYPES.map(et => (
                      <TouchableOpacity
                        key={et.id}
                        style={[s.typeChip, inviteEventType === et.id && s.typeChipActive]}
                        onPress={() => pickEventType(et.id)}
                      >
                        <Text style={s.typeChipIcon}>{et.icon}</Text>
                        <Text style={[s.typeChipText, inviteEventType === et.id && s.typeChipTextActive]}>{et.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}

            {/* Which function this design is for — only when the host has
                defined any. "For everyone" (null) is the default and
                matches this app's pre-existing behavior exactly. */}
            {eventFunctions.length > 0 && (
              <>
                <Text style={s.sectionTitle}>Which function is this invite for?</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={[s.typeChip, designFunctionId === null && s.typeChipActive]}
                      onPress={() => setDesignFunctionId(null)}
                    >
                      <Text style={[s.typeChipText, designFunctionId === null && s.typeChipTextActive]}>Everyone</Text>
                    </TouchableOpacity>
                    {eventFunctions.map(func => (
                      <TouchableOpacity
                        key={func.id}
                        style={[s.typeChip, designFunctionId === func.id && s.typeChipActive]}
                        onPress={() => setDesignFunctionId(func.id)}
                      >
                        <Text style={[s.typeChipText, designFunctionId === func.id && s.typeChipTextActive]}>{func.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}

            {/* Boy/girl/neutral palette — only meaningful for templates that offer it */}
            {template.hasVariant && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {['neutral', 'boy', 'girl'].map(v => (
                  <TouchableOpacity
                    key={v}
                    style={[s.variantChip, inviteVariant === v && s.variantChipActive]}
                    onPress={() => pickVariant(v)}
                  >
                    <Text style={[s.variantChipText, inviteVariant === v && s.variantChipTextActive]}>
                      {v === 'neutral' ? 'Neutral' : v === 'boy' ? 'Boy' : 'Girl'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Template picker */}
            <Text style={s.sectionTitle}>Template</Text>
            <View style={s.templateRow}>
              {TEMPLATE_CATALOG[inviteEventType].map(t => {
                const swatch = resolveTemplateColors(t, inviteVariant);
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[
                      s.templateSwatch,
                      { backgroundColor: swatch.bg },
                      template.id === t.id && { borderWidth: 2.5, borderColor: theme.accent }
                    ]}
                    onPress={() => pickTemplate(t)}
                  >
                    <View style={[s.templateDot, { backgroundColor: swatch.accent }]} />
                    <Text style={[s.templateName, { color: swatch.text }]}>{t.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Page navigator — only shown once there's more than one page */}
            {pages.length > 1 && (
              <View style={s.pageNavRow}>
                <TouchableOpacity
                  onPress={() => setActivePage(p => Math.max(0, p - 1))}
                  disabled={activePage === 0}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <CaretLeft size={18} color={activePage === 0 ? theme.border : theme.text} />
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {pages.map((p, i) => (
                    <TouchableOpacity key={p.id} onPress={() => setActivePage(i)}>
                      <View style={[s.pageDot, i === activePage && { backgroundColor: theme.accent }]} />
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  onPress={() => setActivePage(p => Math.min(pages.length - 1, p + 1))}
                  disabled={activePage === pages.length - 1}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <CaretRight size={18} color={activePage === pages.length - 1 ? theme.border : theme.text} />
                </TouchableOpacity>
              </View>
            )}

            {/* Live preview card — captured as the shareable image on native */}
            <Text style={s.sectionTitle}>
              Preview{pages.length > 1 ? ` — Page ${activePage + 1} of ${pages.length}` : ''}
            </Text>
            {(() => {
              const CardWrapper = Platform.OS === 'web' ? View : ViewShot;
              const wrapperProps = Platform.OS === 'web' ? {} : { ref: cardRef, options: { format: 'jpg', quality: 0.92 } };
              const hasImage = !!activePageData.imageUri;
              const placement = activePageData.imagePlacement || 'top';
              const isBackground = hasImage && placement === 'background';
              const isReplace = hasImage && placement === 'replace';
              // A template's own palette (often light/pastel) won't stay
              // legible over an arbitrary photo — background mode forces
              // white text over a dark scrim instead of the template colors.
              const textColor = isBackground ? '#FFFFFF' : activeTemplate.text;
              const accentColor = isBackground ? '#FFFFFF' : activeTemplate.accent;
              const photo = hasImage ? <Image source={{ uri: activePageData.imageUri }} style={s.invitePhoto} /> : null;

              const body = (
                <>
                  <Text style={[s.inviteMotif, { color: accentColor }]}>
                    {(activeTemplate.motif || ['✦', '✧', '✦']).join(' ')}
                  </Text>
                  {hasImage && placement === 'top' ? photo : null}
                  <Text style={[s.inviteTitle, { color: textColor }]}>{activePageData.title}</Text>
                  {activePageData.hostName ? (
                    <Text style={[s.inviteHost, { color: accentColor }]}>
                      by {activePageData.hostName}
                    </Text>
                  ) : null}
                  {hasImage && placement === 'middle' ? photo : null}
                  <Text style={[s.inviteMessage, { color: textColor }]}>{activePageData.message}</Text>

                  <View style={[s.inviteDivider, { backgroundColor: accentColor }]} />

                  {activePageData.date ? <Text style={[s.inviteDetail, { color: textColor }]}>📅  {activePageData.date}</Text> : null}
                  {activePageData.time ? <Text style={[s.inviteDetail, { color: textColor }]}>🕐  {activePageData.time}</Text> : null}
                  {activePageData.venue ? <Text style={[s.inviteDetail, { color: textColor }]}>📍  {activePageData.venue}</Text> : null}

                  <View style={[s.inviteFooter, { borderTopColor: accentColor + '44' }]}>
                    <Text style={[s.inviteFooterText, { color: accentColor }]}>
                      RSVP & get directions on the Utsav app
                    </Text>
                  </View>
                </>
              );

              return (
                <CardWrapper {...wrapperProps} style={[s.inviteCard, { backgroundColor: activeTemplate.bg }]}>
                  {isReplace ? (
                    // The photo IS the invite — no template ring, motif, or
                    // overlaid text at all. Title/message/date/venue still
                    // matter here (they go out as the text caption
                    // alongside the image on share) even though none of
                    // them render on the card itself in this mode.
                    <Image source={{ uri: activePageData.imageUri }} style={s.inviteFullImage} resizeMode="cover" />
                  ) : isBackground ? (
                    <ImageBackground
                      source={{ uri: activePageData.imageUri }}
                      style={[s.inviteBorder, { borderColor: accentColor }]}
                      imageStyle={{ borderRadius: 14 }}
                    >
                      <View style={s.inviteScrim} />
                      {body}
                    </ImageBackground>
                  ) : (
                    <View style={[s.inviteBorder, { borderColor: activeTemplate.accent }]}>
                      {body}
                    </View>
                  )}
                </CardWrapper>
              );
            })()}

            {/* Image controls for this page */}
            <View style={s.imageBtnRow}>
              <TouchableOpacity style={s.imageBtn} onPress={pickImage}>
                <ImageIcon size={16} color={theme.text} />
                <Text style={s.imageBtnText}>Add photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.imageBtn} onPress={generateAiImage} disabled={generatingImage}>
                {generatingImage ? <ActivityIndicator size="small" color={theme.text} /> : (
                  <>
                    <Text style={{ fontSize: 15 }}>🪄</Text>
                    <Text style={s.imageBtnText}>Generate with AI</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={s.imageBtn} onPress={pasteImage}>
                <ClipboardText size={16} color={theme.text} />
                <Text style={s.imageBtnText}>Paste image</Text>
              </TouchableOpacity>
              {activePageData.imageUri ? (
                <TouchableOpacity style={s.imageRemoveBtn} onPress={removeImage}>
                  <X size={14} color="#F44336" />
                  <Text style={s.imageRemoveBtnText}>Remove</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {activePageData.imageUri ? (
              <View>
                <Text style={s.placementLabel}>Photo placement</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[
                    { id: 'top', label: '🖼️ Top banner' },
                    { id: 'middle', label: '📑 In between' },
                    { id: 'background', label: '🌆 Background' },
                    { id: 'replace', label: '🪄 Full photo' },
                  ].map(opt => {
                    const active = (activePageData.imagePlacement || 'top') === opt.id;
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[s.placementChip, active && s.placementChipActive]}
                        onPress={() => updateActivePage('imagePlacement', opt.id)}
                      >
                        <Text style={[s.placementChipText, active && s.placementChipTextActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  </View>
                </ScrollView>
              </View>
            ) : null}

            {/* Edit fields */}
            <View style={s.pageHeaderRow}>
              <Text style={s.sectionTitle}>
                Details{pages.length > 1 ? ` (Page ${activePage + 1})` : ''}
              </Text>
              <View style={{ flexDirection: 'row', gap: 14 }}>
                {pages.length > 1 && (
                  <TouchableOpacity onPress={() => removePage(activePage)}>
                    <Text style={s.pageActionText}>Remove page</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={addPage}>
                  <Text style={s.pageActionTextAccent}>+ Add page</Text>
                </TouchableOpacity>
              </View>
            </View>
            {planNudges.filter(n => n.pageIndex === activePage).length > 0 && (
              <View style={s.driftBanner}>
                {planNudges.filter(n => n.pageIndex === activePage).map(n => (
                  <View key={n.key} style={s.driftRow}>
                    <Text style={s.driftText}>
                      {n.label} changed in your event plan → <Text style={{ fontWeight: '700' }}>{n.liveValue}</Text>
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 14 }}>
                      <TouchableOpacity onPress={() => resyncField(n.pageIndex, n.key, n.liveValue)}>
                        <Text style={s.driftUpdateText}>Update</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => dismissNudge(n.pageIndex, n.key)}>
                        <Text style={s.driftDismissText}>Dismiss</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
            <View>
              <Text style={s.fieldLabel}>Event title</Text>
              <TextInput
                style={s.input}
                placeholder="Event title"
                placeholderTextColor={theme.textSecondary}
                value={activePageData.title}
                onChangeText={v => updateActivePage('title', v)}
              />
              {activePage === 0 && event ? (
                <Text style={s.venueHint}>Starts as your event name — edit freely, it won't be overwritten.</Text>
              ) : null}
            </View>
            {/* Who's it for? — conditional on event type, drives {name}/{names} in generated messages */}
            {nameFields.map(f => (
              <View key={f.key}>
                <Text style={s.fieldLabel}>{f.label}</Text>
                <TextInput
                  style={s.input}
                  placeholder={f.ph}
                  placeholderTextColor={theme.textSecondary}
                  value={activePageData[f.key]}
                  onChangeText={v => updateActivePage(f.key, v)}
                />
              </View>
            ))}

            {[
              { key: 'hostName', ph: 'Host name(s) — e.g. Anish & Family' },
              { key: 'date', ph: 'Date — e.g. Sunday, 26 July 2026' },
              { key: 'time', ph: 'Time — e.g. 7:00 PM onwards' },
            ].map(f => (
              <TextInput
                key={f.key}
                style={s.input}
                placeholder={f.ph}
                placeholderTextColor={theme.textSecondary}
                value={activePageData[f.key]}
                onChangeText={v => updateActivePage(f.key, v)}
              />
            ))}

            <View>
              <Text style={s.fieldLabel}>Venue</Text>
              <LocationAutocomplete
                value={activePageData.venue}
                onChangeText={v => updateActivePage('venue', v)}
                onSelect={(address, coords) => { updateActivePage('venue', address); persistVenue(address, coords); }}
                onBlur={() => persistVenue()}
                placeholder="Search for your venue — start typing an address"
              />
              {!!activePageData.venue?.trim() && (
                <TouchableOpacity onPress={() => Linking.openURL(googleMapsUrl(activePageData.venue))}>
                  <Text style={s.venuePreviewLink}>📍 Preview on Google Maps ›</Text>
                </TouchableOpacity>
              )}
              <Text style={s.venueHint}>This becomes the "View on Google Maps" link guests see when they RSVP.</Text>
            </View>
            <View>
              <Text style={s.fieldLabel}>Dietary note</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. Pure veg · Jain"
                placeholderTextColor={theme.textSecondary}
                value={activePageData.dietary}
                onChangeText={v => updateActivePage('dietary', v)}
              />
            </View>
            <View>
              <Text style={s.fieldLabel}>RSVP by</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. 10 December 2026"
                placeholderTextColor={theme.textSecondary}
                value={activePageData.rsvpBy}
                onChangeText={v => updateActivePage('rsvpBy', v)}
              />
            </View>
            <View style={s.messageHeaderRow}>
              <Text style={s.fieldLabel}>Invite message</Text>
              <TouchableOpacity style={s.shuffleBtn} onPress={shuffleMessage}>
                <Text style={s.shuffleBtnText}>🔀 Shuffle</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[s.input, { minHeight: 80, textAlignVertical: 'top', paddingTop: 12 }]}
              placeholder="Invite message"
              placeholderTextColor={theme.textSecondary}
              value={activePageData.message}
              onChangeText={v => updateActivePage('message', v)}
              multiline
            />

            <View style={s.actionRow2}>
              <TouchableOpacity style={s.saveImageBtn} onPress={saveInviteImage} disabled={savingImage}>
                {savingImage ? <ActivityIndicator size="small" color={theme.text} /> : (
                  <Text style={s.saveImageBtnText}>💾 Save image</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={s.saveImageBtn} onPress={handleSavePress} disabled={savingDesign}>
                {savingDesign ? <ActivityIndicator size="small" color={theme.text} /> : (
                  <Text style={s.saveImageBtnText}>📁 Save design</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={s.actionRow2}>
              <TouchableOpacity style={[s.shareInviteBtn, { backgroundColor: theme.accent }]} onPress={shareInvite} disabled={sharing}>
                {sharing ? <ActivityIndicator size="small" color="#FFF" /> : (
                  <>
                    <PaperPlaneTilt size={18} color="#FFF" />
                    <Text style={s.shareInviteBtnText}>Share as image</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={s.shareInviteBtn}
                onPress={() => requireGuestList(() => setWaQueueModal(true))}
              >
                <Text style={s.shareInviteBtnText}>💬 Send to guest list</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[s.shareInviteBtn, { backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border, marginTop: 10 }]}
              onPress={shareInviteText}
            >
              <Text style={[s.shareInviteBtnText, { color: theme.text }]}>✉️ Share via email / SMS / other</Text>
            </TouchableOpacity>
          </ScrollView>
          )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ── WhatsApp bulk-send queue ── */}
      <Modal visible={waQueueModal} transparent animationType="slide" onRequestClose={() => setWaQueueModal(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, { maxHeight: '80%', paddingBottom: 0 }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Send to guest list</Text>
              <TouchableOpacity onPress={() => setWaQueueModal(false)}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>
            <Text style={[s.modalHint, { marginBottom: 12 }]}>
              WhatsApp only lets one chat open at a time, so this isn't a single blast — tap each guest below, pick WhatsApp then their chat, hit Send, then come back and tap the next. The invite image, message, and both links are all attached automatically — WhatsApp just can't be told which chat to pre-open once an image is attached, so that one pick stays manual.
              {designFunctionId ? ` Only guests tagged "${eventFunctions.find(f => f.id === designFunctionId)?.name}" (or not tagged to any specific function — invited to everything by default) are listed below, since this invite is scoped to that function.` : ''}
            </Text>
            <TouchableOpacity style={s.addGuestFromQueueBtn} onPress={addGuestFromWaQueue}>
              <Plus size={16} color={theme.accent} />
              <Text style={s.addGuestFromQueueBtnText}>Add new guest to guest list</Text>
            </TouchableOpacity>
            <FlatList
              data={guests.filter(g => g.phone && (!designFunctionId || isGuestInFunction(g, designFunctionId)))}
              keyExtractor={item => item.id}
              style={{ maxHeight: 420 }}
              contentContainerStyle={{ gap: 10, paddingBottom: 16 }}
              ListEmptyComponent={
                <Text style={s.emptySubtitle}>
                  {designFunctionId
                    ? 'No guests with a phone number are tagged to this function yet.'
                    : 'No guests with a phone number yet — add some from the guest list first.'}
                </Text>
              }
              renderItem={({ item }) => {
                const sent = !!item.invite_sent_at;
                return (
                  <View style={s.savedDesignRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.savedDesignLabel}>{item.name}</Text>
                      <Text style={s.savedDesignMeta}>{item.phone}</Text>
                    </View>
                    <TouchableOpacity
                      style={[s.savedDesignLoadBtn, sent && { backgroundColor: theme.bgSecondary }]}
                      onPress={() => sendWhatsappTo(item)}
                    >
                      <Text style={[s.savedDesignLoadBtnText, sent && { color: theme.textSecondary }]}>
                        {sent ? `✓ Sent ${timeAgo(item.invite_sent_at)}` : 'Send ›'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* ── RSVP reminder queue — same one-chat-at-a-time shape as the
          WhatsApp invite queue above, filtered to guests still pending. ── */}
      <Modal visible={reminderQueueModal} transparent animationType="slide" onRequestClose={() => setReminderQueueModal(false)}>
        <View style={s.overlay}>
          <View style={[s.modal, { maxHeight: '80%', paddingBottom: 0 }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Remind pending guests</Text>
              <TouchableOpacity onPress={() => setReminderQueueModal(false)}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>
            <Text style={[s.modalHint, { marginBottom: 12 }]}>
              A short nudge, not the full invite again. Tap each guest below, hit Send in WhatsApp, then come back for the next.
            </Text>
            <FlatList
              data={guests.filter(g => g.phone && g.rsvp_status === 'pending')}
              keyExtractor={item => item.id}
              style={{ maxHeight: 420 }}
              contentContainerStyle={{ gap: 10, paddingBottom: 16 }}
              ListEmptyComponent={
                <Text style={s.emptySubtitle}>No pending guests with a phone number.</Text>
              }
              renderItem={({ item }) => {
                const sent = !!item.rsvp_reminder_sent_at;
                return (
                  <View style={s.savedDesignRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.savedDesignLabel}>{item.name}</Text>
                      <Text style={s.savedDesignMeta}>{item.phone}</Text>
                    </View>
                    <TouchableOpacity
                      style={[s.savedDesignLoadBtn, sent && { backgroundColor: theme.bgSecondary }]}
                      onPress={() => sendRsvpReminder(item)}
                    >
                      <Text style={[s.savedDesignLoadBtnText, sent && { color: theme.textSecondary }]}>
                        {sent ? `✓ Reminded ${timeAgo(item.rsvp_reminder_sent_at)}` : 'Remind ›'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* ── Plus-one cap — event-wide default. Not enforced as a hard block
          anywhere (matches this app's existing "surface, don't block" RSVP
          pattern) — guests can still RSVP with more, the guest list just
          flags rows that exceed it so the host can follow up if they want. ── */}
      <Modal visible={plusOneLimitModal} transparent animationType="fade" onRequestClose={() => setPlusOneLimitModal(false)}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Plus-one guideline</Text>
              <TouchableOpacity onPress={() => setPlusOneLimitModal(false)}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>
            <Text style={[s.modalHint, { marginBottom: 12 }]}>
              A suggested max guests-per-RSVP for this event. Guests can still bring more if they RSVP that way — this just flags them here so you know who's over.
            </Text>
            <TextInput
              style={s.input}
              placeholder="e.g. 2 — leave blank for no limit"
              placeholderTextColor={theme.textSecondary}
              value={plusOneLimitInput}
              onChangeText={setPlusOneLimitInput}
              keyboardType="number-pad"
            />
            <TouchableOpacity style={[s.saveBtn, { marginTop: 16 }]} onPress={savePlusOneLimit}>
              <Text style={s.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Functions (haldi/sangeet/reception/...) — optional guest-list
          scoping. Zero functions = this whole feature is invisible outside
          this one "+ Functions" chip; nothing else in the screen changes. ── */}
      <Modal visible={functionsModal} transparent animationType="slide" onRequestClose={() => setFunctionsModal(false)}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[s.modal, { maxHeight: '80%', paddingBottom: 0 }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Event functions</Text>
              <TouchableOpacity onPress={() => setFunctionsModal(false)}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>
            <Text style={[s.modalHint, { marginBottom: 12 }]}>
              For multi-function events (haldi, sangeet, reception...) — tag each guest with which ones they're invited to. Leave this empty and every guest is invited to everything, same as today.
            </Text>
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 8, paddingBottom: 16 }}>
              {eventFunctions.map(func => (
                <View key={func.id} style={s.savedDesignRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.savedDesignLabel}>{func.name}</Text>
                    <Text style={s.savedDesignMeta}>
                      {Object.values(guestFunctionMap).filter(ids => ids.includes(func.id)).length} guest{Object.values(guestFunctionMap).filter(ids => ids.includes(func.id)).length === 1 ? '' : 's'} tagged
                    </Text>
                    <TextInput
                      style={[s.input, { marginTop: 6, fontSize: 13, paddingVertical: 8 }]}
                      placeholder="Budget for this function (optional)"
                      placeholderTextColor={theme.textSecondary}
                      keyboardType="number-pad"
                      value={functionBudgetInputValue(func)}
                      onChangeText={v => setFunctionBudgetInputs(prev => ({ ...prev, [func.id]: v.replace(/[^0-9]/g, '') }))}
                      onBlur={() => saveFunctionBudget(func)}
                    />
                  </View>
                  <TouchableOpacity onPress={() => removeFunction(func)} style={{ padding: 6 }}>
                    <Trash size={16} color={theme.textSecondary} />
                  </TouchableOpacity>
                </View>
              ))}
              {eventFunctions.length === 0 ? (
                <Text style={s.emptySubtitle}>No functions yet — this event's guest list is one undivided list.</Text>
              ) : null}

              {suggestedFunctionNames.filter(s2 => !eventFunctions.some(f => f.name === s2.name)).length > 0 && (
                <>
                  <Text style={[s.fieldLabel, { marginTop: 4 }]}>Suggested for this event type</Text>
                  <View style={s.chipsWrap}>
                    {suggestedFunctionNames
                      .filter(s2 => !eventFunctions.some(f => f.name === s2.name))
                      .map(s2 => (
                        <TouchableOpacity key={s2.id} style={s.tagSuggestChip} onPress={() => addFunction(s2.name, s2)} disabled={savingFunction}>
                          <Text style={s.tagSuggestChipText}>+ {s2.name}</Text>
                        </TouchableOpacity>
                      ))}
                  </View>
                </>
              )}

              <Text style={[s.fieldLabel, { marginTop: 4 }]}>Add a function</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  placeholder="e.g. Mehndi"
                  placeholderTextColor={theme.textSecondary}
                  value={newFunctionName}
                  onChangeText={setNewFunctionName}
                  onSubmitEditing={() => addFunction(newFunctionName)}
                />
                <TouchableOpacity
                  style={[s.saveBtn, { paddingHorizontal: 20, marginTop: 0 }]}
                  onPress={() => addFunction(newFunctionName)}
                  disabled={savingFunction || !newFunctionName.trim()}
                >
                  {savingFunction ? <ActivityIndicator color={theme.bg} /> : <Text style={s.saveBtnText}>Add</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Travel & accommodation — outstation guest coordination (Steps
          5/6). Two tabs sharing one modal, same low-ceremony shape as the
          Functions modal above rather than a whole new screen. ── */}
      <Modal visible={travelModal} transparent animationType="slide" onRequestClose={() => setTravelModal(false)}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[s.modal, { maxHeight: '85%', paddingBottom: 0 }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Travel & accommodation</Text>
              <TouchableOpacity onPress={() => { setTravelModal(false); cancelEditAccommodation(); }}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>
            <View style={[s.designerTabBar, { paddingHorizontal: 0 }]}>
              <TouchableOpacity
                style={[s.designerTab, travelTab === 'accommodations' && s.designerTabActive]}
                onPress={() => setTravelTab('accommodations')}
              >
                <Text style={[s.designerTabText, travelTab === 'accommodations' && s.designerTabTextActive]}>Accommodations</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.designerTab, travelTab === 'pickup' && s.designerTabActive]}
                onPress={() => setTravelTab('pickup')}
              >
                <Text style={[s.designerTabText, travelTab === 'pickup' && s.designerTabTextActive]}>
                  Pickup list{pickupList.length > 0 ? ` (${pickupList.length})` : ''}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.designerTab, travelTab === 'hotel_list' && s.designerTabActive]}
                onPress={() => setTravelTab('hotel_list')}
              >
                <Text style={[s.designerTabText, travelTab === 'hotel_list' && s.designerTabTextActive]}>
                  Hotel list{outstationGuestsForHotelList.length > 0 ? ` (${outstationGuestsForHotelList.length})` : ''}
                </Text>
              </TouchableOpacity>
            </View>

            {travelTab === 'hotel_list' ? (
              <ScrollView style={{ maxHeight: 420, marginTop: 12 }} contentContainerStyle={{ gap: 8, paddingBottom: 16 }}>
                <Text style={s.modalHint}>
                  A ready-to-share list of every outstation guest — name, phone, room, and a link to their government ID — for your hotel or venue coordinator.
                </Text>
                {outstationGuestsForHotelList.length === 0 ? (
                  <Text style={s.emptySubtitle}>No guests have marked themselves as traveling from outside yet.</Text>
                ) : (
                  <>
                    {outstationGuestsForHotelList.map(g => {
                      const acc = eventAccommodations.find(a => a.id === g.accommodation_id);
                      const accCount = (guestAccompanying[g.id] || []).length;
                      return (
                        <View key={g.id} style={s.savedDesignRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={s.savedDesignLabel}>{g.name}{accCount > 0 ? ` +${accCount}` : ''}</Text>
                            <Text style={s.savedDesignMeta}>
                              {acc?.name || 'No accommodation assigned yet'}{g.room_number ? ` · Room ${g.room_number}` : ''}
                            </Text>
                            <Text style={s.savedDesignMeta}>{g.govt_id_doc_path ? '🪪 ID uploaded' : '⚠ No ID uploaded yet'}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </>
                )}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <TouchableOpacity style={[s.saveBtn, { flex: 1, marginTop: 0 }]} onPress={shareHotelListText} disabled={generatingHotelList}>
                    {generatingHotelList ? <ActivityIndicator color={theme.bg} /> : <Text style={s.saveBtnText}>Share</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.saveBtn, { flex: 1, marginTop: 0, backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border }]} onPress={copyHotelListText} disabled={generatingHotelList}>
                    <Text style={[s.saveBtnText, { color: theme.text }]}>Copy</Text>
                  </TouchableOpacity>
                  {Platform.OS !== 'web' && (
                    <TouchableOpacity style={[s.saveBtn, { flex: 1, marginTop: 0, backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border }]} onPress={exportHotelListPdf} disabled={generatingHotelList}>
                      <Text style={[s.saveBtnText, { color: theme.text }]}>PDF</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>
            ) : travelTab === 'accommodations' ? (
              <ScrollView style={{ maxHeight: 420, marginTop: 12 }} contentContainerStyle={{ gap: 8, paddingBottom: 16 }}>
                <Text style={s.modalHint}>Hotels/stays for outstation guests — assign guests to one from their detail popup.</Text>
                {eventAccommodations.map(acc => (
                  <View key={acc.id} style={s.savedDesignRow}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => openEditAccommodation(acc)}>
                      <Text style={s.savedDesignLabel}>{acc.name}</Text>
                      {acc.address ? <Text style={s.savedDesignMeta}>{acc.address}</Text> : null}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeAccommodation(acc)} style={{ padding: 6 }}>
                      <Trash size={16} color={theme.textSecondary} />
                    </TouchableOpacity>
                  </View>
                ))}
                {eventAccommodations.length === 0 ? (
                  <Text style={s.emptySubtitle}>No accommodations added yet.</Text>
                ) : null}

                <Text style={[s.fieldLabel, { marginTop: 4 }]}>{editingAccId ? 'Edit accommodation' : 'Add accommodation'}</Text>
                <TextInput
                  style={s.input}
                  placeholder="Name — e.g. Taj Hotel, Block A"
                  placeholderTextColor={theme.textSecondary}
                  value={accForm.name}
                  onChangeText={v => setAccForm(p => ({ ...p, name: v }))}
                />
                <TextInput
                  style={s.input}
                  placeholder="Address (optional)"
                  placeholderTextColor={theme.textSecondary}
                  value={accForm.address}
                  onChangeText={v => setAccForm(p => ({ ...p, address: v }))}
                />
                <TextInput
                  style={s.input}
                  placeholder="Notes (optional)"
                  placeholderTextColor={theme.textSecondary}
                  value={accForm.notes}
                  onChangeText={v => setAccForm(p => ({ ...p, notes: v }))}
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {editingAccId && (
                    <TouchableOpacity style={[s.saveBtn, { flex: 1, backgroundColor: theme.bgSecondary, marginTop: 0 }]} onPress={cancelEditAccommodation}>
                      <Text style={[s.saveBtnText, { color: theme.text }]}>Cancel</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={[s.saveBtn, { flex: 1, marginTop: 0 }]} onPress={saveAccommodation} disabled={savingAcc}>
                    {savingAcc ? <ActivityIndicator color={theme.bg} /> : <Text style={s.saveBtnText}>{editingAccId ? 'Save' : 'Add'}</Text>}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : (
              <ScrollView style={{ maxHeight: 420, marginTop: 12 }} contentContainerStyle={{ gap: 8, paddingBottom: 16 }}>
                <Text style={s.modalHint}>Sorted by arrival — who's driving to pick up whom, when.</Text>
                {pickupList.map(g => (
                  <View key={g.id} style={s.savedDesignRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.savedDesignLabel}>{g.name}</Text>
                      <Text style={s.savedDesignMeta}>
                        {g.arrival_date || 'Arrival date not set'}{g.arrival_time ? ` · ${g.arrival_time}` : ''}
                        {g.arrival_details ? ` · ${g.arrival_details}` : ''}
                      </Text>
                      {g.pickup_notes ? <Text style={s.savedDesignMeta}>📌 {g.pickup_notes}</Text> : null}
                    </View>
                  </View>
                ))}
                {pickupList.length === 0 ? (
                  <Text style={s.emptySubtitle}>No guests have requested a pickup yet.</Text>
                ) : null}
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Rename event — propagates to the linked album + saved plan too ── */}
      <Modal
        visible={renameModal}
        transparent
        animationType="slide"
        onRequestClose={() => setRenameModal(false)}
      >
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Rename event</Text>
              <TouchableOpacity onPress={() => setRenameModal(false)}>
                <X size={22} color={theme.text} />
              </TouchableOpacity>
            </View>
            <Text style={s.fieldLabel}>Name</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Riya's Wedding"
              placeholderTextColor={theme.textSecondary}
              value={renameInput}
              onChangeText={setRenameInput}
              autoFocus
            />
            <Text style={s.modalHint}>Also updates the linked photo album and saved plan.</Text>
            <TouchableOpacity style={s.saveBtn} onPress={saveRename} disabled={renaming}>
              {renaming ? <ActivityIndicator color={theme.bg} /> : <Text style={s.saveBtnText}>Save</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Manage access — invite a delegate/co-host for this event's guest
          list (see supabase/migrations/event_delegates.sql). Host-only —
          never shown for a delegate view (Step 5). ── */}
      <Modal
        visible={delegatesModal}
        transparent
        animationType="slide"
        onRequestClose={() => setDelegatesModal(false)}
      >
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Manage access</Text>
              <TouchableOpacity onPress={() => setDelegatesModal(false)}>
                <X size={22} color={theme.text} />
              </TouchableOpacity>
            </View>
            <Text style={s.modalHint}>
              Invite someone to help manage guests, invites, and functions for this event — venue/date/budget and deleting the event stay with you.
            </Text>
            <Text style={s.fieldLabel}>Phone number</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                placeholder="9999999999"
                placeholderTextColor={theme.textSecondary}
                value={delegatePhone}
                onChangeText={setDelegatePhone}
                keyboardType="phone-pad"
              />
              <TouchableOpacity style={[s.saveBtn, { paddingHorizontal: 18, marginTop: 0 }]} onPress={inviteDelegate} disabled={invitingDelegate}>
                {invitingDelegate ? <ActivityIndicator color={theme.bg} /> : <Text style={s.saveBtnText}>Invite</Text>}
              </TouchableOpacity>
            </View>

            {delegatesLoading ? (
              <ActivityIndicator size="small" color={theme.accent} style={{ marginTop: 20 }} />
            ) : delegates.length > 0 ? (
              <ScrollView style={{ maxHeight: 260, marginTop: 16 }}>
                {delegates.map(d => (
                  <View key={d.id} style={s.delegateRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.guestName}>{d.delegate_phone || 'Pending'}</Text>
                      <Text style={[s.guestPhone, d.status === 'accepted' && { color: '#4CAF50' }]}>
                        {d.status === 'accepted' ? '✓ Accepted' : 'Pending — invite not yet accepted'}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => revokeDelegate(d)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={s.revokeText}>Revoke</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <Text style={[s.modalHint, { marginTop: 16 }]}>No one has access yet.</Text>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Save an edited invite: overwrite the loaded design, or fork it ── */}
      <Modal
        visible={saveChoiceModal}
        transparent
        animationType="fade"
        onRequestClose={() => setSaveChoiceModal(false)}
      >
        <View style={s.overlay}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Save invite</Text>
              <TouchableOpacity onPress={() => setSaveChoiceModal(false)}>
                <X size={22} color={theme.text} />
              </TouchableOpacity>
            </View>
            <Text style={s.modalHint}>
              You're editing a saved invite. Update it with these changes, or keep the original untouched and save this as a new invite instead.
            </Text>
            <TouchableOpacity style={s.saveBtn} onPress={() => saveInviteDesign(false)} disabled={savingDesign}>
              {savingDesign ? <ActivityIndicator color={theme.bg} /> : <Text style={s.saveBtnText}>Update this invite</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: theme.inputBg, borderWidth: 0.5, borderColor: theme.border }]}
              onPress={() => saveInviteDesign(true)}
              disabled={savingDesign}
            >
              {savingDesign ? <ActivityIndicator color={theme.text} /> : <Text style={[s.saveBtnText, { color: theme.text }]}>Save as a new invite</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Attach an unlinked invite to a guest list before sharing ── */}
      <Modal
        visible={linkPickerModal}
        transparent
        animationType="slide"
        onRequestClose={() => setLinkPickerModal(false)}
      >
        <View style={s.overlay}>
          <View style={[s.modal, { maxHeight: '75%' }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Attach to a guest list</Text>
              <TouchableOpacity onPress={() => setLinkPickerModal(false)}>
                <X size={22} color={theme.text} />
              </TouchableOpacity>
            </View>
            <Text style={s.modalHint}>
              This invite isn't attached to a guest list yet, so its RSVP link has nowhere to go. Pick one to attach it to, or start a new one.
            </Text>

            <TouchableOpacity
              style={[s.saveBtn, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14 }]}
              onPress={() => setNewListModal(true)}
              disabled={linkingInvite}
            >
              <Plus size={18} color={theme.bg} />
              <Text style={s.saveBtnText}>New guest list</Text>
            </TouchableOpacity>

            {eventsList.length > 0 && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ gap: 10 }}>
                  {eventsList.map(item => (
                    <TouchableOpacity
                      key={item.id}
                      style={s.eventPickerCard}
                      onPress={() => linkInviteToEvent(item)}
                      disabled={linkingInvite}
                    >
                      <View style={s.eventPickerIcon}>
                        <Text style={{ fontSize: 20 }}>🎊</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.guestName}>{item.name}</Text>
                        {item.event_date ? (
                          <Text style={s.guestPhone}>
                            {new Date(item.event_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </Text>
                        ) : null}
                      </View>
                      {linkingInvite && <ActivityIndicator size="small" color={theme.accent} />}
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Meal counts — client-side aggregation, shareable with the caterer ── */}
      <Modal visible={mealCountsModal} transparent animationType="fade" onRequestClose={() => setMealCountsModal(false)}>
        <View style={s.overlay}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Meal counts</Text>
              <TouchableOpacity onPress={() => setMealCountsModal(false)}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>
            <Text style={s.modalHint}>Based on {headcount} confirmed guest{headcount !== 1 ? 's' : ''} (RSVP'd yes).</Text>
            <View style={{ gap: 8 }}>
              <Text style={s.statusLineText}>🥦 Veg: {mealCounts.veg}</Text>
              <Text style={s.statusLineText}>🍗 Non-veg: {mealCounts.nonveg}</Text>
              <Text style={s.statusLineText}>🙏 Jain: {mealCounts.jain}</Text>
              <Text style={s.statusLineText}>❔ No preference: {mealCounts.any}</Text>
            </View>
            {allergyList.length > 0 && (
              <>
                <Text style={[s.fieldLabel, { marginTop: 10 }]}>Allergies to flag</Text>
                {allergyList.map(g => (
                  <Text key={g.id} style={s.statusLineText}>• {g.name}: {g.allergies}</Text>
                ))}
              </>
            )}
            <TouchableOpacity
              style={s.saveBtn}
              onPress={() => {
                const lines = [
                  `Meal counts for ${displayName || 'the event'}:`,
                  `Veg: ${mealCounts.veg}`, `Non-veg: ${mealCounts.nonveg}`, `Jain: ${mealCounts.jain}`, `No preference: ${mealCounts.any}`,
                  allergyList.length ? `\nAllergies:\n${allergyList.map(g => `${g.name}: ${g.allergies}`).join('\n')}` : null,
                ].filter(Boolean).join('\n');
                Share.share({ message: lines });
              }}
            >
              <Text style={s.saveBtnText}>Share with caterer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Gifts summary — client-side aggregation over the guest list ── */}
      <Modal visible={giftsModal} transparent animationType="fade" onRequestClose={() => setGiftsModal(false)}>
        <View style={s.overlay}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Gifts</Text>
              <TouchableOpacity onPress={() => setGiftsModal(false)}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
            </View>
            <View style={{ gap: 8 }}>
              <Text style={s.statusLineText}>💵 Cash gifts total: ₹{cashGiftTotal.toLocaleString('en-IN')}</Text>
              <Text style={s.statusLineText}>🎁 Item gifts recorded: {itemGiftCount}</Text>
              <Text style={s.statusLineText}>🎀 Return gifts still owed: {returnGiftsOwed}</Text>
            </View>
            <Text style={s.modalHint}>Tap a guest's ··· menu to record what they brought.</Text>
          </View>
        </View>
      </Modal>

      <GuestDetailModal
        visible={!!detailGuest}
        guest={detailGuest}
        event={event}
        navigation={navigation}
        theme={theme}
        onClose={() => setDetailGuest(null)}
        onSave={saveGuestDetails}
        onShareInvite={shareInviteToGuest}
        onSendPass={sendPassToGuest}
        onSendThankYou={sendThankYou}
        onMarkArrived={markGuestArrived}
        eventFunctions={eventFunctions}
        guestFunctionIds={detailGuest ? (guestFunctionMap[detailGuest.id] || []) : []}
        onToggleFunction={toggleGuestFunction}
        eventAccommodations={eventAccommodations}
        accompanying={detailGuest ? (guestAccompanying[detailGuest.id] || []) : []}
      />

      <CoachMarkTour
        visible={guestListTour.isTourActive}
        steps={GUESTLIST_TOUR_STEPS}
        onComplete={guestListTour.markComplete}
        onSkip={guestListTour.markComplete}
      />
    </SafeAreaView>
  );
}

const styles = theme => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
    borderBottomWidth: 0.5, borderBottomColor: theme.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.text, flex: 1, textAlign: 'center' },
  backBtn: { width: 36 },
  addBtn: {
    backgroundColor: theme.accent, borderRadius: 20,
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
  },
  deleteListBtn: {
    backgroundColor: '#F4433618', borderRadius: 20,
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
  },
  summaryCard: {
    flexDirection: 'row', marginHorizontal: 16, marginTop: 14,
    backgroundColor: theme.cardBg, borderRadius: 16, paddingVertical: 12,
    borderWidth: 0.5, borderColor: theme.border,
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryValue: { fontSize: 16, fontWeight: '800', color: theme.text },
  summaryLabel: { fontSize: 10, color: theme.textSecondary },
  inviteCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: theme.accent, marginHorizontal: 16, marginTop: 12,
    borderRadius: 14, paddingVertical: 14,
  },
  inviteCtaText: { fontSize: 15, fontWeight: '700', color: theme.bg },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginTop: 8 },
  emptySubtitle: { fontSize: 13, color: theme.textSecondary, textAlign: 'center' },
  emptyCta: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: theme.accent, borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 18, marginTop: 8,
  },
  emptyCtaText: { fontSize: 14, fontWeight: '700', color: theme.bg },
  eventPickerCardWrap: { borderRadius: 14 },
  eventPickerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: theme.cardBg, borderRadius: 14, padding: 14,
    borderWidth: 0.5, borderColor: theme.border,
  },
  eventPickerIcon: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: theme.bgSecondary, alignItems: 'center', justifyContent: 'center',
  },
  guestCardWrap: { borderRadius: 14 },
  guestCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: theme.cardBg, borderRadius: 14, padding: 12,
    borderWidth: 0.5, borderColor: theme.border,
  },
  guestAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center',
  },
  guestAvatarText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  guestName: { fontSize: 14, fontWeight: '700', color: theme.text },
  guestPhone: { fontSize: 12, color: theme.textSecondary, marginTop: 1 },
  guestTagBadge: {
    alignSelf: 'flex-start', backgroundColor: theme.accent + '1A', borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 2, marginTop: 4,
  },
  guestTagBadgeText: { fontSize: 10.5, fontWeight: '700', color: theme.accent },
  // Deliberately subtle — context, not a warning. A small caption under the
  // badge/chip it qualifies, never a competing badge of its own.
  sourceCaption: { fontSize: 9.5, color: theme.textTertiary, fontStyle: 'italic', marginTop: 2 },
  rsvpChip: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  rsvpChipText: { fontSize: 11, fontWeight: '700' },
  guestDetailBtn: { paddingHorizontal: 8, alignSelf: 'stretch', justifyContent: 'center' },
  utilityRowScroll: { flexGrow: 0, marginTop: 12 },
  utilityChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18,
    backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border,
  },
  utilityChipText: { fontSize: 12, fontWeight: '600', color: theme.text },
  statusLineText: { fontSize: 13.5, color: theme.text },
  tagFilterScroll: { flexGrow: 0, marginTop: 12 },
  tagFilterChip: {
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 18,
    backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border,
  },
  tagFilterChipActive: { backgroundColor: theme.text, borderColor: theme.text },
  tagFilterChipText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  tagFilterChipTextActive: { color: theme.bg },
  overlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: theme.cardBg, borderRadius: 20, padding: 24, gap: 12 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: theme.textSecondary, marginTop: -2 },
  venuePreviewLink: { fontSize: 12.5, fontWeight: '700', color: theme.accent, marginTop: 6 },
  venueHint: { fontSize: 11, color: theme.textSecondary, marginTop: 4, lineHeight: 15 },
  driftBanner: {
    backgroundColor: theme.accent + '14', borderRadius: 12, padding: 12,
    borderWidth: 0.5, borderColor: theme.accent + '55', gap: 8,
  },
  driftRow: { gap: 6 },
  driftText: { fontSize: 12.5, color: theme.text, lineHeight: 17 },
  driftUpdateText: { fontSize: 12.5, fontWeight: '700', color: theme.accent },
  driftDismissText: { fontSize: 12.5, fontWeight: '600', color: theme.textSecondary },
  tagSuggestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagSuggestChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
    backgroundColor: theme.bgSecondary, borderWidth: 1, borderColor: theme.border,
  },
  tagSuggestChipActive: { backgroundColor: theme.accent + '18', borderColor: theme.accent },
  tagSuggestChipText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  input: {
    backgroundColor: theme.bgSecondary, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: theme.text,
    borderWidth: 0.5, borderColor: theme.border,
  },
  saveBtn: {
    backgroundColor: theme.accent, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: theme.bg },
  importBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 12,
    backgroundColor: theme.bgSecondary, borderWidth: 0.5, borderColor: theme.border,
  },
  importBtnText: { fontSize: 13, fontWeight: '700', color: theme.accent },
  importPhoneLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingVertical: 4 },
  importPhoneLinkText: { fontSize: 12.5, fontWeight: '700', color: theme.accent },
  contactsSearchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.bgSecondary, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 0.5, borderColor: theme.border,
    marginTop: 12, marginBottom: 4,
  },
  contactsSearchInput: { flex: 1, fontSize: 14, color: theme.text, paddingVertical: 2 },
  contactRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: theme.border,
  },
  contactCheckbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: theme.border,
    alignItems: 'center', justifyContent: 'center',
  },
  contactCheckboxActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: theme.text },
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18,
    backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border,
  },
  typeChipActive: { backgroundColor: theme.text, borderColor: theme.text },
  typeChipIcon: { fontSize: 14 },
  typeChipText: { fontSize: 12.5, fontWeight: '600', color: theme.textSecondary },
  typeChipTextActive: { color: theme.bg },
  variantChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18,
    backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border,
  },
  variantChipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  variantChipText: { fontSize: 12.5, fontWeight: '600', color: theme.textSecondary },
  variantChipTextActive: { color: '#fff' },
  pageNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  pageDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: theme.border },
  imageBtnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  imageBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12,
    backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border,
  },
  imageBtnText: { fontSize: 12.5, fontWeight: '600', color: theme.text },
  imageRemoveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12,
    backgroundColor: '#F4433618',
  },
  imageRemoveBtnText: { fontSize: 12.5, fontWeight: '600', color: '#F44336' },
  placementLabel: { fontSize: 12, fontWeight: '700', color: theme.textSecondary, marginTop: 10, marginBottom: 6 },
  placementChip: {
    flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10,
    backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border,
  },
  placementChipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  placementChipText: { fontSize: 11.5, fontWeight: '600', color: theme.textSecondary },
  placementChipTextActive: { color: '#FFF' },
  pageHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pageActionText: { fontSize: 12.5, fontWeight: '600', color: theme.textSecondary },
  pageActionTextAccent: { fontSize: 12.5, fontWeight: '700', color: theme.accent },
  templateRow: { flexDirection: 'row', gap: 10 },
  templateSwatch: {
    flex: 1, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', gap: 6,
  },
  templateDot: { width: 14, height: 14, borderRadius: 7 },
  templateName: { fontSize: 11, fontWeight: '700' },
  inviteCard: { borderRadius: 20, padding: 14 },
  inviteBorder: {
    borderWidth: 1.5, borderRadius: 14, padding: 24,
    alignItems: 'center', gap: 10,
  },
  inviteScrim: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 14,
  },
  inviteFullImage: { width: '100%', aspectRatio: 4 / 5, borderRadius: 14 },
  inviteMotif: { fontSize: 34, letterSpacing: 6, marginBottom: 4, textAlign: 'center' },
  invitePhoto: { width: '100%', height: 160, borderRadius: 14, marginTop: 4, marginBottom: 4 },
  inviteTitle: { fontSize: 26, fontWeight: '800', textAlign: 'center', letterSpacing: 0.5 },
  inviteHost: { fontSize: 13, fontWeight: '600', fontStyle: 'italic' },
  inviteMessage: { fontSize: 13.5, textAlign: 'center', lineHeight: 21, opacity: 0.92, marginTop: 4 },
  inviteDivider: { width: 48, height: 2, borderRadius: 1, marginVertical: 8 },
  inviteDetail: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  inviteFooter: { borderTopWidth: 0.5, marginTop: 16, paddingTop: 12, width: '100%', alignItems: 'center' },
  inviteFooterText: { fontSize: 10.5, fontWeight: '600', letterSpacing: 0.3 },
  shareInviteBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#25D366', borderRadius: 14, paddingVertical: 15,
  },
  shareInviteBtnText: { fontSize: 13.5, fontWeight: '700', color: '#FFF', textAlign: 'center' },

  designerTabBar: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4,
  },
  designerTab: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12,
    backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border,
  },
  designerTabActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  designerTabText: { fontSize: 13, fontWeight: '700', color: theme.textSecondary },
  designerTabTextActive: { color: theme.bg },

  modalHint: { fontSize: 12, color: theme.textSecondary, lineHeight: 17 },

  delegateRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: theme.border,
  },
  revokeText: { fontSize: 12.5, fontWeight: '700', color: '#F44336' },
  delegateTag: {
    backgroundColor: theme.accent + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
    alignSelf: 'flex-start', marginTop: 2,
  },
  delegateTagText: { fontSize: 10.5, fontWeight: '700', color: theme.accent },
  delegateHeaderTag: { fontSize: 10.5, fontWeight: '700', color: theme.accent, marginTop: 1 },

  messageHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shuffleBtn: { paddingHorizontal: 10, paddingVertical: 4 },
  shuffleBtnText: { fontSize: 12.5, fontWeight: '700', color: theme.accent },

  actionRow2: { flexDirection: 'row', gap: 10 },
  saveImageBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 12,
    backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border,
  },
  saveImageBtnText: { fontSize: 12.5, fontWeight: '700', color: theme.text },

  savedDesignsLink: { alignItems: 'center', paddingVertical: 4 },
  savedDesignsLinkText: { fontSize: 12.5, fontWeight: '600', color: theme.accent },

  savedDesignRowWrap: { borderRadius: 14 },
  savedDesignRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: theme.cardBg, borderRadius: 14, padding: 12,
    borderWidth: 0.5, borderColor: theme.border,
  },
  savedDesignSwatch: { width: 36, height: 36, borderRadius: 10, borderWidth: 1.5 },
  savedDesignLabel: { fontSize: 13.5, fontWeight: '700', color: theme.text },
  savedDesignMeta: { fontSize: 11.5, color: theme.textSecondary, marginTop: 1, textTransform: 'capitalize' },
  savedDesignLoadBtn: { backgroundColor: theme.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  savedDesignLoadBtnText: { fontSize: 12.5, fontWeight: '700', color: '#FFF' },

  addGuestFromQueueBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, borderRadius: 12, marginBottom: 12,
    backgroundColor: theme.accent + '14', borderWidth: 0.5, borderColor: theme.accent + '40',
  },
  addGuestFromQueueBtnText: { fontSize: 13, fontWeight: '700', color: theme.accent },
});