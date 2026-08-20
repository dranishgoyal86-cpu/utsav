-- In-album camera capture + offline-first upload queue.
-- client_ref is a locally generated UUID carried from capture through
-- upload — the unique index makes retries idempotent: a retry that
-- partially succeeded before (Cloudinary upload done, row insert lost to a
-- kill/crash) will not create a duplicate photos row on re-drive.

alter table public.photos
  add column if not exists uploaded_by_name text,
  add column if not exists source text default 'gallery',
  add column if not exists is_hidden boolean default false,
  add column if not exists captured_at timestamp with time zone,
  add column if not exists client_ref text;

create unique index if not exists idx_photos_client_ref
  on public.photos(event_id, client_ref) where client_ref is not null;

alter table public.events
  add column if not exists guest_capture_enabled boolean default true,
  add column if not exists guest_capture_needs_review boolean default false;
