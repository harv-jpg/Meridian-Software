-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- Connects a Google account and files its mail against clients.
--
-- Two tables. `email_accounts` holds the OAuth tokens; `email_messages` holds
-- what the sync found. The interesting part is who can read the first one.
--
-- SECURITY NOTE, and the reason this file looks unlike the others.
--
-- Every other table in this schema gives its owner all four verbs, because
-- every other table holds their own data and reading it back is the point.
-- A refresh token is different: the browser never needs it, and a token that
-- the browser can fetch is a token that any XSS on the page can exfiltrate to
-- somebody else's server. So `email_accounts` has NO select, insert or update
-- policy at all. With RLS enabled and no matching policy, those operations
-- return zero rows for a signed-in user — the tokens are simply unreachable
-- with the anon key, whatever the query says.
--
-- The only ways in are the service role, used by the sync job and the OAuth
-- callback, and `get_email_connection()` below, which is `security definer`
-- and returns the connection's status without ever returning a token.
--
-- Delete is the exception, and is granted: disconnecting is the user's to do.

create table if not exists public.email_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,

  provider text not null default 'google' check (provider in ('google')),
  -- The address that was connected, shown in settings so you can see which
  -- account this is without going to Google.
  email_address text not null,

  access_token text not null,
  refresh_token text not null,
  -- When the access token dies. The sync refreshes it a minute early rather
  -- than waiting to be told it is stale.
  expires_at timestamptz not null,

  -- Gmail's cursor. Null means the next sync is the first one and should take
  -- a bounded slice of recent mail rather than the entire mailbox.
  history_id text,
  last_synced_at timestamptz,
  -- Set when Google stops accepting the refresh token — revoked access, a
  -- changed password, six months idle. The UI reads this and asks you to
  -- reconnect instead of silently going quiet.
  needs_reauth boolean not null default false,

  created_at timestamptz not null default now()
);

-- One row per message we have filed. `client_id` is the whole point: a message
-- is only kept if it matches a client, so this table never becomes a copy of
-- the mailbox.
create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,

  -- Gmail's own ids, so a re-sync updates rather than duplicates.
  message_id text not null,
  thread_id text not null,

  -- 'in' means they wrote to you, 'out' means you wrote to them. Worked out
  -- from whether the connected address is the sender.
  direction text not null check (direction in ('in', 'out')),

  from_address text,
  to_address text,
  subject text,
  -- Gmail's own one-line preview. Deliberately not the full body: the record
  -- is here to tell you what happened and when, not to be a mail client.
  snippet text,
  sent_at timestamptz not null,

  created_at timestamptz not null default now(),

  unique (user_id, message_id)
);

create index if not exists email_messages_client_idx
  on public.email_messages (client_id, sent_at desc);

create index if not exists email_messages_user_sent_idx
  on public.email_messages (user_id, sent_at desc);

alter table public.email_accounts enable row level security;
alter table public.email_messages enable row level security;

-- email_accounts: delete only. See the note at the top of this file.
drop policy if exists "Users can disconnect their own account" on public.email_accounts;
create policy "Users can disconnect their own account"
  on public.email_accounts for delete
  using (auth.uid() = user_id);

-- email_messages: ordinary read access. These are only ever shown to their
-- owner, and unlike tokens there is nothing here the browser should not see.
-- No insert or update policy: messages are written by the sync job under the
-- service role, never by a signed-in session.
drop policy if exists "Users can view their own emails" on public.email_messages;
create policy "Users can view their own emails"
  on public.email_messages for select
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own emails" on public.email_messages;
create policy "Users can delete their own emails"
  on public.email_messages for delete
  using (auth.uid() = user_id);

-- Connection status without the tokens.
--
-- `security definer` so it can read a table the caller has no select policy
-- on, and it filters on auth.uid() itself so it can only ever describe the
-- caller's own connection. The return list is the guarantee: there is no
-- column here that a token could arrive in.
drop function if exists public.get_email_connection();
create or replace function public.get_email_connection()
returns table (
  provider text,
  email_address text,
  last_synced_at timestamptz,
  needs_reauth boolean,
  connected_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select a.provider, a.email_address, a.last_synced_at, a.needs_reauth, a.created_at
    from public.email_accounts a
   where a.user_id = auth.uid();
$$;

grant execute on function public.get_email_connection() to authenticated;
