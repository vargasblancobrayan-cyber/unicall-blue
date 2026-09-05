create table if not exists public.shift_change_requests (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  color text not null check (color in ('green', 'blue')),
  replacement_user text not null check (char_length(replacement_user) <= 15),
  reason text not null check (char_length(reason) <= 15),
  status text not null default 'Pendiente' check (status in ('Pendiente', 'Aprobado', 'Denegado')),
  staff_note text,
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shift_change_requests enable row level security;

drop policy if exists "shift changes own or staff select" on public.shift_change_requests;
create policy "shift changes own or staff select"
on public.shift_change_requests for select
using (operator_id = auth.uid() or public.is_staff());

drop policy if exists "operators create own shift changes" on public.shift_change_requests;
create policy "operators create own shift changes"
on public.shift_change_requests for insert
with check (operator_id = auth.uid());

drop policy if exists "staff reviews shift changes" on public.shift_change_requests;
create policy "staff reviews shift changes"
on public.shift_change_requests for update
using (public.is_staff())
with check (public.is_staff());

create or replace function public.notify_shift_change_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare operator_name text;
begin
  select coalesce(username, full_name) into operator_name from public.profiles where id = new.operator_id;
  perform public.notify_staff(
    'Cambio de turno solicitado',
    coalesce(operator_name, 'Un operador') || ' solicito cambiar el dia ' || to_char(new.work_date, 'DD/MM/YYYY') || ' con ' || new.replacement_user || '.'
  );
  return new;
end;
$$;

drop trigger if exists shift_change_created_notification on public.shift_change_requests;
create trigger shift_change_created_notification
after insert on public.shift_change_requests
for each row execute procedure public.notify_shift_change_created();

create or replace function public.notify_shift_change_reviewed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status and new.status in ('Aprobado', 'Denegado') then
    insert into public.notifications(recipient_id, title, message)
    values(
      new.operator_id,
      case when new.status = 'Aprobado' then 'Cambio de turno aprobado' else 'Cambio de turno denegado' end,
      'Dia ' || to_char(new.work_date, 'DD/MM/YYYY') || ': ' || coalesce(new.staff_note, 'Revisa la respuesta de Staff.')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists shift_change_reviewed_notification on public.shift_change_requests;
create trigger shift_change_reviewed_notification
after update on public.shift_change_requests
for each row execute procedure public.notify_shift_change_reviewed();
