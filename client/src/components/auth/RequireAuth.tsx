import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/useAuth';

const authGuardEnabled = import.meta.env.VITE_AUTH_GUARD === 'true';

function FullPageStatus({ label }: { label: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-3 text-neutral-500">
        <div className="w-8 h-8 rounded-full border-2 border-neutral-200 border-t-primary-base animate-spin" />
        <p className="text-para-sm">{label}</p>
      </div>
    </div>
  );
}

export function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (!authGuardEnabled) {
    return <Outlet />;
  }

  if (isLoading) {
    return <FullPageStatus label="Checking session…" />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/app/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

export function RedirectIfAuthenticated({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (!authGuardEnabled) {
    return <>{children}</>;
  }

  if (isLoading) {
    return <FullPageStatus label="Loading…" />;
  }

  if (isAuthenticated) {
    return <Navigate to="/app/library" replace />;
  }

  return <>{children}</>;
}
