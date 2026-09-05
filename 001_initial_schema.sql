create extension if not exists pgcrypto;

create type public.user_role as enum ('operator', 'staff');
create type public.user_status as enum ('active', 'blocked');
create type public.invitation_status as enum ('active', 'blocked', 'registered');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  full_name text not null,
  email text not null unique,
  role public.user_role not null default 'operator',
  status public.user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.operator_invitations (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  username text not null unique,
  full_name text not null,
  email text not null unique,
  status public.invitation_status not null default 'active',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.commercial_records (
  id uuid primary key default gen_random_uuid(),
  local_id text not null unique,
  operator_id uuid not null references public.profiles(id),
  record_type text not null check (record_type in ('sale', 'rejection', 'hidden_rejection')),
  order_number text,
  record_date date not null default current_date,
  product text,
  delivery_status text not null default 'PENDIENTE',
  treatment text,
  payment_method text,
  campaign text,
  client_name text,
  phone text,
  observation text,
  follow_up_note text,
  follow_up_at timestamptz,
  hidden_rejection_status text,
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shift_assignments (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.profiles(id),
  work_date date not null,
  work_mode text not null check (work_mode in ('Oficina', 'Casa')),
  location text not null,
  work_schedule text not null,
  is_work_day boolean not null default true,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  unique(operator_id, work_date)
);

create table public.break_schedules (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.profiles(id),
  work_date date not null,
  break_one time,
  lunch time,
  break_two time,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  unique(operator_id, work_date)
);

create table public.shift_records (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.profiles(id),
  work_date date not null default current_date,
  started_at timestamptz not null,
  ended_at timestamptz,
  worked_minutes integer not null default 0,
  shift_type text not null check (shift_type in ('Turno normal', 'Extras')),
  work_mode text check (work_mode in ('Oficina', 'Casa')),
  equipment jsonb not null default '{}'::jsonb,
  connection_photo_path text,
  status text not null default 'Abierta',
  created_at timestamptz not null default now()
);

create table public.failure_records (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.profiles(id),
  shift_record_id uuid references public.shift_records(id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_minutes integer not null default 0,
  explanation text not null,
  evidence_path text,
  status text not null default 'Abierta',
  created_at timestamptz not null default now()
);

create table public.certificate_requests (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.profiles(id),
  certificate_type text not null,
  reason text not null,
  status text not null default 'Solicitado',
  staff_note text,
  document_path text,
  hidden_from_staff boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id = auth.uid() and role = 'staff' and status = 'active'); $$;

create or replace function public.get_operator_invitation(invitation_token uuid)
returns table(username text, full_name text, email text, status public.invitation_status)
language sql stable security definer set search_path = public
as $$ select i.username, i.full_name, i.email, i.status from public.operator_invitations i where i.token = invitation_token limit 1; $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare invitation public.operator_invitations%rowtype;
begin
  if new.raw_user_meta_data->>'invitation_token' is not null then
    select * into invitation from public.operator_invitations
    where token = (new.raw_user_meta_data->>'invitation_token')::uuid and status = 'active';
  end if;

  insert into public.profiles(id, username, full_name, email, role)
  values(
    new.id,
    coalesce(invitation.username, new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(invitation.full_name, new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    'operator'::public.user_role
  );

  if invitation.id is not null then
    update public.operator_invitations set status = 'registered', updated_at = now() where id = invitation.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.operator_invitations enable row level security;
alter table public.commercial_records enable row level security;
alter table public.shift_assignments enable row level security;
alter table public.break_schedules enable row level security;
alter table public.shift_records enable row level security;
alter table public.failure_records enable row level security;
alter table public.certificate_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles own or staff" on public.profiles for select using (id = auth.uid() or public.is_staff());
create policy "staff manages profiles" on public.profiles for update using (public.is_staff()) with check (public.is_staff());
create policy "staff manages invitations" on public.operator_invitations for all using (public.is_staff()) with check (public.is_staff());

create policy "commercial records own or staff select" on public.commercial_records for select using (operator_id = auth.uid() or public.is_staff());
create policy "operators create commercial records" on public.commercial_records for insert with check (operator_id = auth.uid() or public.is_staff());
create policy "commercial records own or staff update" on public.commercial_records for update using (operator_id = auth.uid() or public.is_staff()) with check (operator_id = auth.uid() or public.is_staff());
create policy "staff deletes commercial records" on public.commercial_records for delete using (public.is_staff());

create policy "published assignments own or staff" on public.shift_assignments for select using ((operator_id = auth.uid() and published) or public.is_staff());
create policy "staff manages assignments" on public.shift_assignments for all using (public.is_staff()) with check (public.is_staff());
create policy "published breaks own or staff" on public.break_schedules for select using ((operator_id = auth.uid() and published) or public.is_staff());
create policy "staff manages breaks" on public.break_schedules for all using (public.is_staff()) with check (public.is_staff());

create policy "shift records own or staff select" on public.shift_records for select using (operator_id = auth.uid() or public.is_staff());
create policy "operators manage own shifts" on public.shift_records for all using (operator_id = auth.uid() or public.is_staff()) with check (operator_id = auth.uid() or public.is_staff());
create policy "failure records own or staff" on public.failure_records for all using (operator_id = auth.uid() or public.is_staff()) with check (operator_id = auth.uid() or public.is_staff());
create policy "certificate records own or staff" on public.certificate_requests for all using (operator_id = auth.uid() or public.is_staff()) with check (operator_id = auth.uid() or public.is_staff());
create policy "notifications own or staff" on public.notifications for select using (recipient_id = auth.uid() or public.is_staff());
create policy "staff creates notifications" on public.notifications for insert with check (public.is_staff());
create policy "recipient reads notifications" on public.notifications for update using (recipient_id = auth.uid() or public.is_staff());
create policy "staff reads audit logs" on public.audit_logs for select using (public.is_staff());

insert into storage.buckets(id, name, public) values ('connection-evidence', 'connection-evidence', false) on conflict do nothing;
insert into storage.buckets(id, name, public) values ('certificate-documents', 'certificate-documents', false) on conflict do nothing;

create policy "users upload own connection evidence" on storage.objects for insert to authenticated
with check (bucket_id = 'connection-evidence' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users read own connection evidence" on storage.objects for select to authenticated
using (bucket_id = 'connection-evidence' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()));
create policy "staff manages certificate documents" on storage.objects for all to authenticated
using (bucket_id = 'certificate-documents' and public.is_staff())
with check (bucket_id = 'certificate-documents' and public.is_staff());
create policy "operators read own certificate documents" on storage.objects for select to authenticated
using (bucket_id = 'certificate-documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()));
