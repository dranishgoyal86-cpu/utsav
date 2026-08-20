// Pure eligibility logic for the tiered payment-terms system — which
// payment_term_options a provider currently qualifies for, given their real
// live signals. No Supabase calls in here; callers (AddServiceScreen.js)
// fetch the raw data and pass in a plain signals object, matching the
// project's established pattern of keeping lib/ files pure and testable.
//
// Signal sourcing notes (from investigation, not assumed):
// - rating: providers.rating is a write-once-at-creation column, seeded 0
//   and never updated by WriteReview.js or anywhere else — ProviderReviews.js
//   already works around this by computing the average live from the
//   `reviews` table. Callers MUST do the same here; do not pass
//   providers.rating directly, it will always read 0.
// - completedBookings: count of bookings where provider_id = X and
//   status = 'completed' — now a real, reachable state per the booking-
//   lifecycle work (mutual confirmation + safety-net cron).
// - isVerified: providers.is_verified, set true by utsav-admin's
//   VerificationsTab approval action.
// - accountAgeDays: derived from providers.created_at.
// - kycComplete: provider_billing (joined via providers.user_id ==
//   provider_billing.provider_user_id, NOT providers.id — there's no direct
//   FK) has pan, pan_card_url, bank_account, and bank_ifsc all set. GSTIN/
//   Udyam are deliberately excluded — BillingProfile.js's own copy says
//   "Leave GSTIN blank if you're not GST-registered," so requiring it here
//   would incorrectly lock out legitimately non-GST-registered providers.

// A provider currently qualifies for a payment_term_options row if they
// meet every non-null/non-zero requirement on it. A requirement of 0/null/
// false is "no requirement" — e.g. min_rating: null means any rating
// (including a brand-new provider with none yet) passes.
export function isEligibleForOption(signals, option) {
  if ((option.min_completed_bookings || 0) > (signals.completedBookings || 0)) return false;
  if (option.min_rating != null && (signals.rating || 0) < option.min_rating) return false;
  if (option.requires_verified_badge && !signals.isVerified) return false;
  if ((option.min_account_age_days || 0) > (signals.accountAgeDays || 0)) return false;
  if (option.requires_kyc_complete && !signals.kycComplete) return false;
  return true;
}

// Returns the subset of allOptions this provider currently qualifies for,
// sorted by sort_order (falling back to tier) so tier 0 always leads.
export function resolveEligiblePaymentTerms(signals, allOptions) {
  return (allOptions || [])
    .filter(opt => isEligibleForOption(signals, opt))
    .sort((a, b) => (a.sort_order ?? a.tier) - (b.sort_order ?? b.tier));
}

// providers.created_at → whole days elapsed. Kept here (not inline at call
// sites) so the rounding rule has one definition.
export function accountAgeDaysFrom(createdAt, now = new Date()) {
  if (!createdAt) return 0;
  const diffMs = now.getTime() - new Date(createdAt).getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// provider_billing row → boolean. The four fields Route's linked-account
// creation actually needs (per the earlier Razorpay/Route investigation).
export function isKycComplete(billing) {
  if (!billing) return false;
  return !!(billing.pan && billing.pan_card_url && billing.bank_account && billing.bank_ifsc);
}
