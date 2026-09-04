-- =========================================================================
-- TRANZLET COMPREHENSIVE DATABASE SECURITY MIGRATION
-- =========================================================================
-- Run after the base schema. This migration deliberately keeps privileged
-- operations inside the database and prevents client-side privilege changes.

begin;

-- -------------------------------------------------------------------------
-- 1. Admin role
-- -------------------------------------------------------------------------
alter table public.profiles
    add column if not exists is_admin boolean default false not null;

-- Existing accounts remain non-admin unless explicitly promoted by a
-- trusted database operator/migration.

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(
        (select p.is_admin from public.profiles p where p.id = auth.uid()),
        false
    );
$$;

revoke all on function public.is_admin_user() from public;
grant execute on function public.is_admin_user() to authenticated;

-- Prevent a normal user from changing is_admin. The function is deliberately
-- fail-closed: only an already-authorized admin may retain/change privileges.
create or replace function public.prevent_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.is_admin is distinct from old.is_admin
       and not public.is_admin_user() then
        raise exception 'Unauthorized: administrator privileges cannot be modified by this account.';
    end if;

    return new;
end;
$$;

revoke all on function public.prevent_privilege_escalation() from public;

drop trigger if exists tr_prevent_privilege_escalation on public.profiles;
create trigger tr_prevent_privilege_escalation
    before update on public.profiles
    for each row
    execute function public.prevent_privilege_escalation();

-- -------------------------------------------------------------------------
-- 2. Company payment handles
-- -------------------------------------------------------------------------
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
create policy "Anyone can view active company handles"
on public.company_payment_handles
for select
using (is_active = true);

drop policy if exists "Admins can modify company payment handles" on public.company_payment_handles;
create policy "Admins can modify company payment handles"
on public.company_payment_handles
for all
using (public.is_admin_user())
with check (public.is_admin_user());

-- -------------------------------------------------------------------------
-- 3. Protect tag financial fields and ownership
-- -------------------------------------------------------------------------
-- The base schema has no updated_at column on tranzlet_tags, so add it before
-- any approval RPC attempts to maintain it.
alter table public.tranzlet_tags
    add column if not exists updated_at timestamp with time zone
        default timezone('utc'::text, now()) not null;

-- A user may submit proof for a PENDING tag, but may not alter the financial
-- terms, owner, reference, or asset after creation.
create or replace function public.protect_tranzlet_tag_financial_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_admin_user() then
        if new.user_id is distinct from old.user_id
           or new.reference_tag is distinct from old.reference_tag
           or new.asset_type is distinct from old.asset_type
           or new.amount_usd is distinct from old.amount_usd
           or new.amount_ngn is distinct from old.amount_ngn
           or new.exchange_rate is distinct from old.exchange_rate
           or new.created_at is distinct from old.created_at
           or new.expires_at is distinct from old.expires_at then
            raise exception 'Unauthorized: remittance terms cannot be modified.';
        end if;

        if old.status <> 'PENDING_DEPOSIT'
           or new.status <> 'PROOF_SUBMITTED' then
            raise exception 'Unauthorized: tag can only transition from pending deposit to proof submitted.';
        end if;
    end if;

    new.updated_at := timezone('utc'::text, now());
    return new;
end;
$$;

revoke all on function public.protect_tranzlet_tag_financial_fields() from public;

drop trigger if exists tr_protect_tranzlet_tag_financial_fields on public.tranzlet_tags;
create trigger tr_protect_tranzlet_tag_financial_fields
    before update on public.tranzlet_tags
    for each row
    execute function public.protect_tranzlet_tag_financial_fields();

-- Replace the permissive update policy with an explicit ownership/transition
-- rule. The trigger above prevents changes to financial fields.
drop policy if exists "Users can update own pending tags" on public.tranzlet_tags;
create policy "Users can update own pending tags"
on public.tranzlet_tags
for update
using (auth.uid() = user_id and status = 'PENDING_DEPOSIT')
with check (auth.uid() = user_id and status = 'PROOF_SUBMITTED');

-- -------------------------------------------------------------------------
-- 4. Atomic admin approval + wallet credit
-- -------------------------------------------------------------------------
create or replace function public.approve_tag_and_credit_wallet_atomic(
    p_tag_id uuid
)
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
    if auth.uid() is null then
        raise exception 'Unauthorized: no active session.';
    end if;

    if not public.is_admin_user() then
        raise exception 'Unauthorized: admin privileges required.';
    end if;

    select * into v_tag
    from public.tranzlet_tags
    where id = p_tag_id
    for update;

    if not found then
        raise exception 'Remittance tag not found.';
    end if;

    if v_tag.status <> 'PROOF_SUBMITTED' then
        raise exception 'Only submitted payment proofs can be approved.';
    end if;

    -- Lock/create the wallet in the same transaction as the tag approval.
    select balance_ngn into v_current_balance
    from public.wallets
    where user_id = v_tag.user_id
    for update;

    if not found then
        insert into public.wallets (user_id, balance_ngn)
        values (v_tag.user_id, v_tag.amount_ngn);
        v_new_balance := v_tag.amount_ngn;
    else
        v_new_balance := v_current_balance + v_tag.amount_ngn;

        update public.wallets
        set balance_ngn = v_new_balance,
            updated_at = timezone('utc'::text, now())
        where user_id = v_tag.user_id;
    end if;

    update public.tranzlet_tags
    set status = 'APPROVED',
        updated_at = timezone('utc'::text, now())
    where id = p_tag_id;

    return json_build_object(
        'success', true,
        'tag_id', p_tag_id,
        'credited_ngn', v_tag.amount_ngn,
        'new_balance', v_new_balance
    );
end;
$$;

-- Do not leave a SECURITY DEFINER financial RPC callable by anonymous users.
revoke all on function public.approve_tag_and_credit_wallet_atomic(uuid) from public;
grant execute on function public.approve_tag_and_credit_wallet_atomic(uuid) to authenticated;

-- -------------------------------------------------------------------------
-- 5. Private payment-proof storage
-- -------------------------------------------------------------------------
-- IMPORTANT: set the tranzlet_assets bucket to PRIVATE in Supabase Storage.
-- Policies alone do not turn a public bucket into a private bucket.

drop policy if exists "Users can upload own payment proofs" on storage.objects;
create policy "Users can upload own payment proofs"
on storage.objects
for insert
with check (
    bucket_id = 'tranzlet_assets'
    and auth.uid() = owner_id
    and (storage.foldername(name))[1] = 'payment-proofs'
);

drop policy if exists "Users and admins can view payment proofs" on storage.objects;
create policy "Users and admins can view payment proofs"
on storage.objects
for select
using (
    bucket_id = 'tranzlet_assets'
    and (
        auth.uid() = owner_id
        or public.is_admin_user()
    )
);

-- Prevent users from replacing/deleting arbitrary proof objects.
drop policy if exists "Users can update own payment proofs" on storage.objects;
create policy "Users can update own payment proofs"
on storage.objects
for update
using (
    bucket_id = 'tranzlet_assets'
    and auth.uid() = owner_id
    and (storage.foldername(name))[1] = 'payment-proofs'
)
with check (
    bucket_id = 'tranzlet_assets'
    and auth.uid() = owner_id
    and (storage.foldername(name))[1] = 'payment-proofs'
);

-- No DELETE policy is granted to ordinary users. Admin deletion can be added
-- later if the operational workflow requires it.

commit;

-- Operational requirement:
-- 1. Make storage bucket "tranzlet_assets" PRIVATE in Supabase.
-- 2. Use createSignedUrl(path, short_expiry) for proof viewing.
-- 3. Promote the initial admin only through a trusted SQL migration/operator,
--    never through a browser/client update.
