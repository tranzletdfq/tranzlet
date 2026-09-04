-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Users Profile Extension Table
create table public.profiles (
    id uuid references auth.users on delete cascade primary key,
    full_name text not null,
    phone_number text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for Profiles
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

-- Enable RLS for Tags
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
