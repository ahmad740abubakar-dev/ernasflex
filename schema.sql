create extension if not exists pgcrypto;

create type public.account_state as enum ('pending_payment', 'active', 'suspended');
create type public.task_state as enum ('draft', 'published', 'paused', 'closed');
create type public.submission_state as enum ('pending', 'approved', 'rejected');
create type public.payment_state as enum ('pending', 'success', 'failed', 'review');
create type public.withdrawal_state as enum ('pending', 'approved', 'rejected', 'paid');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  referral_code text unique not null default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  registration_paid boolean not null default false,
  account_status public.account_state not null default 'pending_payment',
  created_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'user')),
  primary key (user_id, role)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  category text not null,
  reward_kobo integer not null check (reward_kobo >= 0),
  funded_amount_kobo integer not null default 0 check (funded_amount_kobo >= 0),
  spent_amount_kobo integer not null default 0 check (spent_amount_kobo >= 0),
  max_submissions integer not null default 100 check (max_submissions > 0),
  status public.task_state not null default 'draft',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.task_submissions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  evidence_text text,
  evidence_url text,
  status public.submission_state not null default 'pending',
  review_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (task_id, user_id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('registration', 'task_campaign')),
  amount_kobo integer not null check (amount_kobo > 0),
  currency text not null default 'NGN',
  reference text unique not null,
  status public.payment_state not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  provider_transaction_id text,
  provider_response jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_kobo bigint not null check (amount_kobo <> 0),
  entry_type text not null check (entry_type in ('task_reward', 'referral_bonus', 'withdrawal_hold', 'withdrawal_release', 'withdrawal_paid', 'adjustment')),
  reference_id uuid,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id),
  referred_user_id uuid unique not null references auth.users(id),
  registration_payment_id uuid references public.payments(id),
  status text not null check (status in ('awaiting_first_approved_task', 'eligible', 'paid', 'cancelled')),
  bonus_kobo integer not null default 20000 check (bonus_kobo >= 0),
  created_at timestamptz not null default now()
);

create table public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_kobo integer not null check (amount_kobo >= 500000),
  bank_name text not null,
  account_number text not null,
  account_name text not null,
  status public.withdrawal_state not null default 'pending',
  admin_note text,
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  published boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  created_at timestamptz not null default now()
);

create index task_submissions_user_idx on public.task_submissions(user_id, created_at desc);
create index payments_user_idx on public.payments(user_id, created_at desc);
create index wallet_ledger_user_idx on public.wallet_ledger(user_id, created_at desc);
create index withdrawals_user_idx on public.withdrawals(user_id, created_at desc);

-- Enable RLS everywhere.
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.tasks enable row level security;
alter table public.task_submissions enable row level security;
alter table public.payments enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.referrals enable row level security;
alter table public.withdrawals enable row level security;
alter table public.announcements enable row level security;
alter table public.support_tickets enable row level security;

-- Safe profile/task read policies; sensitive writes go through trusted server functions.
create policy "users read own profile" on public.profiles for select to authenticated using (id = auth.uid());
-- Profile changes are performed through a trusted server endpoint so users cannot
-- self-edit registration_paid or account_status.
create policy "users read own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());
create policy "users read published tasks" on public.tasks for select to authenticated using (status = 'published');
create policy "users read own submissions" on public.task_submissions for select to authenticated using (user_id = auth.uid());
create policy "users create own submissions" on public.task_submissions for insert to authenticated with check (user_id = auth.uid());
create policy "users read own payments" on public.payments for select to authenticated using (user_id = auth.uid());
create policy "users read own ledger" on public.wallet_ledger for select to authenticated using (user_id = auth.uid());
create policy "users read own referrals" on public.referrals for select to authenticated using (referrer_id = auth.uid() or referred_user_id = auth.uid());
create policy "users read own withdrawals" on public.withdrawals for select to authenticated using (user_id = auth.uid());
create policy "users create own support tickets" on public.support_tickets for insert to authenticated with check (user_id = auth.uid());
create policy "users read own support tickets" on public.support_tickets for select to authenticated using (user_id = auth.uid());
create policy "users read published announcements" on public.announcements for select to authenticated using (published = true);

-- Create a profile and ordinary-user role at signup. Admin is NEVER assigned automatically.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Atomic review: approved task credits one reward exactly once; referral bonus becomes eligible
-- after the referred user's first approved task. Admin must call through the protected function.
create or replace function public.admin_review_submission(
  p_submission_id uuid,
  p_decision text,
  p_admin_id uuid,
  p_review_note text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s public.task_submissions%rowtype;
  t public.tasks%rowtype;
  r public.referrals%rowtype;
begin
  if not exists (select 1 from public.user_roles where user_id = p_admin_id and role = 'admin') then
    raise exception 'Admin required';
  end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'Invalid decision'; end if;

  select * into s from public.task_submissions where id = p_submission_id for update;
  if not found or s.status <> 'pending' then raise exception 'Submission not pending'; end if;
  select * into t from public.tasks where id = s.task_id for update;

  if p_decision = 'approved' then
    if t.status <> 'published' or (t.spent_amount_kobo + t.reward_kobo > t.funded_amount_kobo) then
      raise exception 'Task has insufficient funding or is not published';
    end if;
    update public.task_submissions set status = 'approved', review_note = p_review_note,
      reviewed_by = p_admin_id, reviewed_at = now() where id = s.id;
    update public.tasks set spent_amount_kobo = spent_amount_kobo + t.reward_kobo where id = t.id;
    insert into public.wallet_ledger(user_id, amount_kobo, entry_type, reference_id, description)
      values (s.user_id, t.reward_kobo, 'task_reward', s.id, 'Approved task reward');
    -- Referral reward is only issued once, after first approved task.
    select * into r from public.referrals
      where referred_user_id = s.user_id and status = 'awaiting_first_approved_task' for update;
    if found then
      update public.referrals set status = 'paid' where id = r.id;
      insert into public.wallet_ledger(user_id, amount_kobo, entry_type, reference_id, description)
        values (r.referrer_id, r.bonus_kobo, 'referral_bonus', r.id, 'Referral bonus after first approved task');
    end if;
  else
    update public.task_submissions set status = 'rejected', review_note = p_review_note,
      reviewed_by = p_admin_id, reviewed_at = now() where id = s.id;
  end if;
  return jsonb_build_object('submission_id', s.id, 'decision', p_decision);
end;
$$;

-- Atomic balance calculation and withdrawal hold. A hold ledger entry prevents double spending.
create or replace function public.request_withdrawal(
  p_user_id uuid,
  p_amount_kobo integer,
  p_bank_name text,
  p_account_number text,
  p_account_name text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  current_balance bigint;
  withdrawal_id uuid;
begin
  -- This function is callable only by service_role. The Netlify endpoint verifies
  -- the user's Supabase access token before passing the verified user ID.
  if p_amount_kobo < 500000 then raise exception 'Minimum withdrawal is ₦5,000'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id and registration_paid = true and account_status = 'active') then
    raise exception 'Account not eligible';
  end if;

  select coalesce(sum(amount_kobo), 0) into current_balance
    from public.wallet_ledger where user_id = p_user_id;
  if current_balance < p_amount_kobo then raise exception 'Insufficient available balance'; end if;

  insert into public.withdrawals(user_id, amount_kobo, bank_name, account_number, account_name)
    values (p_user_id, p_amount_kobo, p_bank_name, p_account_number, p_account_name)
    returning id into withdrawal_id;
  insert into public.wallet_ledger(user_id, amount_kobo, entry_type, reference_id, description)
    values (p_user_id, -p_amount_kobo, 'withdrawal_hold', withdrawal_id, 'Withdrawal amount reserved for admin review');
  return withdrawal_id;
end;
$$;

revoke all on function public.admin_review_submission(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_review_submission(uuid, text, uuid, text) to service_role;
revoke all on function public.request_withdrawal(uuid, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.request_withdrawal(uuid, integer, text, text, text) to service_role;

-- After creating your own trusted admin user, replace USER_UUID with the auth.users UUID:
-- insert into public.user_roles (user_id, role) values ('USER_UUID', 'admin');
