import { supabase } from './supabase';

// Union of two "disappointed" signals: implicit (own rating<=2 reviews) and
// explicit (one-tap blocks from ProviderProfile). Independently reusable —
// EventPlanner only needs this, not the full memory object below, since its
// form fields are already known by the time it regenerates a plan.
export async function getAvoidProviderIds(customerId) {
  if (!customerId) return [];
  try {
    const [{ data: lowReviews }, { data: blocked }] = await Promise.all([
      supabase.from('reviews').select('provider_id').eq('customer_id', customerId).lte('rating', 2),
      supabase.from('blocked_providers').select('provider_id').eq('customer_id', customerId),
    ]);
    return [...new Set([
      ...(lowReviews || []).map(r => r.provider_id),
      ...(blocked || []).map(b => b.provider_id),
    ].filter(Boolean))];
  } catch (err) {
    console.log('getAvoidProviderIds error:', err.message);
    return [];
  }
}

const EMPTY_MEMORY = {
  hasHistory: false, lastEventType: null, lastCity: null,
  lastGuestRange: null, lastBudgetRange: null, avoidProviderIds: [],
};

// Reads the customer's most recent saved plan for smart defaults, plus their
// avoid-list — used by PlanScreen so returning customers don't have to
// re-state the same city/budget/event type every time they plan something.
export async function getCustomerMemory(customerId) {
  if (!customerId) return EMPTY_MEMORY;
  try {
    const [{ data: lastPlan }, avoidProviderIds] = await Promise.all([
      supabase.from('saved_plans').select('city, form_data, updated_at')
        .eq('customer_id', customerId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      getAvoidProviderIds(customerId),
    ]);
    const fd = lastPlan?.form_data || {};
    return {
      hasHistory: !!lastPlan,
      lastEventType: fd.eventType || null,
      lastCity: lastPlan?.city || fd.city || null,
      lastGuestRange: fd.guestRange || null,
      lastBudgetRange: fd.budgetRange || null,
      avoidProviderIds,
    };
  } catch (err) {
    console.log('getCustomerMemory error:', err.message);
    return EMPTY_MEMORY;
  }
}
