-- Run once after the existing Tranzlet schema/security migration.
-- Expands remittance routes and gives administrators enough access to review
-- customer proof and Nigerian payout details.

begin;

alter table public.tranzlet_tags drop constraint if exists tranzlet_tags_asset_type_check;
alter table public.tranzlet_tags add constraint tranzlet_tags_asset_type_check check (asset_type in (
  'PAYPAL','CASHAPP','USDT','BITCOIN','WISE','WESTERN_UNION','SKRILL','REVOLUT','MONEYGRAM','BINANCE','RIA','ZELLE'
));

alter table public.company_payment_handles drop constraint if exists company_payment_handles_asset_type_check;
alter table public.company_payment_handles add constraint company_payment_handles_asset_type_check check (asset_type in (
  'PAYPAL','CASHAPP','USDT','BITCOIN','WISE','WESTERN_UNION','SKRILL','REVOLUT','MONEYGRAM','BINANCE','RIA','ZELLE'
));

-- Admins need the sender profile and saved bank details when processing a payout.
drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "Admins can view all profiles" on public.profiles for select using (public.is_admin_user());

drop policy if exists "Admins can view all bank accounts" on public.user_bank_accounts;
create policy "Admins can view all bank accounts" on public.user_bank_accounts for select using (public.is_admin_user());

-- Allow an administrator to reject a submitted proof without touching the wallet.
create or replace function public.reject_tag(p_tag_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin_user() then
    raise exception 'Unauthorized: admin privileges required.';
  end if;
  update public.tranzlet_tags
  set status = 'REJECTED', updated_at = timezone('utc'::text, now())
  where id = p_tag_id and status = 'PROOF_SUBMITTED';
  if not found then raise exception 'Only submitted payment proofs can be rejected.'; end if;
  return json_build_object('success', true, 'tag_id', p_tag_id, 'status', 'REJECTED');
end;
$$;
revoke all on function public.reject_tag(uuid) from public;
grant execute on function public.reject_tag(uuid) to authenticated;

commit;

-- Keep tranzlet_assets PRIVATE in Supabase Storage.
-- Configure company_payment_handles from the Tranzlet admin page before customers submit proofs.
