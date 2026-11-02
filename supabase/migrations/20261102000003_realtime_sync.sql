-- realtime UI sync: table gulo supabase_realtime publication-e add kora na thakle
-- client postgres_changes pabe na
do $$
declare
  t text;
begin
  foreach t in array array[
    'sales', 'sale_receives', 'sale_allocations', 'personal_uses',
    'stock_adjustments', 'expenses', 'withdrawals', 'wallet_transfers',
    'customer_payments', 'packets', 'chalans', 'chalan_purchases',
    'customers', 'wallets', 'partners'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
