create or replace function public.commercial_order_exists(order_value text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.commercial_records
    where lower(trim(order_number)) = lower(trim(order_value))
      and coalesce(delivery_status, '') <> 'ELIMINADO'
  );
$$;

grant execute on function public.commercial_order_exists(text) to authenticated;
