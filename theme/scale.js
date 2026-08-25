// Type and spacing tokens for NEW invite components only (Toran card,
// guest-facing invite UI). Not imported into existing screens — GuestList.js
// and the rest of the app keep their own inline fontSize values untouched,
// per Wave 0's additive-only rule. This exists so new invite UI has one
// shared scale to build on instead of adding a 68th ad hoc fontSize value.

export const type = {
  display1: { size: 42, lineHeight: 46, weight: '600' },
  display2: { size: 32, lineHeight: 38, weight: '600' },
  title: { size: 22, lineHeight: 28, weight: '700' },
  body: { size: 15, lineHeight: 23, weight: '400' },
  label: { size: 13, lineHeight: 18, weight: '600' },
  caption: { size: 11, lineHeight: 16, weight: '600' },
  micro: { size: 9, lineHeight: 13, weight: '700' },
};

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40, xxl: 64 };

export const radius = { sm: 4, md: 8, lg: 16, pill: 999 };
