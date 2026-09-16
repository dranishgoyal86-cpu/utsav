-- Ten interchangeable desktop themes — see claude/desktop-themes.md for the
-- full design. desktop_theme is a per-host-account preference (follows the
-- host to every event they open, not tied to one event), read by
-- lib/desktopThemePalettes.js to pick which of the 10 palettes
-- lib/desktopTheme.js exports its brand-color tokens from.
--
-- Same backfill trick as planning_stage/menu_stage, just run in the
-- opposite direction: the column's real default is 'simple' (what a
-- brand-new signup should see), but every account that exists BEFORE this
-- migration runs gets flipped to 'toran' immediately below — so nobody's
-- screen changes color the next time they log in. Only a genuinely new
-- users row, inserted after this migration, keeps the 'simple' default.
alter table users
  add column if not exists desktop_theme text not null default 'simple';

update users set desktop_theme = 'toran' where desktop_theme = 'simple';

alter table users
  drop constraint if exists users_desktop_theme_check;
alter table users
  add constraint users_desktop_theme_check
  check (desktop_theme in ('toran', 'simple', 'sapphire', 'emerald', 'blush', 'sandstone', 'lavender', 'ocean', 'ruby', 'slate'));
