-- Wave 7 — six capability_rules rows enumerate 'hindu-wedding' explicitly
-- in event_type_slugs rather than matching "is this a wedding" by pattern.
-- Confirmed live before writing this: seating_chart, vip_flagging,
-- gift_register, gift_qr_stickers, return_gifts, reciprocity_ledger all do
-- this. Without this fix, a Nikah/Anand Karaj/Christian/Parsi/Jain/
-- Interfaith wedding host would silently get none of these capabilities
-- while a Hindu wedding host gets all of them — exactly the "provide
-- options, gate nothing" principle this wave is built around.
--
-- bar_vendors' excluded_event_type_slugs is deliberately left untouched —
-- it excludes non-wedding/non-reception event types (religious-event,
-- housewarming, mundan, kids-birthday), not wedding traditions. Assuming
-- any of the six new wedding types should be dry by default would be
-- encoding a cultural assumption the app has no business making; a host
-- who wants a dry event already has isDryEvent for that, explicitly set,
-- not inferred from tradition.
update public.capability_rules
set event_type_slugs = event_type_slugs || array['nikah', 'anand-karaj', 'christian-wedding', 'parsi-wedding', 'jain-wedding', 'interfaith-wedding']
where capability_key in ('seating_chart', 'vip_flagging', 'gift_register', 'gift_qr_stickers', 'return_gifts', 'reciprocity_ledger');
