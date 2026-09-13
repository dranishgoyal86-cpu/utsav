-- Birthday Event Improvement plan, Piece 2 (structured themes).
--
-- events.theme already exists and keeps working exactly as it does today —
-- it stores the human-readable theme label (e.g. "Jungle Safari") or, for
-- a host's own custom theme, whatever free text they type. Nothing reads or
-- writes it differently after this migration.
--
-- Two new nullable columns, additive only:
--   theme_slug    — the stable key into lib/eventThemes.js's EVENT_THEMES
--                    (e.g. 'jungle-safari'), so the app can look up the
--                    theme's emoji/motifs/palettes reliably even if the
--                    display label text ever changes. Null for a custom
--                    "Other" theme, since those have no matching entry.
--   theme_palette — the color palette name the host picked for that theme
--                    (e.g. 'Emerald & Gold'), stored separately from the
--                    theme itself so switching palettes later is a small
--                    update, not a re-pick of the whole theme.
--
-- Both are plain text columns, no foreign key — same pattern as event_type_
-- slug elsewhere in this schema, where the source of truth is a JS lookup
-- object, not a database table (see lib/eventThemes.js's own file header).
alter table events
  add column if not exists theme_slug text,
  add column if not exists theme_palette text;
