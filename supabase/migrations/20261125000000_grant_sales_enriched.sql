-- Restore authenticated read access after v_sales_enriched was recreated.
grant select on public.v_sales_enriched to authenticated;
