-- Provider verification, Task 1 (email). users.email_verified_at already
-- exists (populated today only by ClaimVendorFlow.js's held email-change-OTP
-- step) -- reused here, not duplicated. These two columns are the only new
-- schema this task needs: a single pending token + its expiry, generated
-- server-side by request-email-verification and consumed by
-- verify-email-token. One pending token at a time is enough -- requesting
-- again simply overwrites it, invalidating the previous link.
alter table public.users add column if not exists email_verify_token text;
alter table public.users add column if not exists email_verify_token_expires_at timestamptz;

create index if not exists idx_users_email_verify_token on public.users(email_verify_token);
