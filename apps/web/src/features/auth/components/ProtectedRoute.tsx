import { useState, useEffect } from 'react';
import axios from 'axios';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/authSlice';

export function ProtectedRoute() {
  const { isAuthenticated, refreshToken, accessToken, setTokens, logout } = useAuthStore();
  const [initializing, setInitializing] = useState(
    isAuthenticated && !!refreshToken && !accessToken,
  );

  useEffect(() => {
    if (!initializing) return;
    axios
      .post('/api/v1/auth/refresh', { refreshToken })
      .then((res) => setTokens(res.data.data.accessToken, res.data.data.refreshToken))
      .catch(() => logout())
      .finally(() => setInitializing(false));
  }, []);

  if (initializing) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
