import { useAuthStore } from '@/features/auth/store/authSlice';

export function usePermission() {
  const user = useAuthStore((s) => s.user);
  const permissions = new Set(user?.permissions ?? []);

  return {
    hasPermission: (key: string) => permissions.has(key),
    hasAnyPermission: (...keys: string[]) => keys.some((k) => permissions.has(k)),
    hasAllPermissions: (...keys: string[]) => keys.every((k) => permissions.has(k)),
  };
}
