-- Vendor taxonomy unification: event_requirements.category_slug now stores
-- real vendorTaxonomy.js "Parent > Subcategory" keys directly, retiring the
-- vendor_categories/category_aliases/vendorCategoryBridge.js indirection.
-- Paste into the Supabase SQL editor — not executed automatically.
--
-- 'Venues' and 'Event Planning' (no " > ") are deliberate bare markers, not
-- typos — see lib/vendorCategoryBridge.js's replacement matching helper
-- (added in this same change) for the prefix-match handling: 'Venues'
-- prefix-matches any "Venues > *" service, 'Event Planning' prefix-matches
-- either "Wedding Services > *" or "Event Planning & Management > *" (this
-- slug's real 2 rows are hindu-wedding's "Wedding planner" and
-- kids-birthday's "Event coordinator" — genuinely different parents, both
-- legitimately real, hence the prefix rather than a single string).
--
-- legacy_category_slug preserves the OLD coarse slug for the two places
-- that still legitimately need it and are NOT being migrated here:
-- (1) vendor_categories.slug itself (pricing_model/metro_low/high/
-- percent_of_budget reference bands — hooks/useEventPlan.js's
-- categoriesBySlug lookup now reads legacy_category_slug, not
-- category_slug), and (2) venues.provided_items / the in-house-catering
-- check in lib/eventResolver.js, which compare against real, LIVE
-- venues.provided_items array values still stored in the old coarse-slug
-- format — migrating those too was out of scope for this pass, so the old
-- value is kept alongside rather than migrating venues data blind.
alter table event_requirements add column if not exists legacy_category_slug text;
update event_requirements set legacy_category_slug = category_slug where legacy_category_slug is null;

-- events.arranged_categories is real per-event array data (ItemDetail.js's
-- "mark as arranged" toggle), compared directly against category_slug by
-- computeProgress()'s isHandled() check — same old-format dependency as
-- venues.provided_items, but per-row rather than a lookup table, so it's
-- migrated directly here rather than needing a legacy_category_slug-style
-- column. Confirmed live: exactly one real event has this populated.
-- Future writes already use the new format automatically (ItemDetail.js
-- writes whatever category_slug it's passed, which is the new format after
-- this migration — no code change needed there).
update events set arranged_categories = array['Logistics & Transport > Valet Parking', 'Decoration & Styling > Event Decorators']
where id = 'bac3f331-5795-4547-958a-731a0503efb6';

update event_requirements set category_slug = 'Food & Beverages > Caterers' where category_slug = 'catering';
update event_requirements set category_slug = 'Photography & Videography > Event Photography' where category_slug = 'photography';
update event_requirements set category_slug = 'Venues' where category_slug = 'venues';
update event_requirements set category_slug = 'Decoration & Styling > Event Decorators' where category_slug = 'decor';
update event_requirements set category_slug = 'Kids Party Services > Kids Games' where category_slug = 'kids-entertainment';
update event_requirements set category_slug = 'Security & Safety > Security Guards' where category_slug = 'security';
update event_requirements set category_slug = 'Gifts & Favours > Return Gifts' where category_slug = 'return-gifts';
update event_requirements set category_slug = 'Food & Beverages > Live Food Counters' where category_slug = 'live-food-stalls';
update event_requirements set category_slug = 'Audio Visual & Production > Sound Systems' where category_slug = 'sound-av';
update event_requirements set category_slug = 'Post Event Services > Cleaning Services' where category_slug = 'housekeeping';
update event_requirements set category_slug = 'Rentals & Utilities > Power Backup' where category_slug = 'power-utilities';
update event_requirements set category_slug = 'Florists > Fresh Flowers' where category_slug = 'floral-decor';
update event_requirements set category_slug = 'Audio Visual & Production > Lighting Systems' where category_slug = 'lighting';
update event_requirements set category_slug = 'Entertainment > Live Bands' where category_slug = 'live-bands';
update event_requirements set category_slug = 'Security & Safety > Medical Team' where category_slug = 'medical-support';
update event_requirements set category_slug = 'Entertainment > DJs' where category_slug = 'dj-music';
update event_requirements set category_slug = 'Photography & Videography > Cinematic Videography' where category_slug = 'videography';
update event_requirements set category_slug = 'Religious & Cultural Services > Priests' where category_slug = 'priests-officiants';
update event_requirements set category_slug = 'Food & Beverages > Bartending Services' where category_slug = 'bar-services';
update event_requirements set category_slug = 'Event Technology > Registration Software' where category_slug = 'registration-guest-tech';
update event_requirements set category_slug = 'Invitations & Printing > Wedding Cards' where category_slug = 'invitations';
update event_requirements set category_slug = 'Photography & Videography > Instant Photo Booths' where category_slug = 'photo-booths';
update event_requirements set category_slug = 'Audio Visual & Production > LED Screens' where category_slug = 'led-screens';
update event_requirements set category_slug = 'Event Technology > Audience Engagement' where category_slug = 'interactive-tech';
update event_requirements set category_slug = 'Audio Visual & Production > Trussing' where category_slug = 'stage-trussing';
update event_requirements set category_slug = 'Food & Beverages > Bakery & Cakes' where category_slug = 'bakery-cakes';
update event_requirements set category_slug = 'Event Rentals > Furniture Rental' where category_slug = 'furniture-seating';
update event_requirements set category_slug = 'Artists & Performers > Celebrity Appearances' where category_slug = 'celebrity-talent';
update event_requirements set category_slug = 'Logistics & Transport > Luxury Cars' where category_slug = 'transportation';
update event_requirements set category_slug = 'Printing & Branding > Corporate Branding' where category_slug = 'branding-print';
update event_requirements set category_slug = 'Event Staffing > Hospitality Staff' where category_slug = 'hospitality-staff';
update event_requirements set category_slug = 'Religious & Cultural Services > Ritual & Havan Supplies' where category_slug = 'ritual-supplies';
update event_requirements set category_slug = 'Event Rentals > Tent & Shamiana' where category_slug = 'tent-mandap';
update event_requirements set category_slug = 'Entertainment > Emcees (Anchors)' where category_slug = 'anchors-emcees';
update event_requirements set category_slug = 'Photography & Videography > Drone Photography' where category_slug = 'drone-aerial';
update event_requirements set category_slug = 'Audio Visual & Production > Pyrotechnics' where category_slug = 'fireworks-effects';
update event_requirements set category_slug = 'Photography & Videography > Live Streaming' where category_slug = 'live-streaming';
update event_requirements set category_slug = 'Beauty & Wellness > Makeup Artists' where category_slug = 'makeup-styling';
update event_requirements set category_slug = 'Logistics & Transport > Valet Parking' where category_slug = 'valet-parking';
update event_requirements set category_slug = 'Food & Beverages > Prasad Caterers' where category_slug = 'prasad-caterer';
update event_requirements set category_slug = 'Kids Party Services > Childcare & Creche Services' where category_slug = 'childcare';
update event_requirements set category_slug = 'Entertainment > Dhol & Baraat Bands' where category_slug = 'dhol-baraat';
update event_requirements set category_slug = 'Accommodation > Hotels' where category_slug = 'guest-accommodation';
update event_requirements set category_slug = 'Rentals & Utilities > Internet/Wi-Fi' where category_slug = 'connectivity';
update event_requirements set category_slug = 'Artists & Performers > Influencers' where category_slug = 'pr-influencers';
update event_requirements set category_slug = 'Event Staffing > Translation & Interpretation' where category_slug = 'translation';
update event_requirements set category_slug = 'Entertainment > Choreographers' where category_slug = 'choreography';
update event_requirements set category_slug = 'Event Planning' where category_slug = 'event-planning';
update event_requirements set category_slug = 'Wedding Services > Mehendi Artists' where category_slug = 'mehendi';
update event_requirements set category_slug = 'Corporate Event Services > Team Building Activities' where category_slug = 'activity-facilitators';
update event_requirements set category_slug = 'Beauty & Wellness > Yoga Instructors' where category_slug = 'wellness-spa';
update event_requirements set category_slug = 'Entertainment > Magicians' where category_slug = 'magician';
update event_requirements set category_slug = 'Beauty & Wellness > Grooming Experts' where category_slug = 'barber-services';
update event_requirements set category_slug = 'Security & Safety > Pet Care Services' where category_slug = 'pet-care';
update event_requirements set category_slug = 'Corporate Event Services > Exhibition Booths' where category_slug = 'booth-exhibition';
update event_requirements set category_slug = 'Event Technology > Ticketing Platforms' where category_slug = 'ticketing';
