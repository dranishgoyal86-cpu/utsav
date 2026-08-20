// Cross-component registry for coach-mark tour targets that live outside
// CoachMarkTour.js's own screen tree — most importantly the bottom tab bar
// icons, which React Navigation renders internally via `tabBarIcon`, not
// somewhere a normal prop-drilled ref from a single screen can reach. Any
// component can register its own measurable View's ref under a plain string
// key on mount; CoachMarkTour looks targets up by that same key at
// tour-step time. Deliberately plain module state, not a Context — nothing
// here is ever read during render (only imperatively, at tour-step
// measurement time), so a Context provider wrapping the whole app would add
// re-render risk for zero benefit.
const registry = {};

export function registerTourTarget(key, ref) {
  if (key && ref) registry[key] = ref;
}

export function getTourTarget(key) {
  return registry[key] || null;
}

// Registry of every KNOWN TOUR (not to be confused with the target-ref
// registry above — a different concept entirely, and nothing tracked one
// anywhere before this). ProfileScreen.js's Replay Tutorial section reads
// this list rather than hardcoding its own duplicate — adding a future
// per-feature tour means adding one entry here, not touching
// ProfileScreen.js at all.
export const TOUR_DEFINITIONS = [
  { key: 'core_loop', label: 'Core tour' },
  { key: 'guestlist_intro', label: 'Guest List' },
  { key: 'gatepass_intro', label: 'Gate Pass' },
  { key: 'eventtodo_intro', label: 'Checklist' },
];
