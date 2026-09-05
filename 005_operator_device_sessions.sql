create table if not exists public.operator_device_sessions (
  operator_id uuid primary key references public.profiles(id) on delete cascade,
  device_id text not null,
  claimed_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.operator_device_sessions enable row level security;

drop policy if exists "operators see own device session" on public.operator_device_sessions;
create policy "operators see own device session" on public.operator_device_sessions
for select using (operator_id = auth.uid() or public.is_staff());

drop policy if exists "operators manage own device session" on public.operator_device_sessions;
create policy "operators manage own device session" on public.operator_device_sessions
for all using (operator_id = auth.uid() or public.is_staff())
with check (operator_id = auth.uid() or public.is_staff());

create or replace function public.claim_operator_device_session(device_value text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare profile_role public.user_role;
begin
  select role into profile_role from public.profiles where id = auth.uid() and status = 'active';

  if profile_role is null then
    return false;
  end if;

  if profile_role = 'staff' then
    return true;
  end if;

  insert into public.operator_device_sessions(operator_id, device_id, claimed_at, last_seen_at)
  values(auth.uid(), device_value, now(), now())
  on conflict(operator_id) do update
    set device_id = excluded.device_id,
        claimed_at = now(),
        last_seen_at = now();

  return true;
end;
$$;

create or replace function public.touch_operator_device_session(device_value text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare profile_role public.user_role;
declare current_device text;
begin
  select role into profile_role from public.profiles where id = auth.uid() and status = 'active';

  if profile_role is null then
    return false;
  end if;

  if profile_role = 'staff' then
    return true;
  end if;

  select device_id into current_device
  from public.operator_device_sessions
  where operator_id = auth.uid();

  if current_device is distinct from device_value then
    return false;
  end if;

  update public.operator_device_sessions
  set last_seen_at = now()
  where operator_id = auth.uid();

  return true;
end;
$$;

grant execute on function public.claim_operator_device_session(text) to authenticated;
grant execute on function public.touch_operator_device_session(text) to authenticated;
