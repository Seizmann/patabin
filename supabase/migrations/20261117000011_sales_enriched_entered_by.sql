-- v_sales_enriched: expose the entry admin (created_by + display_name)
-- so the sales list can filter and show who entered a sale.

create or replace view public.v_sales_enriched with (security_invoker = true) as
 SELECT s.id,
    s.sold_at,
    s.qty,
    s.list_unit_price,
    s.amount_received,
    s.due_amount,
    s.discount,
    s.discount * 100.0 / NULLIF(s.qty::numeric * s.list_unit_price, 0::numeric) AS discount_pct,
    s.customer_id,
    cu.name AS customer_name,
    cu.phone AS customer_phone,
    s.wallet_account_id,
    w.type AS wallet_type,
    w.name AS wallet_name,
    w.label AS wallet_label,
    COALESCE(( SELECT string_agg((((wr.name || ' ··'::text) || "right"(wr.label, 2)) || ' '::text) || to_char(sr.amount, 'FM999999999'::text), ' + '::text) AS string_agg
           FROM sale_receives sr
             JOIN wallets wr ON wr.id = sr.wallet_account_id
          WHERE sr.sale_id = s.id), ''::text) AS wallet_details,
    s.note,
    s.created_at,
    COALESCE(( SELECT string_agg(DISTINCT (c.code || '/'::text) || pk.code, ', '::text) AS string_agg
           FROM sale_allocations sa
             JOIN packets pk ON pk.id = sa.packet_id
             JOIN chalans c ON c.id = pk.chalan_id
          WHERE sa.sale_id = s.id), ''::text) AS packet_codes,
    COALESCE(( SELECT string_agg(DISTINCT p.name, ', '::text) AS string_agg
           FROM sale_allocations sa
             JOIN packets pk ON pk.id = sa.packet_id
             JOIN partners p ON p.id = pk.owner_partner_id
          WHERE sa.sale_id = s.id), ''::text) AS owner_names,
    s.created_by,
    pr.display_name AS entered_by
   FROM sales s
     JOIN wallets w ON w.id = s.wallet_account_id
     LEFT JOIN customers cu ON cu.id = s.customer_id
     LEFT JOIN profiles pr ON pr.id = s.created_by
  WHERE s.deleted_at IS NULL;
