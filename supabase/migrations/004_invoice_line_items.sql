-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- An invoice was a single amount with a basis, so a bill assembled from more
-- than one rate could not be expressed, and the client had no idea what they
-- were paying for.
--
-- `invoices.amount_pence` stays the stored total rather than becoming a view
-- over the items: the public invoice page and every existing row depend on it,
-- and a trigger keeps it in step so the two can never drift.

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  -- Quantity is in hundredths so half-hours and part-days are expressible
  -- without floats: 150 means 1.5.
  quantity_centi integer not null default 100 check (quantity_centi > 0),
  unit_price_pence integer not null check (unit_price_pence >= 0),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists invoice_items_invoice_id_idx
  on public.invoice_items (invoice_id, position);

alter table public.invoice_items enable row level security;

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

-- ---------------------------------------------------------------------------
-- Keep the invoice total in step with its items
-- ---------------------------------------------------------------------------
-- Runs on insert, update and delete. An invoice with no items keeps whatever
-- total it already had, so invoices raised before this migration are left
-- exactly as they were rather than being silently zeroed.

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

-- ---------------------------------------------------------------------------
-- Expose items on the public invoice page
-- ---------------------------------------------------------------------------
-- Same rules as get_invoice_by_token: token is the only credential, drafts
-- stay unreachable, and nothing is returned that the page does not display.

create or replace function public.get_invoice_items_by_token(p_token uuid)
returns table (
  description text,
  quantity_centi integer,
  unit_price_pence integer,
  position integer
)
language sql
stable
security definer
set search_path = public
as $$
  select it.description, it.quantity_centi, it.unit_price_pence, it.position
    from public.invoice_items it
    join public.invoices i on i.id = it.invoice_id
   where i.share_token = p_token
     and i.status <> 'draft'
   order by it.position, it.created_at;
$$;

grant execute on function public.get_invoice_items_by_token(uuid) to anon, authenticated;
