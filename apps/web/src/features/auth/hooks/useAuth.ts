import { useAuthStore } from '../store/authSlice';
import { api } from '@/shared/services/api.client';
import { applyCompanyThemeFromHex, DEFAULT_THEME_COLOR } from '@/shared/utils/theme';

export function useAuth() {
  const { user, isAuthenticated, setAuth, logout: storeLogout } = useAuthStore();

  const login = async (email: string, password: string, companySlug?: string) => {
    const res = await api.post('/auth/login', { email, password, companySlug });
    const {
      user,
      accessToken,
      refreshToken,
      companySlug: selectedCompanySlug,
      companyThemeColor,
      companyName,
    } = res.data.data;
    const appliedTheme = applyCompanyThemeFromHex(companyThemeColor);
    setAuth(user, accessToken, refreshToken, selectedCompanySlug ?? null, appliedTheme, companyName ?? null);
    return user;
  };

  const switchCompany = async (companySlug: string) => {
    const res = await api.post('/auth/switch-company', { companySlug });
    const {
      user,
      accessToken,
      refreshToken,
      companySlug: selectedCompanySlug,
      companyThemeColor,
      companyName,
    } = res.data.data;
    const appliedTheme = applyCompanyThemeFromHex(companyThemeColor);
    setAuth(user, accessToken, refreshToken, selectedCompanySlug ?? null, appliedTheme, companyName ?? null);
    return user;
  };

  const logout = async () => {
    const refreshToken = useAuthStore.getState().refreshToken;
    try {
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken });
      }
    } catch {
      // Ignore errors on logout
    }
    applyCompanyThemeFromHex(DEFAULT_THEME_COLOR);
    storeLogout();
  };

  return { user, isAuthenticated, login, switchCompany, logout };
}
