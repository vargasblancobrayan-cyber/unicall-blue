alter table public.operator_performance
  add column if not exists total_orders numeric not null default 0,
  add column if not exists callbacks numeric not null default 0;
