create or replace function public.resolve_login_email(login_value text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.email
  from public.profiles p
  where p.status = 'active'
    and (lower(p.email) = lower(trim(login_value)) or lower(p.username) = lower(trim(login_value)))
  limit 1;
$$;

grant execute on function public.resolve_login_email(text) to anon, authenticated;

create or replace function public.delete_operator_account(operator_email text, operator_username text)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Solo staff puede eliminar operadores';
  end if;

  select p.id into target_id
  from public.profiles p
  where p.role = 'operator'
    and (lower(p.email) = lower(trim(operator_email)) or lower(p.username) = lower(trim(operator_username)))
  limit 1;

  if target_id is not null then
    delete from public.notifications where recipient_id = target_id;
    delete from public.failure_records where operator_id = target_id;
    delete from public.certificate_requests where operator_id = target_id;
    delete from public.shift_records where operator_id = target_id;
    delete from public.break_schedules where operator_id = target_id;
    delete from public.shift_assignments where operator_id = target_id;
    delete from public.commercial_records where operator_id = target_id or reviewed_by = target_id;
    delete from public.audit_logs where actor_id = target_id;
    update public.operator_invitations set created_by = null where created_by = target_id;
    delete from storage.objects
    where bucket_id in ('connection-evidence', 'certificate-documents')
      and (storage.foldername(name))[1] = target_id::text;
    delete from auth.users where id = target_id;
  end if;

  delete from public.operator_invitations
  where lower(email) = lower(trim(operator_email))
     or lower(username) = lower(trim(operator_username));

  return target_id is not null;
end;
$$;

grant execute on function public.delete_operator_account(text, text) to authenticated;
