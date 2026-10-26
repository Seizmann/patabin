import type { ReactElement } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from 'lib/auth';

export function RequireAuth(): ReactElement {
  const { session, profile, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <RouteLoading />;
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!profile) return <Navigate to="/login" replace />;
  if (profile.must_change_password) return <Navigate to="/change-password" replace />;
  return <Outlet />;
}

export function RequireSu(): ReactElement {
  const { profile } = useAuth();
  const loc = useLocation();
  if (profile) return <Outlet />;
  return <Navigate to={loc.state?.from as string | undefined ?? '/login'} replace />;
}

export function GuestOnly(): ReactElement {
  const { session, profile } = useAuth();
  if (session) return <Navigate to={profile?.must_change_password ? '/change-password' : '/'} replace />;
  return <Outlet />;
}

function RouteLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="skeleton h-10 w-44" />
      <div className="grid grid-cols-2 gap-4">
        <div className="skeleton h-28" />
        <div className="skeleton h-28" />
      </div>
      <div className="skeleton h-56" />
    </div>
  );
}
