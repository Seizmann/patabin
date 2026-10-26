import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider } from 'lib/auth';
import { useIdleSignout } from 'hooks/useIdleSignout';
import AppShell from 'components/layout/AppShell';
import { GuestOnly, RequireAuth, RequireSu } from './guards';
import Unknown from 'features/notfound/UnknownPage';

const LoginPage = lazy(() => import('features/auth/LoginPage'));
const ChangePasswordPage = lazy(() => import('features/auth/ChangePasswordPage'));
const DashboardPage = lazy(() => import('features/dashboard/DashboardPage'));
const SalesPage = lazy(() => import('features/sales/SalesPage'));
const NewSalePage = lazy(() => import('features/sales/NewSalePage'));
const PersonalUsePage = lazy(() => import('features/personal-use/PersonalUsePage'));
const ChalansPage = lazy(() => import('features/chalans/ChalansPage'));
const NewChalanPage = lazy(() => import('features/chalans/NewChalanPage'));
const ChalanDetailPage = lazy(() => import('features/chalans/ChalanDetailPage'));
const PacketsPage = lazy(() => import('features/packets/PacketsPage'));
const CustomersPage = lazy(() => import('features/customers/CustomersPage'));
const ExpensesPage = lazy(() => import('features/expenses/ExpensesPage'));
const AdjustmentsPage = lazy(() => import('features/adjustments/AdjustmentsPage'));
const WalletsPage = lazy(() => import('features/wallets/WalletsPage'));
const SettlementPage = lazy(() => import('features/settlement/SettlementPage'));
const ReportsPage = lazy(() => import('features/reports/ReportsPage'));
const AuditTrailPage = lazy(() => import('features/audit/AuditTrailPage'));
const UsersPage = lazy(() => import('features/users/UsersPage'));
const SettingsPage = lazy(() => import('features/settings/SettingsPage'));
const ProfilePage = lazy(() => import('features/profile/ProfilePage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false },
  },
});

function Page({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<ShellFallback />}>{children}</Suspense>;
}

function ShellFallback() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-busy="true">
      <div className="skeleton h-10 w-40" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="skeleton h-28 w-full" />
        <div className="skeleton h-28 w-full" />
        <div className="skeleton h-28 w-full" />
        <div className="skeleton h-28 w-full" />
      </div>
      <div className="skeleton h-56 w-full" />
    </div>
  );
}

export default function App() {
  useIdleSignout();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<GuestOnly />}>
              <Route path="/login" element={<Page><LoginPage /></Page>} />
            </Route>
            <Route path="/change-password" element={<Page><ChangePasswordPage /></Page>} />
            <Route element={<RequireAuthApp />}>
              <Route element={<AppShell />}>
                <Route path="/" element={<Page><DashboardPage /></Page>} />
                <Route path="/sales" element={<Page><SalesPage /></Page>} />
                <Route path="/sales/new" element={<Page><NewSalePage /></Page>} />
                <Route path="/personal-use" element={<Page><PersonalUsePage /></Page>} />
                <Route path="/chalans" element={<Page><ChalansPage /></Page>} />
                <Route path="/chalans/new" element={<Page><NewChalanPage /></Page>} />
                <Route path="/chalans/:code" element={<Page><ChalanDetailPage /></Page>} />
                <Route path="/packets" element={<Page><PacketsPage /></Page>} />
                <Route path="/customers" element={<Page><CustomersPage /></Page>} />
                <Route path="/expenses" element={<Page><ExpensesPage /></Page>} />
                <Route path="/adjustments" element={<Page><AdjustmentsPage /></Page>} />
                <Route path="/wallets" element={<Page><WalletsPage /></Page>} />
                <Route path="/settlement" element={<Page><SettlementPage /></Page>} />
                <Route path="/reports" element={<Page><ReportsPage /></Page>} />
                <Route path="/audit-trail" element={<Page><AuditTrailPage /></Page>} />
                <Route path="/profile" element={<Page><ProfilePage /></Page>} />
                <Route element={<RequireSuRoute />}>
                  <Route path="/users" element={<Page><UsersPage /></Page>} />
                  <Route path="/settings" element={<Page><SettingsPage /></Page>} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<Page><Unknown /></Page>} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function RequireAuthApp() {
  return <RequireAuth />;
}

function RequireSuRoute() {
  return <RequireSu />;
}
