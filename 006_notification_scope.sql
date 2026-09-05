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
  end if;
  return new;
end;
$$;

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
  end if;
  return new;
end;
$$;

drop trigger if exists shift_published_notification on public.shift_assignments;
drop trigger if exists breaks_published_notification on public.break_schedules;
