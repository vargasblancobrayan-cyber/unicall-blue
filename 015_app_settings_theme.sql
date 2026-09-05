create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.app_settings enable row level security;

drop policy if exists "app settings readable by authenticated" on public.app_settings;
create policy "app settings readable by authenticated"
on public.app_settings
for select
to authenticated
using (true);

drop policy if exists "staff manages app settings" on public.app_settings;
create policy "staff manages app settings"
on public.app_settings
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'staff'
      and coalesce(p.status, 'active') <> 'blocked'
      and (
        lower(coalesce(p.email, '')) in ('vargasblancobrayan@gmail.com', 'j.castro@unicall.io')
        or lower(coalesce(p.username, '')) in ('vargasblancobrayan', 'j.castro')
      )
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'staff'
      and coalesce(p.status, 'active') <> 'blocked'
      and (
        lower(coalesce(p.email, '')) in ('vargasblancobrayan@gmail.com', 'j.castro@unicall.io')
        or lower(coalesce(p.username, '')) in ('vargasblancobrayan', 'j.castro')
      )
  )
);

insert into public.app_settings (key, value)
values ('global_theme', '{"theme":"light"}'::jsonb)
on conflict (key) do nothing;
