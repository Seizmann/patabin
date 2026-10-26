import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { createSale, type SaleInput } from './api';
import SaleForm from './SaleForm';
import { usePageTitle } from 'hooks/usePageTitle';
import { fetchStockCurrent } from 'features/dashboard/api';

export default function NewSalePage() {
  usePageTitle('নতুন বিক্রি');
  const nav = useNavigate();
  const qc = useQueryClient();

  return (
    <div className="mx-auto max-w-2xl">
      <SaleForm
        title="নতুন বিক্রি"
        submitLabel="বিক্রি সংরক্ষণ"
        onSubmit={async (payload: SaleInput) => {
          await createSale(payload);
          await qc.invalidateQueries({ queryKey: ['sales'] });
          await qc.invalidateQueries({ queryKey: ['packets'] });
          await qc.invalidateQueries({ queryKey: ['balances'] });
          await qc.invalidateQueries({ queryKey: ['wallets'] });
          await qc.invalidateQueries({ queryKey: ['dashboard'] });
          await fetchStockCurrent();
          nav('/sales');
        }}
      />
    </div>
  );
}
