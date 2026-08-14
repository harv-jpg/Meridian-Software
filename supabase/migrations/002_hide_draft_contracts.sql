-- Run this in the Supabase SQL Editor.
--
-- `get_contract_by_token` returned a contract at any status, so a draft was
-- reachable by anyone holding its link — even though the UI only reveals that
-- link once the contract is marked sent. The invoice equivalent already
-- excluded drafts; this brings contracts in line.
--
-- Signing was never exposed: sign_contract is gated on status = 'sent'.

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
