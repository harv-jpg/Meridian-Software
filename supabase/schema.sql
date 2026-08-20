-- Setu — full database schema.
--
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
--
-- Safe to run against an existing project: every `create table` is guarded by
-- `if not exists`, so it will not alter tables you already have. The policy
-- section drops and recreates by name, so it is also safe to re-run — and it
-- is the only part that changes anything on an already-built project.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- The pipeline of clients/deals.
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  company text,
  address text,
  stage text not null default 'lead' check (stage in ('lead', 'proposal_sent', 'negotiating', 'won', 'lost')),
  value_pence integer, -- store money as integer pence to avoid float rounding issues
  notes text,
  follow_up_on date, -- the day you next intend to chase this deal
  archived_at timestamptz, -- set when archived; archived clients leave the board

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Defined before time_entries, which carries a foreign key to it.
-- `share_token` is the unguessable value in the public /invoice/[token] URL,
-- and `invoice_number` is assigned per user by the trigger further down.
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  invoice_number integer,
  amount_pence integer not null,
  basis text not null check (basis in ('time', 'fixed')),
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid')),
  -- VAT rate in basis points: 2000 means 20%. VAT itself is derived from this
  -- and amount_pence rather than stored, so no third column can drift.
  vat_rate_bp integer not null default 0 check (vat_rate_bp >= 0),
  due_date date,
  share_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- Tracked work. `invoice_id` is null until the entry is billed; that null is
-- what the invoice generator uses to find unbilled time, so it must be
-- writable (see the UPDATE policy below).
create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  description text,
  minutes integer not null check (minutes > 0),
  invoice_id uuid references public.invoices(id) on delete set null,
  created_at timestamptz not null default now()
);

-- `sign_token` is the unguessable value in the public /sign/[token] URL. It is
-- never exposed by a policy — the signing page reaches it only through the
-- security-definer functions at the bottom of this file.
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  body text not null,
  sign_token uuid not null unique default gen_random_uuid(),
  status text not null default 'draft' check (status in ('draft', 'sent', 'signed')),
  signed_name text,
  signed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Line items. `invoices.amount_pence` stays the stored total rather than a
-- view over these, because the public invoice page and every pre-existing row
-- depend on it; the trigger below keeps the two from drifting.
create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  -- Hundredths, so half-hours and part-days need no floats: 150 means 1.5.
  quantity_centi integer not null default 100 check (quantity_centi > 0),
  unit_price_pence integer not null check (unit_price_pence >= 0),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

-- Your own business details — one row per user, keyed by user_id so it cannot
-- drift into two half-filled rows. These appear on every invoice.
create table if not exists public.business_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  business_name text,
  address text,
  vat_number text,
  payment_details text,
  invoice_footer text,
  default_vat_rate_bp integer not null default 0 check (default_vat_rate_bp >= 0),
  updated_at timestamptz not null default now()
);

-- Follow-up emails written by the nightly job and parked for their owner.
-- Nothing sends one of these: a nudge sits until the person who owns it reads
-- it, edits it and sends it themselves, or dismisses it.
create table if not exists public.nudges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,

  -- Why it was written. 'silence' means the deal went quiet; 'payment' means
  -- an invoice passed its due date.
  kind text not null check (kind in ('silence', 'payment')),

  subject text not null,
  body text not null,
  -- One line naming the fact the draft leans on. Shown above it, for you.
  angle text not null,

  -- Dismissing keeps the row, which is how the job knows not to write the
  -- same nudge again tomorrow.
  status text not null default 'waiting' check (status in ('waiting', 'sent', 'dismissed')),
  resolved_at timestamptz,

  created_at timestamptz not null default now()
);

-- A connected mailbox. Unlike every other table here, this one gives its owner
-- almost nothing: see the policy section for why.
--
-- Describes a mailbox and a way of authenticating to it, rather than any one
-- provider. Everything ends up on a single IMAP connection running a single
-- fetch, so adding a provider is a credential, not an integration:
--
--   password  — an app password. Gmail, Fastmail, iCloud, any ordinary IMAP
--               host. Free, and needs no permission from anybody.
--   oauth     — a refresh token exchanged for an access token per sync and
--               used as XOAUTH2 over the same connection. Microsoft requires
--               this, having retired basic auth.
create table if not exists public.email_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'imap'
    check (provider in ('google', 'microsoft', 'imap')),
  email_address text not null,

  auth_method text not null default 'password'
    check (auth_method in ('password', 'oauth')),
  -- App password or OAuth refresh token, AES-256-GCM encrypted by the
  -- application before it is written. RLS already makes this table unreachable
  -- with the anon key; encryption additionally means a database dump on its
  -- own does not hand over anybody's mailbox. Key lives in CREDENTIAL_KEY.
  secret text not null,

  imap_host text not null,
  imap_port integer not null default 993,

  -- OAuth only, and encrypted the same way. Null on a password connection,
  -- which has no access token to expire.
  access_token text,
  expires_at timestamptz,

  last_synced_at timestamptz,
  -- Set when the mail server stops accepting the credential. The UI reads this
  -- and asks for a reconnect rather than going quiet.
  needs_reauth boolean not null default false,
  created_at timestamptz not null default now(),

  -- A password connection has no token to expire; an oauth one must have
  -- somewhere to put it. Stating it here means a bug in a callback shows up as
  -- a failed insert rather than a connection that silently never syncs.
  constraint email_accounts_oauth_fields_check check (
    auth_method = 'password'
    or (auth_method = 'oauth' and expires_at is not null)
  )
);

-- Mail the sync matched to a client. A message is only kept if it matches, so
-- this never becomes a copy of the mailbox.
create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  message_id text not null,
  thread_id text not null,
  direction text not null check (direction in ('in', 'out')),
  from_address text,
  to_address text,
  subject text,
  -- Gmail's own one-line preview, not the body. The record says what happened
  -- and when; reading the thread is what the mail app is for.
  snippet text,
  sent_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, message_id)
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Every freelancer only ever sees their own rows. Note that a *missing* policy
-- is not a loud failure: with RLS enabled, an operation with no matching policy
-- silently affects zero rows. Each table needs all four verbs the app uses.

alter table public.clients enable row level security;
alter table public.time_entries enable row level security;
alter table public.invoices enable row level security;
alter table public.contracts enable row level security;
alter table public.invoice_items enable row level security;
alter table public.business_profiles enable row level security;
alter table public.nudges enable row level security;
alter table public.email_accounts enable row level security;
alter table public.email_messages enable row level security;

-- clients
drop policy if exists "Users can view their own clients" on public.clients;
create policy "Users can view their own clients"
  on public.clients for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own clients" on public.clients;
create policy "Users can insert their own clients"
  on public.clients for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own clients" on public.clients;
create policy "Users can update their own clients"
  on public.clients for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own clients" on public.clients;
create policy "Users can delete their own clients"
  on public.clients for delete
  using (auth.uid() = user_id);

-- time_entries
drop policy if exists "Users can view their own time entries" on public.time_entries;
create policy "Users can view their own time entries"
  on public.time_entries for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own time entries" on public.time_entries;
create policy "Users can insert their own time entries"
  on public.time_entries for insert
  with check (auth.uid() = user_id);

-- Required by the invoice generator, which stamps `invoice_id` onto unbilled
-- entries after creating an invoice. Without this policy that write matches no
-- rows and reports no error, so the same hours stay unbilled and get billed
-- again on the next invoice.
drop policy if exists "Users can update their own time entries" on public.time_entries;
create policy "Users can update their own time entries"
  on public.time_entries for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own time entries" on public.time_entries;
create policy "Users can delete their own time entries"
  on public.time_entries for delete
  using (auth.uid() = user_id);

-- invoices
drop policy if exists "Users can view their own invoices" on public.invoices;
create policy "Users can view their own invoices"
  on public.invoices for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own invoices" on public.invoices;
create policy "Users can insert their own invoices"
  on public.invoices for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own invoices" on public.invoices;
create policy "Users can update their own invoices"
  on public.invoices for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own invoices" on public.invoices;
create policy "Users can delete their own invoices"
  on public.invoices for delete
  using (auth.uid() = user_id);

-- business_profiles (no delete policy: there is nothing to gain by removing
-- your own settings row, and keeping it means upsert always has a target)
drop policy if exists "Users can view their own business profile" on public.business_profiles;
create policy "Users can view their own business profile"
  on public.business_profiles for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own business profile" on public.business_profiles;
create policy "Users can insert their own business profile"
  on public.business_profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own business profile" on public.business_profiles;
create policy "Users can update their own business profile"
  on public.business_profiles for update
  using (auth.uid() = user_id);

-- nudges (no insert policy, deliberately: these are written by the nightly job
-- using the service role, which bypasses RLS. Nothing signed in as a user has
-- any business creating one, so the service role is the only way in.)
drop policy if exists "Users can view their own nudges" on public.nudges;
create policy "Users can view their own nudges"
  on public.nudges for select
  using (auth.uid() = user_id);

drop policy if exists "Users can update their own nudges" on public.nudges;
create policy "Users can update their own nudges"
  on public.nudges for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own nudges" on public.nudges;
create policy "Users can delete their own nudges"
  on public.nudges for delete
  using (auth.uid() = user_id);

-- email_accounts: DELETE ONLY, and deliberately so.
--
-- Every other table here gives its owner all four verbs, because every other
-- table holds their own data and reading it back is the point. A mailbox
-- credential is different: the browser never needs it, and one the browser can
-- fetch is one that any XSS on the page can send somewhere else. An app
-- password is worse than a scoped token — it opens the whole mailbox — which
-- is why it is also encrypted on top of this. With RLS on and no
-- select/insert/update policy, those operations reach zero rows whatever the
-- query says. The only ways in are the service role — used by the OAuth
-- callback and the sync job — and get_email_connection() further down, which
-- returns status without ever returning a token.
drop policy if exists "Users can disconnect their own account" on public.email_accounts;
create policy "Users can disconnect their own account"
  on public.email_accounts for delete
  using (auth.uid() = user_id);

-- email_messages: ordinary read access; unlike tokens there is nothing here
-- the browser should not see. Written by the sync under the service role, so
-- no insert or update policy.
drop policy if exists "Users can view their own emails" on public.email_messages;
create policy "Users can view their own emails"
  on public.email_messages for select
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own emails" on public.email_messages;
create policy "Users can delete their own emails"
  on public.email_messages for delete
  using (auth.uid() = user_id);

-- invoice_items
drop policy if exists "Users can view their own invoice items" on public.invoice_items;
create policy "Users can view their own invoice items"
  on public.invoice_items for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own invoice items" on public.invoice_items;
create policy "Users can insert their own invoice items"
  on public.invoice_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own invoice items" on public.invoice_items;
create policy "Users can update their own invoice items"
  on public.invoice_items for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own invoice items" on public.invoice_items;
create policy "Users can delete their own invoice items"
  on public.invoice_items for delete
  using (auth.uid() = user_id);

-- contracts
drop policy if exists "Owners can view their own contracts" on public.contracts;
create policy "Owners can view their own contracts"
  on public.contracts for select
  using (auth.uid() = user_id);

drop policy if exists "Owners can insert their own contracts" on public.contracts;
create policy "Owners can insert their own contracts"
  on public.contracts for insert
  with check (auth.uid() = user_id);

drop policy if exists "Owners can update their own contracts" on public.contracts;
create policy "Owners can update their own contracts"
  on public.contracts for update
  using (auth.uid() = user_id);

drop policy if exists "Owners can delete their own contracts" on public.contracts;
create policy "Owners can delete their own contracts"
  on public.contracts for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
-- Every child table is read filtered by client_id.

create index if not exists time_entries_client_id_idx on public.time_entries (client_id);
create index if not exists invoices_client_id_idx on public.invoices (client_id);
create index if not exists contracts_client_id_idx on public.contracts (client_id);
create index if not exists invoice_items_invoice_id_idx on public.invoice_items (invoice_id, position);

-- The board reads only unarchived clients.
create index if not exists clients_active_idx
  on public.clients (user_id)
  where archived_at is null;

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clients_touch_updated_at on public.clients;
create trigger clients_touch_updated_at
  before update on public.clients
  for each row execute function public.touch_updated_at();

drop trigger if exists business_profiles_touch_updated_at on public.business_profiles;
create trigger business_profiles_touch_updated_at
  before update on public.business_profiles
  for each row execute function public.touch_updated_at();

-- The board filters on this across every client on each render.
create index if not exists clients_follow_up_on_idx
  on public.clients (user_id, follow_up_on)
  where follow_up_on is not null;

create index if not exists email_messages_client_idx
  on public.email_messages (client_id, sent_at desc);

create index if not exists email_messages_user_sent_idx
  on public.email_messages (user_id, sent_at desc);

-- The dashboard asks for one user's waiting nudges on every load.
create index if not exists nudges_user_status_idx
  on public.nudges (user_id, status, created_at desc);

-- The nightly job asks "is there already an unresolved nudge for this client?"
-- once per candidate, which is the hot path of the whole run.
create index if not exists nudges_client_waiting_idx
  on public.nudges (client_id, kind)
  where status = 'waiting';

-- ---------------------------------------------------------------------------
-- Invoice numbering
-- ---------------------------------------------------------------------------
-- Sequential per freelancer, so numbering doesn't jump around or leak how many
-- other users exist.
--
-- Two invoices created in the same instant could in principle collide here; at
-- one user raising invoices by hand that is not a real risk, and the fix (a
-- per-user counter row with a lock) is not worth the complexity yet.

create or replace function public.assign_invoice_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.invoice_number is null then
    select coalesce(max(invoice_number), 0) + 1
      into new.invoice_number
      from public.invoices
     where user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_assign_number on public.invoices;
create trigger invoices_assign_number
  before insert on public.invoices
  for each row execute function public.assign_invoice_number();

-- ---------------------------------------------------------------------------
-- Public invoice view
-- ---------------------------------------------------------------------------
-- Same shape as contract signing below: the client has no account, so RLS
-- blocks them from `invoices` entirely. This function is the only way in, it
-- takes the token as its sole credential, and returns just the fields the
-- invoice page displays.
--
-- Drafts are deliberately excluded — an unsent invoice must not be reachable
-- even by someone holding its link.

-- Dropped first: `create or replace` cannot change a return type, so a
-- signature change would otherwise fail on any project that already has it.
drop function if exists public.get_invoice_by_token(uuid);

create or replace function public.get_invoice_by_token(p_token uuid)
returns table (
  invoice_number integer,
  amount_pence integer,
  vat_rate_bp integer,
  basis text,
  status text,
  due_date date,
  created_at timestamptz,
  client_name text,
  client_address text,
  issuer_email text,
  business_name text,
  business_address text,
  vat_number text,
  payment_details text,
  invoice_footer text
)
language sql
stable
security definer
set search_path = public
as $$
  select i.invoice_number,
         i.amount_pence,
         i.vat_rate_bp,
         i.basis,
         i.status,
         i.due_date,
         i.created_at,
         c.name,
         c.address,
         u.email::text,
         b.business_name,
         b.address,
         b.vat_number,
         b.payment_details,
         b.invoice_footer
    from public.invoices i
    join public.clients c on c.id = i.client_id
    join auth.users u on u.id = i.user_id
    left join public.business_profiles b on b.user_id = i.user_id
   where i.share_token = p_token
     and i.status <> 'draft';
$$;

grant execute on function public.get_invoice_by_token(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Invoice totals
-- ---------------------------------------------------------------------------
-- An invoice with no items keeps whatever total it already had, so invoices
-- raised before line items existed are left alone rather than zeroed.

create or replace function public.sync_invoice_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_invoice uuid := coalesce(new.invoice_id, old.invoice_id);
  item_count integer;
  new_total integer;
begin
  select count(*), coalesce(sum(round(quantity_centi * unit_price_pence / 100.0)), 0)
    into item_count, new_total
    from public.invoice_items
   where invoice_id = target_invoice;

  if item_count > 0 then
    update public.invoices
       set amount_pence = new_total
     where id = target_invoice;
  end if;

  return null;
end;
$$;

drop trigger if exists invoice_items_sync_total on public.invoice_items;
create trigger invoice_items_sync_total
  after insert or update or delete on public.invoice_items
  for each row execute function public.sync_invoice_total();

-- Dropped first: `create or replace` cannot change a return type, so a
-- signature change would otherwise fail on any project that already has it.
drop function if exists public.get_invoice_items_by_token(uuid);

create or replace function public.get_invoice_items_by_token(p_token uuid)
returns table (
  description text,
  quantity_centi integer,
  unit_price_pence integer
)
language sql
stable
security definer
set search_path = public
as $$
  -- `position` orders the rows but is not returned: the page renders them in
  -- the order given, and it would also collide with the reserved word in the
  -- column list above.
  select it.description, it.quantity_centi, it.unit_price_pence
    from public.invoice_items it
    join public.invoices i on i.id = it.invoice_id
   where i.share_token = p_token
     and i.status <> 'draft'
   order by it.position, it.created_at;
$$;

grant execute on function public.get_invoice_items_by_token(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public contract signing
-- ---------------------------------------------------------------------------
-- The /sign/[token] page is visited by the *client*, who has no account and is
-- therefore an anonymous Supabase user. RLS blocks anonymous access to
-- `contracts` entirely, so these two functions are the only way in: they run as
-- SECURITY DEFINER (with the owner's rights), take the token as their sole
-- credential, and expose only the columns needed to display and sign.
--
-- `set search_path = public` is required, not cosmetic. A SECURITY DEFINER
-- function without it resolves object names against the caller's search_path,
-- which is a privilege-escalation route.
--
-- Exported from the live project with pg_get_functiondef, so this is what is
-- actually running rather than a reconstruction.

-- Dropped first: `create or replace` cannot change a return type, so a
-- signature change would otherwise fail on any project that already has it.
drop function if exists public.get_contract_by_token(uuid);

create or replace function public.get_contract_by_token(p_token uuid)
returns table (
  id uuid,
  title text,
  body text,
  status text,
  signed_name text,
  signed_at timestamptz
)
language sql
security definer
set search_path to 'public'
as $function$
  select id, title, body, status, signed_name, signed_at
  from public.contracts
  where sign_token = p_token
    and status <> 'draft'
  limit 1;
$function$;

-- Gated on `status = 'sent'`, which is what stops a contract being signed
-- twice, or signed while still a draft.
create or replace function public.sign_contract(p_token uuid, p_name text)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.contracts
  set status = 'signed', signed_name = p_name, signed_at = now()
  where sign_token = p_token and status = 'sent';
$function$;

-- ---------------------------------------------------------------------------
-- Connected mailbox status
-- ---------------------------------------------------------------------------
-- The browser's only view of `email_accounts`, which has no select policy.
--
-- `security definer` so it can read a table the caller cannot, and it filters
-- on auth.uid() itself so it can only ever describe the caller's own
-- connection. The return list is the guarantee: there is no column here that a
-- token could arrive in.
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
