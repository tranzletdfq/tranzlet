-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Users Profile Extension Table
create table public.profiles (
    id uuid references auth.users on delete cascade primary key,
    full_name text not null,
    phone_number text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.profiles enable row level security;
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

-- 2. Tranzlet Tags (Inbound Remittance Tracker)
create table public.tranzlet_tags (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references public.profiles(id) on delete cascade not null,
    reference_tag text unique not null,
    asset_type text not null check (asset_type in ('PAYPAL', 'CASHAPP', 'USDT', 'BITCOIN')),
    amount_usd numeric(12, 2) not null,
    amount_ngn numeric(12, 2) not null,
    exchange_rate numeric(12, 2) not null,
    status text default 'PENDING_DEPOSIT' check (status in ('PENDING_DEPOSIT', 'PROOF_SUBMITTED', 'APPROVED', 'REJECTED')),
    sender_name text,
    transaction_identifier text,
    proof_image_url text,
    expires_at timestamp with time zone default null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.tranzlet_tags enable row level security;
create policy "Users can view own tags" on public.tranzlet_tags for select using (auth.uid() = user_id);
create policy "Users can insert own tags" on public.tranzlet_tags for insert with check (auth.uid() = user_id);
create policy "Users can update own pending tags" on public.tranzlet_tags for update using (auth.uid() = user_id and status = 'PENDING_DEPOSIT');

-- 3. NGN Wallet & Ledger
create table public.wallets (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references public.profiles(id) on delete cascade unique not null,
    balance_ngn numeric(14, 2) default 0.00 not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.wallets enable row level security;
create policy "Users can view own wallet" on public.wallets for select using (auth.uid() = user_id);

-- 4. Company Static Inbound Payment Handles
create table public.company_payment_handles (
    id uuid default uuid_generate_v4() primary key,
    asset_type text not null check (asset_type in ('PAYPAL', 'CASHAPP', 'USDT', 'BITCOIN')),
    handle_name text not null,
    handle_value text not null,
    is_active boolean default true not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.company_payment_handles enable row level security;
create policy "Anyone can view active company handles" on public.company_payment_handles for select using (is_active = true);

-- 5. User Saved Bank Accounts
create table public.user_bank_accounts (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references public.profiles(id) on delete cascade not null,
    bank_name text not null,
    account_number text not null,
    account_name text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.user_bank_accounts enable row level security;
create policy "Users can view own bank accounts" on public.user_bank_accounts for select using (auth.uid() = user_id);
create policy "Users can insert own bank accounts" on public.user_bank_accounts for insert with check (auth.uid() = user_id);

-- 6. Withdrawal Requests Ledger
create table public.withdrawal_requests (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references public.profiles(id) on delete cascade not null,
    bank_account_id uuid references public.user_bank_accounts(id) not null,
    amount_ngn numeric(14, 2) not null,
    status text default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.withdrawal_requests enable row level security;
create policy "Users can view own withdrawals" on public.withdrawal_requests for select using (auth.uid() = user_id);
create policy "Users can insert own withdrawals" on public.withdrawal_requests for insert with check (auth.uid() = user_id);

-- 7. Secure Atomic Withdrawal RPC Function
create or replace function public.request_withdrawal_atomic(
    p_bank_account_id uuid,
    p_amount_ngn numeric
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid;
    v_current_balance numeric;
    v_withdrawal_id uuid;
    v_new_balance numeric;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Unauthorized: No active session found.';
    end if;

    if p_amount_ngn is null or p_amount_ngn <= 0 then
        raise exception 'Invalid withdrawal amount.';
    end if;

    -- Ensure the requested bank account belongs to the authenticated user.
    if not exists (
        select 1
        from public.user_bank_accounts
        where id = p_bank_account_id
          and user_id = v_user_id
    ) then
        raise exception 'Invalid bank account.';
    end if;

    -- Lock the wallet row so concurrent withdrawals serialize safely.
    select balance_ngn into v_current_balance
    from public.wallets
    where user_id = v_user_id
    for update;

    if not found then
        raise exception 'Wallet not found.';
    end if;

    if v_current_balance < p_amount_ngn then
        raise exception 'Insufficient wallet balance.';
    end if;

    v_new_balance := v_current_balance - p_amount_ngn;

    update public.wallets
    set balance_ngn = v_new_balance,
        updated_at = timezone('utc'::text, now())
    where user_id = v_user_id;

    insert into public.withdrawal_requests (
        user_id,
        bank_account_id,
        amount_ngn,
        status
    ) values (
        v_user_id,
        p_bank_account_id,
        p_amount_ngn,
        'PENDING'
    )
    returning id into v_withdrawal_id;

    return json_build_object(
        'success', true,
        'withdrawal_id', v_withdrawal_id,
        'new_balance', v_new_balance
    );
end;
$$;

revoke all on function public.request_withdrawal_atomic(uuid, numeric) from public;
grant execute on function public.request_withdrawal_atomic(uuid, numeric) to authenticated;
