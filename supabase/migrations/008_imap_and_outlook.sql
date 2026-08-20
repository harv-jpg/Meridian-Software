-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- Opens the inbox connection to any IMAP mailbox, and to Outlook.
--
-- 007 assumed Gmail: a Google access token, a Google refresh token, both
-- required. That turned out to be the wrong shape, for a reason worth writing
-- down. Gmail's API needs a *restricted* OAuth scope, which Google will only
-- grant a public app after an annual paid security assessment. IMAP needs no
-- such permission, works with an app password today, and reaches every
-- custom-domain mailbox that Gmail's API cannot see at all.
--
-- So the table now describes a mailbox and a way of authenticating to it,
-- rather than a Google account:
--
--   password  — an app password. Gmail, Fastmail, iCloud, and any ordinary
--               IMAP host. Free, works now.
--   oauth     — a refresh token exchanged for an access token per sync, used
--               as XOAUTH2 over the same IMAP connection. Microsoft needs
--               this, having retired basic auth. Free.
--
-- Both end up on one IMAP connection running one fetch, so adding a provider
-- is a credential, not an integration.
--
-- `secret` holds whichever of the two matters, encrypted by the application
-- before it is written (AES-256-GCM, key in CREDENTIAL_KEY). RLS already
-- makes this table unreachable with the anon key; encryption additionally
-- means a database dump on its own does not hand over anybody's mailbox.

-- Existing Gmail rows cannot be migrated: their tokens were stored in clear
-- and are Gmail-API-scoped, not IMAP-scoped, so neither the format nor the
-- permission carries over. There is nothing of value to keep — anyone
-- connected simply reconnects, and no filed mail is touched.
delete from public.email_accounts;

alter table public.email_accounts
  add column if not exists auth_method text,
  add column if not exists secret text,
  add column if not exists imap_host text,
  add column if not exists imap_port integer;

-- Backfill before the not-nulls go on, so a re-run against a half-applied
-- database does not fail on rows added between two runs.
update public.email_accounts
   set auth_method = coalesce(auth_method, 'oauth'),
       secret      = coalesce(secret, ''),
       imap_host   = coalesce(imap_host, 'imap.gmail.com'),
       imap_port   = coalesce(imap_port, 993);

alter table public.email_accounts
  alter column auth_method set not null,
  alter column secret      set not null,
  alter column imap_host   set not null,
  alter column imap_port   set not null,
  alter column imap_port   set default 993;

-- The 007 columns are now either unused or OAuth-only.
alter table public.email_accounts
  drop column if exists refresh_token;

alter table public.email_accounts
  alter column access_token drop not null,
  alter column expires_at   drop not null;

-- Widen the provider list. Dropped and recreated rather than altered: a check
-- constraint cannot be modified in place.
alter table public.email_accounts
  drop constraint if exists email_accounts_provider_check;

alter table public.email_accounts
  add constraint email_accounts_provider_check
  check (provider in ('google', 'microsoft', 'imap'));

alter table public.email_accounts
  drop constraint if exists email_accounts_auth_method_check;

alter table public.email_accounts
  add constraint email_accounts_auth_method_check
  check (auth_method in ('password', 'oauth'));

-- A password connection has no access token to expire; an oauth one must have
-- somewhere to put it. Stating that here means a bug in the callback shows up
-- as a failed insert rather than a connection that silently never syncs.
alter table public.email_accounts
  drop constraint if exists email_accounts_oauth_fields_check;

alter table public.email_accounts
  add constraint email_accounts_oauth_fields_check
  check (
    auth_method = 'password'
    or (auth_method = 'oauth' and expires_at is not null)
  );

comment on column public.email_accounts.secret is
  'App password or OAuth refresh token, AES-256-GCM encrypted by the app. Never written or read in clear.';
