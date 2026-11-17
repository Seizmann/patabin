-- delete_personal_use: soft-delete a personal use entry (self mode safe).

create or replace function public.delete_personal_use(p_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.assert_writeable();
  if exists (
    select 1 from public.personal_uses pu
    left join public.packets pk on pk.id = pu.packet_id
    join public.chalans c on c.id = coalesce(pk.chalan_id, pu.chalan_id)
    where pu.id = p_id and (c.status = 'closed' or c.deleted_at is not null)
  ) then
    raise exception 'CHALAN_CLOSED';
  end if;
  update public.personal_uses set deleted_at = now() where id = p_id and deleted_at is null;
end $$;

grant execute on function public.delete_personal_use(uuid) to authenticated;
