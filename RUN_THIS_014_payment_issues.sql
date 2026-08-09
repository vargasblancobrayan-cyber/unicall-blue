create table if not exists public.payment_issues (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.profiles(id) on delete cascade,
  period_type text not null check (period_type in ('quincena', 'mes')),
  period_value text not null,
  issue_type text not null,
  expected_amount numeric,
  received_amount numeric,
  comment text not null,
  proof_path text,
  proof_name text,
  proof_type text,
  proof_size integer,
  status text not null default 'Enviado' check (status in ('Enviado', 'En revision', 'Falta prueba', 'Resuelto', 'No procede', 'Cerrado')),
  staff_note text,
  staff_id uuid references public.profiles(id) on delete set null,
  staff_name text,
  updated_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_issues_operator_created_idx on public.payment_issues(operator_id, created_at desc);
create index if not exists payment_issues_status_updated_idx on public.payment_issues(status, updated_at desc);
create index if not exists payment_issues_period_idx on public.payment_issues(period_value);

alter table public.payment_issues enable row level security;

drop policy if exists "payment issues select own or staff" on public.payment_issues;
create policy "payment issues select own or staff"
on public.payment_issues
for select
to authenticated
using (
  operator_id = (select auth.uid())
  or exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'staff'
      and p.status = 'active'
  )
);

drop policy if exists "payment issues insert own" on public.payment_issues;
create policy "payment issues insert own"
on public.payment_issues
for insert
to authenticated
with check (operator_id = (select auth.uid()));

drop policy if exists "payment issues update own or staff" on public.payment_issues;
create policy "payment issues update own or staff"
on public.payment_issues
for update
to authenticated
using (
  operator_id = (select auth.uid())
  or exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'staff'
      and p.status = 'active'
  )
)
with check (
  operator_id = (select auth.uid())
  or exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'staff'
      and p.status = 'active'
  )
);

drop policy if exists "payment issues delete staff" on public.payment_issues;
create policy "payment issues delete staff"
on public.payment_issues
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'staff'
      and p.status = 'active'
  )
);

grant select, insert, update, delete on public.payment_issues to authenticated;
