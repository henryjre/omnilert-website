import type { ReactNode } from 'react';
import { usePermission } from '@/shared/hooks/usePermission';

interface PermissionGuardProps {
  permission?: string;
  anyPermission?: string[];
  children: ReactNode;
  fallback?: ReactNode;
}

export function PermissionGuard({
  permission,
  anyPermission,
  children,
  fallback = <NotAuthorized />,
}: PermissionGuardProps) {
  const { hasPermission, hasAnyPermission } = usePermission();

  if (permission && !hasPermission(permission)) {
    return <>{fallback}</>;
  }

  if (anyPermission && !hasAnyPermission(...anyPermission)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

function NotAuthorized() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-gray-900">Access Denied</h2>
        <p className="mt-1 text-sm text-gray-500">
          You do not have permission to view this page.
        </p>
      </div>
    </div>
  );
}
