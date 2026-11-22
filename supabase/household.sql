-- 家族アプリ: 家計機能
-- 既存の買い物テーブルには変更を加えない。

create table if not exists public.household_settings (
  id text primary key default 'default',
  opening_month date not null,
  opening_budget_carry_yen integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint household_settings_singleton check (id = 'default'),
  constraint household_settings_opening_month_first_day
    check (opening_month = date_trunc('month', opening_month)::date)
);

create table if not exists public.household_rules (
  id uuid primary key default gen_random_uuid(),
  effective_month date not null unique,
  kenji_percent numeric(5,2) not null,
  asami_percent numeric(5,2) not null,
  budget_limit_yen integer not null check (budget_limit_yen > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint household_rules_effective_month_first_day
    check (effective_month = date_trunc('month', effective_month)::date),
  constraint household_rules_percent_range
    check (
      kenji_percent >= 0 and kenji_percent <= 100
      and asami_percent >= 0 and asami_percent <= 100
    ),
  constraint household_rules_percent_total
    check (kenji_percent + asami_percent = 100)
);

create table if not exists public.household_periods (
  id uuid primary key default gen_random_uuid(),
  period_month date not null unique,
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  kenji_paid_yen integer not null default 0 check (kenji_paid_yen >= 0),
  asami_debit_yen integer not null default 0 check (asami_debit_yen >= 0),
  asami_cash_yen integer not null default 0 check (asami_cash_yen >= 0),
  rule_id_snapshot uuid references public.household_rules(id) on delete restrict,
  budget_limit_yen_snapshot integer,
  kenji_percent_snapshot numeric(5,2),
  asami_percent_snapshot numeric(5,2),
  total_paid_yen integer,
  kenji_target_yen integer,
  asami_target_yen integer,
  unsettled_delta_yen integer,
  budget_delta_yen integer,
  budget_carry_balance_yen integer,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint household_periods_month_first_day
    check (period_month = date_trunc('month', period_month)::date),
  constraint household_periods_confirmed_snapshot check (
    status = 'draft'
    or (
      rule_id_snapshot is not null
      and budget_limit_yen_snapshot is not null
      and kenji_percent_snapshot is not null
      and asami_percent_snapshot is not null
      and total_paid_yen is not null
      and kenji_target_yen is not null
      and asami_target_yen is not null
      and unsettled_delta_yen is not null
      and budget_delta_yen is not null
      and budget_carry_balance_yen is not null
      and confirmed_at is not null
    )
  )
);

create table if not exists public.household_settlements (
  id uuid primary key default gen_random_uuid(),
  settlement_date date not null,
  direction text not null check (direction in ('asami_to_kenji', 'kenji_to_asami')),
  amount_yen integer not null check (amount_yen > 0),
  balance_before_yen integer not null,
  balance_after_yen integer not null,
  created_at timestamptz not null default now()
);

create index if not exists household_rules_effective_month_idx
  on public.household_rules(effective_month desc);
create index if not exists household_periods_period_month_idx
  on public.household_periods(period_month);
create index if not exists household_periods_status_month_idx
  on public.household_periods(status, period_month);
create index if not exists household_periods_rule_snapshot_idx
  on public.household_periods(rule_id_snapshot);
create index if not exists household_settlements_date_idx
  on public.household_settlements(settlement_date, created_at);

drop trigger if exists household_settings_set_updated_at on public.household_settings;
create trigger household_settings_set_updated_at
before update on public.household_settings
for each row execute function public.set_updated_at();

drop trigger if exists household_rules_set_updated_at on public.household_rules;
create trigger household_rules_set_updated_at
before update on public.household_rules
for each row execute function public.set_updated_at();

drop trigger if exists household_periods_set_updated_at on public.household_periods;
create trigger household_periods_set_updated_at
before update on public.household_periods
for each row execute function public.set_updated_at();

create or replace function public.guard_confirmed_household_period()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.status = 'confirmed' then
    raise exception 'confirmed household period is immutable';
  end if;

  if tg_op = 'DELETE' and old.status = 'confirmed' then
    raise exception 'confirmed household period cannot be deleted';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_confirmed_household_period() from public, anon, authenticated;

drop trigger if exists household_periods_guard_confirmed on public.household_periods;
create trigger household_periods_guard_confirmed
before update or delete on public.household_periods
for each row execute function public.guard_confirmed_household_period();

create or replace function public.guard_household_rule_history()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.household_periods p
    where p.status = 'confirmed'
      and p.rule_id_snapshot = old.id
  ) then
    raise exception 'rule used by a confirmed period is immutable';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_household_rule_history() from public, anon, authenticated;

drop trigger if exists household_rules_guard_history on public.household_rules;
create trigger household_rules_guard_history
before update or delete on public.household_rules
for each row execute function public.guard_household_rule_history();

create or replace function public.guard_household_settings_history()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from public.household_periods where status = 'confirmed'
  ) and (
    new.opening_month is distinct from old.opening_month
    or new.opening_budget_carry_yen is distinct from old.opening_budget_carry_yen
  ) then
    raise exception 'opening household balance is immutable after confirmation';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_household_settings_history() from public, anon, authenticated;

drop trigger if exists household_settings_guard_history on public.household_settings;
create trigger household_settings_guard_history
before update on public.household_settings
for each row execute function public.guard_household_settings_history();

create or replace function public.block_household_settlement_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'household settlement history is immutable';
end;
$$;

revoke all on function public.block_household_settlement_changes() from public, anon, authenticated;

drop trigger if exists household_settlements_block_changes on public.household_settlements;
create trigger household_settlements_block_changes
before update or delete on public.household_settlements
for each row execute function public.block_household_settlement_changes();

alter table public.household_settings enable row level security;
alter table public.household_rules enable row level security;
alter table public.household_periods enable row level security;
alter table public.household_settlements enable row level security;

drop policy if exists "family can read household settings" on public.household_settings;
drop policy if exists "family can insert household settings" on public.household_settings;
drop policy if exists "family can update household settings" on public.household_settings;
create policy "family can read household settings"
on public.household_settings for select to anon
using (private.valid_family_share_key());
create policy "family can insert household settings"
on public.household_settings for insert to anon
with check (private.valid_family_share_key());
create policy "family can update household settings"
on public.household_settings for update to anon
using (private.valid_family_share_key())
with check (private.valid_family_share_key());

drop policy if exists "family can read household rules" on public.household_rules;
drop policy if exists "family can insert household rules" on public.household_rules;
drop policy if exists "family can update household rules" on public.household_rules;
drop policy if exists "family can delete household rules" on public.household_rules;
create policy "family can read household rules"
on public.household_rules for select to anon
using (private.valid_family_share_key());
create policy "family can insert household rules"
on public.household_rules for insert to anon
with check (private.valid_family_share_key());
create policy "family can update household rules"
on public.household_rules for update to anon
using (private.valid_family_share_key())
with check (private.valid_family_share_key());
create policy "family can delete household rules"
on public.household_rules for delete to anon
using (private.valid_family_share_key());

drop policy if exists "family can read household periods" on public.household_periods;
drop policy if exists "family can insert household periods" on public.household_periods;
drop policy if exists "family can update household periods" on public.household_periods;
drop policy if exists "family can delete household periods" on public.household_periods;
create policy "family can read household periods"
on public.household_periods for select to anon
using (private.valid_family_share_key());
create policy "family can insert household periods"
on public.household_periods for insert to anon
with check (private.valid_family_share_key());
create policy "family can update household periods"
on public.household_periods for update to anon
using (private.valid_family_share_key())
with check (private.valid_family_share_key());
create policy "family can delete household periods"
on public.household_periods for delete to anon
using (private.valid_family_share_key());

drop policy if exists "family can read household settlements" on public.household_settlements;
drop policy if exists "family can insert household settlements" on public.household_settlements;
create policy "family can read household settlements"
on public.household_settlements for select to anon
using (private.valid_family_share_key());
create policy "family can insert household settlements"
on public.household_settlements for insert to anon
with check (private.valid_family_share_key());

grant select, insert, update on public.household_settings to anon;
grant select, insert, update, delete on public.household_rules to anon;
grant select, insert, update, delete on public.household_periods to anon;
grant select, insert on public.household_settlements to anon;

create or replace function public.confirm_household_period(p_period_month date)
returns public.household_periods
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  p public.household_periods%rowtype;
  r public.household_rules%rowtype;
  previous_carry integer;
  total_paid integer;
  kenji_target integer;
  asami_target integer;
  unsettled_delta integer;
  budget_delta integer;
begin
  if not private.valid_family_share_key() then
    raise exception 'invalid share key';
  end if;

  perform pg_advisory_xact_lock(hashtext('family_household_confirm'));

  select *
  into p
  from public.household_periods
  where period_month = p_period_month
  for update;

  if not found then
    raise exception 'household period not found';
  end if;

  if p.status = 'confirmed' then
    raise exception 'household period already confirmed';
  end if;

  if exists (
    select 1
    from public.household_periods
    where status = 'draft'
      and period_month < p_period_month
  ) then
    raise exception 'an earlier household period is still unconfirmed';
  end if;

  if exists (
    select 1
    from public.household_periods
    where status = 'confirmed'
      and period_month > p_period_month
  ) then
    raise exception 'cannot confirm a month before an already confirmed month';
  end if;

  select *
  into r
  from public.household_rules
  where effective_month <= p_period_month
  order by effective_month desc
  limit 1;

  if not found then
    raise exception 'no household rule applies to this month';
  end if;

  select budget_carry_balance_yen
  into previous_carry
  from public.household_periods
  where status = 'confirmed'
    and period_month < p_period_month
  order by period_month desc
  limit 1;

  if previous_carry is null then
    select opening_budget_carry_yen
    into previous_carry
    from public.household_settings
    where id = 'default';
  end if;

  if previous_carry is null then
    previous_carry := 0;
  end if;

  total_paid := p.kenji_paid_yen + p.asami_debit_yen + p.asami_cash_yen;
  kenji_target := round(total_paid * r.kenji_percent / 100.0)::integer;
  asami_target := total_paid - kenji_target;
  unsettled_delta := p.kenji_paid_yen - kenji_target;
  budget_delta := r.budget_limit_yen - total_paid;

  update public.household_periods
  set
    status = 'confirmed',
    rule_id_snapshot = r.id,
    budget_limit_yen_snapshot = r.budget_limit_yen,
    kenji_percent_snapshot = r.kenji_percent,
    asami_percent_snapshot = r.asami_percent,
    total_paid_yen = total_paid,
    kenji_target_yen = kenji_target,
    asami_target_yen = asami_target,
    unsettled_delta_yen = unsettled_delta,
    budget_delta_yen = budget_delta,
    budget_carry_balance_yen = previous_carry + budget_delta,
    confirmed_at = now()
  where id = p.id
  returning * into p;

  return p;
end;
$$;

revoke all on function public.confirm_household_period(date) from public, authenticated;
grant execute on function public.confirm_household_period(date) to anon;

create or replace function public.register_household_settlement(
  p_settlement_date date,
  p_direction text,
  p_amount_yen integer
)
returns public.household_settlements
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  current_balance integer;
  signed_effect integer;
  result_row public.household_settlements%rowtype;
begin
  if not private.valid_family_share_key() then
    raise exception 'invalid share key';
  end if;

  if p_amount_yen is null or p_amount_yen <= 0 then
    raise exception 'settlement amount must be positive';
  end if;

  if p_direction not in ('asami_to_kenji', 'kenji_to_asami') then
    raise exception 'invalid settlement direction';
  end if;

  perform pg_advisory_xact_lock(hashtext('family_household_settlement'));

  select
    coalesce((select sum(unsettled_delta_yen) from public.household_periods where status = 'confirmed'), 0)
    -
    coalesce((
      select sum(
        case
          when direction = 'asami_to_kenji' then amount_yen
          else -amount_yen
        end
      )
      from public.household_settlements
    ), 0)
  into current_balance;

  if current_balance = 0 then
    raise exception 'there is no unsettled balance';
  end if;

  if current_balance > 0 and p_direction <> 'asami_to_kenji' then
    raise exception 'settlement direction does not match current balance';
  end if;

  if current_balance < 0 and p_direction <> 'kenji_to_asami' then
    raise exception 'settlement direction does not match current balance';
  end if;

  if p_amount_yen > abs(current_balance) then
    raise exception 'settlement amount exceeds current unsettled balance';
  end if;

  signed_effect := case
    when p_direction = 'asami_to_kenji' then p_amount_yen
    else -p_amount_yen
  end;

  insert into public.household_settlements (
    settlement_date,
    direction,
    amount_yen,
    balance_before_yen,
    balance_after_yen
  )
  values (
    p_settlement_date,
    p_direction,
    p_amount_yen,
    current_balance,
    current_balance - signed_effect
  )
  returning * into result_row;

  return result_row;
end;
$$;

revoke all on function public.register_household_settlement(date, text, integer)
from public, authenticated;
grant execute on function public.register_household_settlement(date, text, integer)
to anon;

drop trigger if exists household_settings_emit_event on public.household_settings;
create trigger household_settings_emit_event
after insert or update or delete on public.household_settings
for each statement execute function public.emit_shopping_event();

drop trigger if exists household_rules_emit_event on public.household_rules;
create trigger household_rules_emit_event
after insert or update or delete on public.household_rules
for each statement execute function public.emit_shopping_event();

drop trigger if exists household_periods_emit_event on public.household_periods;
create trigger household_periods_emit_event
after insert or update or delete on public.household_periods
for each statement execute function public.emit_shopping_event();

drop trigger if exists household_settlements_emit_event on public.household_settlements;
create trigger household_settlements_emit_event
after insert or update or delete on public.household_settlements
for each statement execute function public.emit_shopping_event();

insert into public.household_settings(id, opening_month, opening_budget_carry_yen)
values ('default', '2026-01-01', 80618)
on conflict (id) do nothing;

insert into public.household_rules(effective_month, kenji_percent, asami_percent, budget_limit_yen)
values
  ('2025-01-01', 60, 40, 260000),
  ('2025-04-01', 67, 33, 260000),
  ('2026-01-01', 67, 33, 250000)
on conflict (effective_month) do nothing;
