create or replace function public.delete_sale(p_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.assert_writeable();
  if exists (select 1 from public.sale_allocations sa join public.batches b on b.id = sa.batch_id where sa.sale_id = p_id and (b.status = 'closed' or b.deleted_at is not null)) then
    raise exception 'BATCH_CLOSED';
  end if;
  update public.sales set deleted_at = now() where id = p_id and deleted_at is null;
  delete from public.sale_allocations where sale_id = p_id;
end $$;

grant execute on function public.delete_sale(uuid) to authenticated;
