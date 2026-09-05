create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  invitation public.operator_invitations%rowtype;
  invitation_token text;
begin
  invitation_token := nullif(new.raw_user_meta_data->>'invitation_token', '');

  if invitation_token is not null then
    select * into invitation from public.operator_invitations
    where token = invitation_token::uuid and status = 'active';
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
