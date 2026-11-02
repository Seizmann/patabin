import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from 'lib/supabase';

const SALE_KEYS = [
  'sales', 'dashboard', 'stock', 'packets', 'packets-preview', 'balances',
  'wallets-all', 'customer-balances', 'customer-detail', 'settlement',
  'report-data', 'chalans', 'chalan-summaries', 'audit',
];

const TABLE_KEYS: Record<string, string[]> = {
  sales: SALE_KEYS,
  sale_receives: SALE_KEYS,
  sale_allocations: SALE_KEYS,
  personal_uses: ['personal-uses', 'packets', 'balances', 'dashboard', 'report-data', 'audit'],
  stock_adjustments: ['adjustments', 'packets', 'packets-all', 'packet-detail', 'balances', 'dashboard', 'report-data', 'audit'],
  expenses: ['expenses', 'balances', 'dashboard', 'report-data', 'audit'],
  withdrawals: ['wallets-all', 'balances', 'dashboard', 'report-data', 'audit'],
  wallet_transfers: ['wallets-all', 'transfers', 'balances', 'dashboard', 'report-data', 'audit'],
  customer_payments: ['customer-payments', 'customer-balances', 'customers', 'customer-detail', 'balances', 'dashboard', 'audit'],
  packets: ['packets', 'packets-all', 'packets-preview', 'packet-detail', 'stock', 'dashboard', 'open-chalan-pack', 'chalans', 'chalan-settlement-list', 'audit'],
  chalans: ['chalans', 'chalans-period-meta', 'open-chalan-pack', 'chalan-summaries', 'chalan-settlement-list', 'packets', 'stock', 'dashboard', 'audit'],
  chalan_purchases: ['chalans', 'packets', 'stock', 'dashboard', 'report-data', 'audit'],
  customers: ['customers', 'customer-balances', 'customer-detail', 'audit'],
  wallets: ['wallets', 'wallets-all', 'wallets-names', 'balances', 'dashboard'],
  partners: ['partners', 'my-partner', 'report-data'],
};

export default function useRealtimeSync() {
  const qc = useQueryClient();
  useEffect(() => {
    const sync = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      for (const key of TABLE_KEYS[payload.table] ?? []) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
    };
    const channel = supabase.channel('db-sync');
    for (const table of Object.keys(TABLE_KEYS)) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, sync);
    }
    void supabase.auth.getSession().then(({ data }) => {
      void supabase.realtime.setAuth(data.session?.access_token ?? null);
      channel.subscribe();
    });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);
}
