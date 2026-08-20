import { useCapabilities } from './useCapabilities';
import { useEventContext } from './useEventContext';

// Resolves capabilities for a specific event via the shared useEventContext
// cache — same live-propagation guarantee every other eventId-based screen
// gets (an edit in one screen shows up here without a remount), instead of
// this hook's own separate fetch. Shared by every screen reached via a
// specific event that needs to guard itself against direct navigation/deep
// links to a tool that's been hidden at the entry point but is still
// reachable by URL/back-stack, and by the gate-pass screens for
// resolved.entryControl specifically.
export function useEventCapabilities(eventId) {
  const { context, bookings, loading: eventLoading } = useEventContext(eventId);

  const resolved = useCapabilities({
    eventTypeSlug: context?.eventTypeSlug ?? null,
    venueType: context?.venue?.venueType ?? null,
    guestCount: context?.guestCount ?? null,
    age: context?.childAge ?? null,
    isDryEvent: context?.dietary?.isDry ?? false,
    isVegOnly: context?.dietary?.isVegOnly ?? false,
    hasBudget: context?.budgetTotal != null,
    hasVenue: context?.venue?.isSet ?? false,
    hasBooking: (context?.bookingCount ?? 0) > 0,
    hasCompletedBooking: bookings.some(b => b.status === 'completed'),
  });

  return { ...resolved, loading: eventLoading || resolved.loading };
}
