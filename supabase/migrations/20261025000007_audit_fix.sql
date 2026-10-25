create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_row_id uuid;
begin
  if tg_table_name <> 'settings' then
    v_row_id := coalesce((to_jsonb(new) ->> 'id')::uuid, (to_jsonb(old) ->> 'id')::uuid);
  end if;
  insert into public.audit_log (user_id, table_name, row_id, action, old_data, new_data)
  values (
    auth.uid(),
    tg_table_name,
    v_row_id,
    left(tg_op, 1),
    nullif(to_jsonb(old), 'null'::jsonb),
    nullif(to_jsonb(new), 'null'::jsonb)
  );
  return coalesce(new, old);
end $$;
