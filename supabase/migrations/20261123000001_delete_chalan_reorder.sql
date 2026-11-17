-- delete_chalan fix: the guard_closed_chalan trigger rejects any packet or
-- purchase update once its chalan is soft-deleted, so dependents must be
-- soft-deleted BEFORE the chalan row itself.

create or replace function public.delete_chalan(p_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.assert_writeable();
  if not coalesce(public.is_su_admin(), false) then
    raise exception 'FORBIDDEN';
  end if;
  if not exists (
    select 1 from public.chalans where id = p_id and status = 'open' and deleted_at is null
  ) then
    raise exception 'CHALAN_NOT_OPEN';
  end if;
  if exists (
    select 1
    from public.sale_allocations sa
    join public.packets pk on pk.id = sa.packet_id and pk.deleted_at is null
    join public.sales s on s.id = sa.sale_id and s.deleted_at is null
    where pk.chalan_id = p_id
  ) or exists (
    select 1 from public.personal_uses pu
    where pu.deleted_at is null
      and (pu.chalan_id = p_id or pu.packet_id in (select id from public.packets where chalan_id = p_id))
  ) or exists (
    select 1 from public.stock_adjustments aj
    join public.packets pk on pk.id = aj.packet_id
    where pk.chalan_id = p_id and aj.deleted_at is null
  ) or exists (
    select 1 from public.expenses e where e.chalan_id = p_id and e.deleted_at is null
  ) then
    raise exception 'CHALAN_IN_USE';
  end if;
  update public.packets set deleted_at = now() where chalan_id = p_id and deleted_at is null;
  update public.chalan_purchases set deleted_at = now() where chalan_id = p_id and deleted_at is null;
  delete from public.sell_priority where packet_id in (select id from public.packets where chalan_id = p_id);
  update public.chalans set deleted_at = now() where id = p_id;
end $$;
