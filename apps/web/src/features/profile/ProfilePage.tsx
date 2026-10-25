import { useNavigate } from 'react-router-dom';
import bn from 'i18n/bn';
import { supabase } from 'lib/supabase';
import { useAuth } from 'lib/auth';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn, Card, Notice, PageTitle, Skeleton } from 'components/ui/base';

export default function ProfilePage() {
  usePageTitle('প্রোফাইল');
  const { profile, session } = useAuth();
  const nav = useNavigate();

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle tag="PataBin" title="প্রোফাইল" />
      <Card className="flex flex-col gap-5 p-6">
        {profile ? (
          <>
            <Line label="নাম" value={profile.display_name || '-'} />
            <Line label="ইমেইল" value={session?.user.email ?? '-'} />
            <Line label="ভূমিকা" value={profile.role === 'su_admin' ? 'সুপার অ্যাডমিন' : 'অ্যাডমিন'} />
            <Line label="অবস্থা" value={profile.is_active ? 'সক্রিয়' : 'নিষ্ক্রিয়'} />
          </>
        ) : (
          <div className="flex flex-col gap-3" aria-busy>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-64" />
          </div>
        )}
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={() => nav('/change-password')}>
            পাসওয়ার্ড পরিবর্তন
          </Btn>
          <Btn onClick={() => void supabase.auth.signOut()}>{bn.logout}</Btn>
        </div>
        <Notice>যেকোনো সমস্যায় সুপার অ্যাডমিনের সাথে যোগাযোগ করুন।</Notice>
      </Card>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="p-label">{label}</p>
      <p className="text-[15px] font-semibold">{value}</p>
    </div>
  );
}
