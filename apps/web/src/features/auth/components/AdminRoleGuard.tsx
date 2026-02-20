import type { ReactNode } from 'react';
import { useAuthStore } from '../store/authSlice';

interface AdminRoleGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function AdminRoleGuard({
  children,
  fallback = <NotAuthorized />,
}: AdminRoleGuardProps) {
  const user = useAuthStore((state) => state.user);
  const isAdministrator = (user?.roles ?? []).some((role) => role.name === 'Administrator');

  if (!isAdministrator) return <>{fallback}</>;
  return <>{children}</>;
}

function NotAuthorized() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-gray-900">Access Denied</h2>
        <p className="mt-1 text-sm text-gray-500">
          Administrator role required to view this page.
        </p>
      </div>
    </div>
  );
}

