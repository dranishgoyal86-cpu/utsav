import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';

export const GEOFENCE_TASK = 'utsav-venue-geofence';

const FUNCTIONS_BASE_URL = 'https://puvhqusauipotmiicrrm.supabase.co/functions/v1';

// Deliberately NOT lib/passQueue.js's recordCheckIn(eventId, passCode,
// arrivedCount) here, even though that's this project's existing check-in
// write path — recordCheckIn() requires the pass already being in this
// device's local cache, which only gets populated by syncPasses(eventId),
// and THAT downloads every guest's name/phone/pass_code for the whole
// event (by design — it's built for the host's own scanning device, which
// legitimately needs the full list). Running that on a random guest's
// background task would silently sync every other guest's private info
// onto their phone, with no UI ever surfacing it. Same finding as the
// foreground proximity check-in task — calls the guest-pass edge
// function's self_check_in action instead (narrow: this ONE guest's own
// pass_code only), a plain fetch with zero React/navigation dependency, so
// it's safe to run from this module-scope background task context.
const GEOFENCE_TASK_TIMEOUT_MS = 15000;

TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
  if (error) {
    console.log('Geofence task error:', error.message);
    return;
  }
  const { eventType, region } = data || {};
  if (eventType !== Location.GeofencingEventType.Enter) return;

  // region.identifier is set to the guest's OWN pass_code at registration
  // time (see GuestAccess.js's handleToggleGeofence) — resolved via
  // get_my_pass before the geofence is ever started, since that's the
  // credential self_check_in actually needs.
  const passCode = region?.identifier;
  if (!passCode) return;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEOFENCE_TASK_TIMEOUT_MS);
    const response = await fetch(`${FUNCTIONS_BASE_URL}/guest-pass`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'self_check_in', pass_code: passCode, source: 'geofence_auto' }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const result = await response.json();
    if (!response.ok) {
      console.log('Geofence auto check-in failed:', result?.error || response.status);
      return;
    }
    // One-shot: stop watching once it's actually fired, rather than
    // leaving the region registered (and eating one of iOS's 20-region cap)
    // for an event that's already been checked into.
    await Location.stopGeofencingAsync(GEOFENCE_TASK);
  } catch (err) {
    console.log('Geofence auto check-in error:', err.message);
    // Deliberately does NOT stop geofencing on a network/timeout failure —
    // a guest arriving with a flaky connection should get another chance
    // the next time they're detected entering the region, not be silently
    // dropped from auto check-in for the rest of the event.
  }
});
