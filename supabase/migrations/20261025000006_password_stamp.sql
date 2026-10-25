create or replace function public.stamp_password_snapshot() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid := coalesce(new.id, old.id);
  v_hash text;
begin
  if coalesce(new.must_change_password, old.must_change_password, false) then
    select encrypted_password into v_hash from auth.users where id = v_id;
    if v_hash is not null then
      update public.profiles set password_hash_snapshot = v_hash where id = v_id;
      return null;
    end if;
  end if;
  return new;
end $$;

create trigger stamp_password_snapshot_insert after insert on public.profiles
for each row execute function public.stamp_password_snapshot();

create trigger stamp_password_snapshot_update after update of must_change_password on public.profiles
for each row execute function public.stamp_password_snapshot();
