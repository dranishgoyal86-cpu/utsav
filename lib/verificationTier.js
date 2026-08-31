// Provider verification -- what "verified" means to a customer. Confirmed
// with the user earlier this session: a tiered badge, not a single
// all-or-nothing boolean or five separate small badges.
//
//   Basic    -- today's is_verified bar, unchanged: the existing ID/
//               business-proof admin review (verification_requests).
//   Verified -- Basic + email verified + phone verified (proves the
//               admin-approved provider is actually reachable through the
//               channels customers see).
//   Trusted  -- Verified + at least 2 of {GST verified, website verified,
//               Google listing found}. "At least 2 of 3", not "all 3" --
//               chosen so Trusted isn't permanently unreachable on Google
//               specifically (it's a soft signal that may never find a
//               match for a real business under a slightly different
//               name) or on GST (many small operators are legitimately
//               unregistered). A provider can reach Trusted via any two
//               of the three, matching how each signal was scoped: none
//               of them was ever meant to be a hard gate on its own.
//
// This file only computes the tier from already-fetched fields -- callers
// own their own two-query fetches (providers + users), per this project's
// "never use joins" rule. Not yet wired into any customer-facing badge UI
// (that's separate, explicitly deferred, confirmed with the user) -- this
// is the shared counting logic Task 5 needs to correctly fold the new
// Google signal in alongside GST/website, verified once here rather than
// reimplemented per call site.

export function countTrustedSignals({ gstStatus, websiteVerifiedAt, googleListingFound }) {
  let count = 0;
  if (gstStatus === 'verified') count += 1;
  if (websiteVerifiedAt) count += 1;
  if (googleListingFound === true) count += 1;
  return count;
}

export function isTrustedEligible(signals) {
  return countTrustedSignals(signals) >= 2;
}

// Full tier resolution, given every signal a provider might have.
// is_verified is the ONLY thing that gates Basic -- everything else is
// additive on top of it (Verified/Trusted are conditioned on Basic first,
// not reachable by contact-verification alone).
export function resolveVerificationTier({
  isVerified, emailVerifiedAt, phoneVerifiedAt, gstStatus, websiteVerifiedAt, googleListingFound,
}) {
  if (!isVerified) return 'none';
  const contactVerified = !!emailVerifiedAt && !!phoneVerifiedAt;
  if (!contactVerified) return 'basic';
  const trusted = isTrustedEligible({ gstStatus, websiteVerifiedAt, googleListingFound });
  return trusted ? 'trusted' : 'verified';
}
