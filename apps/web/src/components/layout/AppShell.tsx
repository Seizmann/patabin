import { useState, type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  Calculator,
  House,
  Money,
  Package,
  Receipt,
  UserCircle,
  Wallet,
  X,
  DotsThree,
  type IconProps,
} from '@phosphor-icons/react';
import bn from 'i18n/bn';
import { supabase } from 'lib/supabase';
import { useAuth } from 'lib/auth';

type Icon = (p: IconProps) => ReactNode;

interface Section {
  to: string;
  label: string;
  Icon: Icon;
  end?: boolean;
}

const sections: Section[] = [
  { to: '/', label: bn.home, Icon: House, end: true },
  { to: '/sales', label: bn.sales, Icon: Money },
  { to: '/packets', label: bn.packetsNav, Icon: Package },
  { to: '/expenses', label: bn.expensesNav, Icon: Receipt },
  { to: '/settlement', label: bn.settlement, Icon: Calculator },
  { to: '/wallets', label: bn.wallets, Icon: Wallet },
];

const moreItems = (suAdmin: boolean): Omit<Section, 'end'>[] => [
  { to: '/chalans', label: bn.chalans, Icon: Package },
  { to: '/customers', label: bn.customerNav, Icon: UserCircle },
  { to: '/reports', label: bn.reports, Icon: Receipt },
  { to: '/personal-use', label: bn.personalUse, Icon: UserCircle },
  { to: '/adjustments', label: bn.adjustments, Icon: Receipt },
  { to: '/audit-trail', label: bn.auditTrail, Icon: Receipt },
  ...(suAdmin
    ? [
        { to: '/users', label: bn.users, Icon: UserCircle },
        { to: '/settings', label: bn.settings, Icon: Calculator },
      ]
    : []),
  { to: '/profile', label: bn.profile, Icon: UserCircle },
];

export default function AppShell() {
  const { suAdmin, profile } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  const tabCls = `flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-ink-mute`;
  const sideCls = `flex min-h-[44px] items-center gap-3 rounded-lg px-4 py-2 text-[15px] text-ink-mute hover:text-espresso`;

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-hairline bg-surface p-4 lg:flex">
        <img src="/brand/wordmark.png" alt="PataBin" className="mb-6 h-9 w-auto self-start" />
        <nav aria-label="Primary" className="flex flex-1 flex-col gap-1">
          {sections.map((s) => (
            <NavLink key={s.to} to={s.to} end={s.end} className={sideCls}>
              {({ isActive }) => (
                <span className={`flex items-center gap-3 ${isActive ? 'font-bold text-espresso' : ''}`}>
                  <s.Icon weight={isActive ? 'fill' : 'regular'} size={20} />
                  {s.label}
                </span>
              )}
            </NavLink>
          ))}
          <div className="mt-3 flex flex-col gap-1 border-t border-hairline pt-3">
            {moreItems(suAdmin).map((s) => (
              <NavLink key={s.to} to={s.to} className={sideCls}>
                <s.Icon weight="regular" size={20} />
                {s.label}
              </NavLink>
            ))}
          </div>
        </nav>
        <button type="button" onClick={() => void supabase.auth.signOut()} className="min-h-[44px] rounded-lg px-4 text-left font-semibold text-bad">
          {bn.logout}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-10">
          <Outlet />
        </main>
        <nav
          aria-label="Primary"
          className="fixed inset-x-0 bottom-0 z-20 flex border-t border-hairline bg-surface lg:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {sections.slice(0, 5).map((s) => (
            <NavLink key={s.to} to={s.to} end={s.end} className={tabCls} aria-label={s.label}>
              {({ isActive }) => (
                <span className={`flex flex-col items-center gap-0.5 ${isActive ? 'text-espresso' : ''}`}>
                  <s.Icon weight={isActive ? 'fill' : 'regular'} size={22} />
                  {s.label}
                </span>
              )}
            </NavLink>
          ))}
          <button type="button" aria-label={bn.more} className={tabCls + ' text-espresso'} onClick={() => setMoreOpen(true)}>
            <DotsThree weight="regular" size={22} />
            {bn.more}
          </button>
        </nav>
      </div>

      {moreOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end overflow-y-auto bg-black/40 sm:items-center sm:p-6"
          role="presentation"
          onClick={() => setMoreOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={bn.more}
            className="card w-full max-h-[92vh] overflow-y-auto rounded-b-3xl border-0 p-5 sm:mx-auto sm:max-w-lg sm:rounded-3xl"
            style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="p-label">PataBin</p>
                <p className="p-title">{profile?.display_name}</p>
              </div>
              <button type="button" onClick={() => setMoreOpen(false)} aria-label={bn.cancel} className="min-h-[44px] px-2 text-ink-mute">
                <X weight="regular" size={22} />
              </button>
            </div>
            <nav className="flex flex-col gap-1" aria-label="All sections">
              {moreItems(suAdmin).map((s) => (
                <NavLink key={s.to} to={s.to} onClick={() => setMoreOpen(false)} className="min-h-[48px] rounded-lg px-3 py-3 font-semibold">
                  {s.label}
                </NavLink>
              ))}
            </nav>
            <div className="my-4 border-t border-hairline" />
            <button type="button" onClick={() => void supabase.auth.signOut()} className="min-h-[48px] w-full rounded-lg px-2 text-left font-semibold text-bad">
              {bn.logout}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
