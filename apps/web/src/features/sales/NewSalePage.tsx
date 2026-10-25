import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { createSale } from './api';
import SaleForm from './SaleForm';
import { usePageTitle } from 'hooks/usePageTitle';

export default function NewSalePage() {
  usePageTitle('নতুন বিক্রি');
  const nav = useNavigate();
  const qc = useQueryClient();

  return (
    <div className="mx-auto max-w-2xl">
      <SaleForm
        title="নতুন বিক্রি"
        submitLabel="সংরক্ষণ করুন"
        initial={{ kind: 'external', qty: 1 }}
        onSubmit={async (payload) => {
          await createSale(payload);
          await qc.invalidateQueries({ queryKey: ['sales'] });
          await qc.invalidateQueries({ queryKey: ['stock'] });
          await qc.invalidateQueries({ queryKey: ['dashboard'] });
          nav('/sales');
        }}
      />
    </div>
  );
}
