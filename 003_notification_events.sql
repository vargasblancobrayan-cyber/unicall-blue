create or replace function public.notify_staff(title_value text, message_value text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications(recipient_id, title, message)
  select id, title_value, message_value
  from public.profiles
  where role = 'staff' and status = 'active';
$$;

create or replace function public.notify_commercial_record_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare operator_name text;
begin
  select full_name into operator_name from public.profiles where id = new.operator_id;
  if new.record_type = 'hidden_rejection' then
    perform public.notify_staff('Nuevo rechazo oculto', coalesce(operator_name, 'Un operador') || ' envio el pedido ' || coalesce(new.order_number, '-') || ' para revision.');
  elsif new.record_type = 'rejection' then
    perform public.notify_staff('Nuevo rechazo registrado', coalesce(operator_name, 'Un operador') || ' registro el pedido ' || coalesce(new.order_number, '-') || '.');
  else
    perform public.notify_staff('Nueva venta registrada', coalesce(operator_name, 'Un operador') || ' registro la venta ' || coalesce(new.order_number, '-') || '.');
  end if;
  return new;
end;
$$;

drop trigger if exists commercial_record_created_notification on public.commercial_records;
create trigger commercial_record_created_notification
after insert on public.commercial_records
for each row execute procedure public.notify_commercial_record_created();

create or replace function public.notify_commercial_record_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.hidden_rejection_status is distinct from old.hidden_rejection_status and new.hidden_rejection_status is not null then
    insert into public.notifications(recipient_id, title, message)
    values(
      new.operator_id,
      case when new.hidden_rejection_status = 'Aprobado' then 'Rechazo oculto aprobado' else 'Rechazo oculto no aprobado' end,
      'Pedido ' || coalesce(new.order_number, '-') || ': ' || coalesce(new.follow_up_note, 'Revisa la decision de staff.')
    );
  elsif new.delivery_status is distinct from old.delivery_status then
    insert into public.notifications(recipient_id, title, message)
    values(new.operator_id, 'Pedido actualizado', 'El pedido ' || coalesce(new.order_number, '-') || ' ahora esta ' || new.delivery_status || '.');
  end if;
  return new;
end;
$$;

drop trigger if exists commercial_record_updated_notification on public.commercial_records;
create trigger commercial_record_updated_notification
after update on public.commercial_records
for each row execute procedure public.notify_commercial_record_updated();

create or replace function public.notify_certificate_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare operator_name text;
begin
  select full_name into operator_name from public.profiles where id = new.operator_id;
  perform public.notify_staff('Solicitud de certificado', coalesce(operator_name, 'Un operador') || ' solicito ' || new.certificate_type || '.');
  return new;
end;
$$;

drop trigger if exists certificate_created_notification on public.certificate_requests;
create trigger certificate_created_notification
after insert on public.certificate_requests
for each row execute procedure public.notify_certificate_created();

create or replace function public.notify_certificate_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status or new.document_path is distinct from old.document_path then
    insert into public.notifications(recipient_id, title, message)
    values(
      new.operator_id,
      case when new.status = 'Listo' then 'Certificado listo' else 'Certificado actualizado' end,
      new.certificate_type || ' esta en estado ' || new.status || '. ' || coalesce(new.staff_note, '')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists certificate_updated_notification on public.certificate_requests;
create trigger certificate_updated_notification
after update on public.certificate_requests
for each row execute procedure public.notify_certificate_updated();

create or replace function public.notify_schedule_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.published and (tg_op = 'INSERT' or not old.published) then
    insert into public.notifications(recipient_id, title, message)
    values(new.operator_id, 'Turno publicado', 'Ya puedes consultar tu programacion del ' || to_char(new.work_date, 'DD/MM/YYYY') || '.');
  end if;
  return new;
end;
$$;

drop trigger if exists shift_published_notification on public.shift_assignments;
create trigger shift_published_notification
after insert or update on public.shift_assignments
for each row execute procedure public.notify_schedule_published();

create or replace function public.notify_breaks_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.published and (tg_op = 'INSERT' or not old.published) then
    insert into public.notifications(recipient_id, title, message)
    values(new.operator_id, 'Breaks y almuerzo publicados', 'Tus descansos del ' || to_char(new.work_date, 'DD/MM/YYYY') || ' ya estan disponibles.');
  end if;
  return new;
end;
$$;

drop trigger if exists breaks_published_notification on public.break_schedules;
create trigger breaks_published_notification
after insert or update on public.break_schedules
for each row execute procedure public.notify_breaks_published();
