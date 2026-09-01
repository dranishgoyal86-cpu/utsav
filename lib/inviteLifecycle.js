// Event-lifecycle metadata helpers — pure query functions over
// lib/inviteDesignArchetypes/sceneRegistry.js's per-scene lifecyclePriority
// (already declared on every SCENE_REGISTRY entry, e.g. RSVP is
// 'very-high' in 'invitation' mode and 'none' in 'post-event' mode; Maps
// is 'medium' pre-event and 'very-high' on 'event-day'; Travel is 'high'
// in 'pre-event'; Gallery is 'low' before the event and 'very-high' after
// — the exact examples the brief names). No date-driven mode switching is
// implemented this wave (per the brief's explicit "just establish
// metadata" instruction) — a future feature picks a LIFECYCLE_MODE from
// the real event date and calls these functions; this file only answers
// "given a mode, what matters" once that future caller decides which mode
// it is.
import { LIFECYCLE_MODE, LIFECYCLE_PRIORITY } from './inviteDesignArchetypes/types';
import { getSceneDefinition, listSceneDefinitions } from './inviteDesignArchetypes/sceneRegistry';

const PRIORITY_ORDER = [LIFECYCLE_PRIORITY.NONE, LIFECYCLE_PRIORITY.LOW, LIFECYCLE_PRIORITY.MEDIUM, LIFECYCLE_PRIORITY.HIGH, LIFECYCLE_PRIORITY.VERY_HIGH];

export function getLifecyclePriority(sceneRoleId, mode) {
  const def = getSceneDefinition(sceneRoleId);
  if (!def || !Object.values(LIFECYCLE_MODE).includes(mode)) return LIFECYCLE_PRIORITY.NONE;
  return def.lifecyclePriority[mode] || LIFECYCLE_PRIORITY.NONE;
}

// Scene role ids whose priority in `mode` is at or above `minPriority`,
// ordered highest-priority-first — the shape a future "what should this
// page emphasize right now" resolver would consume directly.
export function listScenesForLifecycleMode(mode, minPriority = LIFECYCLE_PRIORITY.MEDIUM) {
  const minIdx = PRIORITY_ORDER.indexOf(minPriority);
  return listSceneDefinitions()
    .filter((def) => PRIORITY_ORDER.indexOf(def.lifecyclePriority[mode] || LIFECYCLE_PRIORITY.NONE) >= minIdx)
    .sort((a, b) => PRIORITY_ORDER.indexOf(b.lifecyclePriority[mode]) - PRIORITY_ORDER.indexOf(a.lifecyclePriority[mode]))
    .map((def) => def.id);
}
