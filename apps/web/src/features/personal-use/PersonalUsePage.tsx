import { useNavigate } from 'react-router-dom';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { createSale, fetchSettings } from 'features/sales/api';
import SaleForm from 'features/sales/SaleForm';
import { usePageTitle } from 'hooks/usePageTitle';

export default function PersonalUsePage() {
  usePageTitle('ব্যক্তিগত ব্যবহার');
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });

  return (
    <div className="mx-auto max-w-2xl">
      <SaleForm
        title="ব্যক্তিগত ব্যবহার"
        submitLabel="সংরক্ষণ করুন"
        initial={{ kind: 'internal', qty: 1 }}
        defaultPrice={Number(settings?.default_sell_price ?? 300)}
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
