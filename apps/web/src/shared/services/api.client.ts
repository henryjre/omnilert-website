import axios from 'axios';
import { useAuthStore } from '@/features/auth/store/authSlice';
import { useBranchStore } from '@/shared/store/branchStore';

const api = axios.create({
  baseURL: '/api/v1',
});

// Attach access token to every request
api.interceptors.request.use((config) => {
  // Let the browser set multipart boundaries for file uploads.
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    if (config.headers) {
      delete (config.headers as Record<string, unknown>)['Content-Type'];
    }
  } else if (config.headers && !config.headers['Content-Type']) {
    config.headers['Content-Type'] = 'application/json';
  }

  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Derive operating company from the first selected branch and send as header.
  // Backend companyResolver uses this to scope queries to the correct company.
  const { selectedBranchIds, branches } = useBranchStore.getState();
  if (selectedBranchIds.length > 0 && branches.length > 0) {
    const firstBranch = branches.find((b) => b.id === selectedBranchIds[0]);
    if (firstBranch?.companyId) {
      config.headers['X-Company-Id'] = firstBranch.companyId;
    }
  }

  return config;
});

let isRefreshing = false;
let refreshPromise: Promise<any> | null = null;

// Auto-refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (isRefreshing) {
        try {
          const res = await refreshPromise;
          originalRequest.headers.Authorization = `Bearer ${res.data.data.accessToken}`;
          return api(originalRequest);
        } catch {
          return Promise.reject(error);
        }
      }

      isRefreshing = true;
      const refreshToken = useAuthStore.getState().refreshToken;

      if (!refreshToken) {
        isRefreshing = false;
        useAuthStore.getState().logout();
        return Promise.reject(error);
      }

      refreshPromise = axios.post('/api/v1/auth/refresh', { refreshToken });

      try {
        const res = await refreshPromise;
        const { accessToken, refreshToken: newRefreshToken } = res.data.data;

        useAuthStore.getState().setTokens(accessToken, newRefreshToken);
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (err) {
        useAuthStore.getState().logout();
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
        refreshPromise = null;
      }
    }

    return Promise.reject(error);
  },
);

export { api };
