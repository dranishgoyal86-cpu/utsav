-- Coach-mark tour completion tracking — one row per user per tour, so
-- hooks/useTour.js can tell "genuinely never seen this" apart from
-- "already finished or skipped it" across sessions/app restarts. A user can
-- have multiple tours over time (this task's 'core_loop' now, per-feature
-- tours like Gate Pass/Guest List as explicit follow-ups later) — the
-- unique(user_id, tour_key) constraint is what makes markComplete()'s
-- upsert in useTour.js correct rather than accumulating duplicate rows.
create table if not exists public.user_tour_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  tour_key text not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, tour_key)
);

alter table public.user_tour_progress enable row level security;

-- Standard "own rows only" pattern — no RPC needed, this is always the
-- user's own session acting on their own data (useTour.js's select/upsert
-- both run with auth.uid() already equal to user_id).
create policy "Users manage own tour progress"
  on public.user_tour_progress for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_user_tour_progress_user on public.user_tour_progress(user_id);
