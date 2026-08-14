-- Meridian — full database schema.
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
  stage text not null default 'lead' check (stage in ('lead', 'proposal_sent', 'negotiating', 'won', 'lost')),
  value_pence integer, -- store money as integer pence to avoid float rounding issues
  notes text,
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

create or replace function public.get_invoice_by_token(p_token uuid)
returns table (
  invoice_number integer,
  amount_pence integer,
  basis text,
  status text,
  due_date date,
  created_at timestamptz,
  client_name text,
  issuer_email text
)
language sql
stable
security definer
set search_path = public
as $$
  select i.invoice_number,
         i.amount_pence,
         i.basis,
         i.status,
         i.due_date,
         i.created_at,
         c.name,
         u.email::text
    from public.invoices i
    join public.clients c on c.id = i.client_id
    join auth.users u on u.id = i.user_id
   where i.share_token = p_token
     and i.status <> 'draft';
$$;

grant execute on function public.get_invoice_by_token(uuid) to anon, authenticated;

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
