import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  employeeNumber: number | null;
  roles: { id: string; name: string; color: string | null }[];
  permissions: string[];
  branchIds: string[];
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  companySlug: string | null;
  companyThemeColor: string | null;
  companyName: string | null;
  isAuthenticated: boolean;

  setAuth: (
    user: AuthUser,
    accessToken: string,
    refreshToken: string,
    companySlug?: string | null,
    companyThemeColor?: string | null,
    companyName?: string | null,
  ) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setCompanyThemeColor: (themeColor: string | null) => void;
  setCompanyName: (companyName: string | null) => void;
  updateUser: (updates: Partial<AuthUser>) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      companySlug: null,
      companyThemeColor: null,
      companyName: null,
      isAuthenticated: false,

      setAuth: (user, accessToken, refreshToken, companySlug, companyThemeColor, companyName) =>
        set({
          user,
          accessToken,
          refreshToken,
          companySlug: companySlug ?? null,
          companyThemeColor: companyThemeColor ?? null,
          companyName: companyName ?? null,
          isAuthenticated: true,
        }),

      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),

      setCompanyThemeColor: (companyThemeColor) => set({ companyThemeColor }),
      setCompanyName: (companyName) => set({ companyName }),

      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : state.user,
        })),

      logout: () =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          companySlug: null,
          companyThemeColor: null,
          companyName: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'omnilert-auth',
      partialize: (state) => ({
        refreshToken: state.refreshToken,
        companySlug: state.companySlug,
        user: state.user,
        companyThemeColor: state.companyThemeColor,
        companyName: state.companyName,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
