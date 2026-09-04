-- =========================================================================
-- TRANZLET COMPREHENSIVE DATABASE SECURITY MIGRATION
-- =========================================================================
-- Run after the base schema.

begin;

alter table public.profiles
    add column if not exists is_admin boolean default false not null;

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

revoke all on function public.is_admin_user() from public;
grant execute on function public.is_admin_user() to authenticated;

create or replace function public.prevent_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.is_admin is distinct from old.is_admin and not public.is_admin_user() then
        raise exception 'Unauthorized: administrator privileges cannot be modified by this account.';
    end if;
    return new;
end;
$$;

revoke all on function public.prevent_privilege_escalation() from public;
drop trigger if exists tr_prevent_privilege_escalation on public.profiles;
create trigger tr_prevent_privilege_escalation before update on public.profiles for each row execute function public.prevent_privilege_escalation();

create table if not exists public.company_payment_handles (
    id uuid default uuid_generate_v4() primary key,
    asset_type text not null check (asset_type in ('PAYPAL', 'CASHAPP', 'USDT', 'BITCOIN')),
    handle_name text not null,
    handle_value text not null,
    is_active boolean default true not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.company_payment_handles enable row level security;
drop policy if exists "Anyone can view active company handles" on public.company_payment_handles;
create policy "Anyone can view active company handles" on public.company_payment_handles for select using (is_active = true);
drop policy if exists "Admins can modify company payment handles" on public.company_payment_handles;
create policy "Admins can modify company payment handles" on public.company_payment_handles for all using (public.is_admin_user()) with check (public.is_admin_user());

alter table public.tranzlet_tags add column if not exists updated_at timestamp with time zone default timezone('utc'::text, now()) not null;

create or replace function public.protect_tranzlet_tag_financial_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_admin_user() then
        if new.user_id is distinct from old.user_id or new.reference_tag is distinct from old.reference_tag or new.asset_type is distinct from old.asset_type or new.amount_usd is distinct from old.amount_usd or new.amount_ngn is distinct from old.amount_ngn or new.exchange_rate is distinct from old.exchange_rate or new.created_at is distinct from old.created_at or new.expires_at is distinct from old.expires_at then
            raise exception 'Unauthorized: remittance terms cannot be modified.';
        end if;
        if old.status <> 'PENDING_DEPOSIT' or new.status <> 'PROOF_SUBMITTED' then
            raise exception 'Unauthorized: tag can only transition from pending deposit to proof submitted.';
        end if;
    end if;
    new.updated_at := timezone('utc'::text, now());
    return new;
end;
$$;
revoke all on function public.protect_tranzlet_tag_financial_fields() from public;
drop trigger if exists tr_protect_tranzlet_tag_financial_fields on public.tranzlet_tags;
create trigger tr_protect_tranzlet_tag_financial_fields before update on public.tranzlet_tags for each row execute function public.protect_tranzlet_tag_financial_fields();

drop policy if exists "Users can update own pending tags" on public.tranzlet_tags;
create policy "Users can update own pending tags" on public.tranzlet_tags for update using (auth.uid() = user_id and status = 'PENDING_DEPOSIT') with check (auth.uid() = user_id and status = 'PROOF_SUBMITTED');
drop policy if exists "Admins can view all tags" on public.tranzlet_tags;
create policy "Admins can view all tags" on public.tranzlet_tags for select using (public.is_admin_user());

create or replace function public.approve_tag_and_credit_wallet_atomic(p_tag_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_tag public.tranzlet_tags%rowtype;
    v_current_balance numeric;
    v_new_balance numeric;
begin
    if auth.uid() is null or not public.is_admin_user() then raise exception 'Unauthorized: admin privileges required.'; end if;
    select * into v_tag from public.tranzlet_tags where id = p_tag_id for update;
    if not found then raise exception 'Remittance tag not found.'; end if;
    if v_tag.status <> 'PROOF_SUBMITTED' then raise exception 'Only submitted payment proofs can be approved.'; end if;
    select balance_ngn into v_current_balance from public.wallets where user_id = v_tag.user_id for update;
    if not found then
        insert into public.wallets (user_id, balance_ngn) values (v_tag.user_id, v_tag.amount_ngn);
        v_new_balance := v_tag.amount_ngn;
    else
        v_new_balance := v_current_balance + v_tag.amount_ngn;
        update public.wallets set balance_ngn = v_new_balance, updated_at = timezone('utc'::text, now()) where user_id = v_tag.user_id;
    end if;
    update public.tranzlet_tags set status = 'APPROVED', updated_at = timezone('utc'::text, now()) where id = p_tag_id;
    return json_build_object('success', true, 'tag_id', p_tag_id, 'credited_ngn', v_tag.amount_ngn, 'new_balance', v_new_balance);
end;
$$;
revoke all on function public.approve_tag_and_credit_wallet_atomic(uuid) from public;
grant execute on function public.approve_tag_and_credit_wallet_atomic(uuid) to authenticated;

-- Admins may review withdrawal requests. Payout execution remains a separate operational step.
drop policy if exists "Admins can view all withdrawals" on public.withdrawal_requests;
create policy "Admins can view all withdrawals" on public.withdrawal_requests for select using (public.is_admin_user());

drop policy if exists "Admins can update withdrawals" on public.withdrawal_requests;
create policy "Admins can update withdrawals" on public.withdrawal_requests for update using (public.is_admin_user()) with check (public.is_admin_user());

-- Payment proofs remain private. Set the bucket itself to PRIVATE in Supabase Storage.
drop policy if exists "Users can upload own payment proofs" on storage.objects;
create policy "Users can upload own payment proofs" on storage.objects for insert with check (bucket_id = 'tranzlet_assets' and auth.uid() = owner_id and (storage.foldername(name))[1] = 'payment-proofs');
drop policy if exists "Users and admins can view payment proofs" on storage.objects;
create policy "Users and admins can view payment proofs" on storage.objects for select using (bucket_id = 'tranzlet_assets' and (auth.uid() = owner_id or public.is_admin_user()));
drop policy if exists "Users can update own payment proofs" on storage.objects;
create policy "Users can update own payment proofs" on storage.objects for update using (bucket_id = 'tranzlet_assets' and auth.uid() = owner_id and (storage.foldername(name))[1] = 'payment-proofs') with check (bucket_id = 'tranzlet_assets' and auth.uid() = owner_id and (storage.foldername(name))[1] = 'payment-proofs');

commit;

-- Operational requirements:
-- 1. Make tranzlet_assets PRIVATE.
-- 2. Use short-lived signed URLs for proof viewing.
-- 3. Promote the first admin only through a trusted SQL operator.
