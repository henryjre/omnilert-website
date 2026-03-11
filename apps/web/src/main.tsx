import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './assets/styles/globals.css';
import { useAuthStore } from './features/auth/store/authSlice';
import { applyCompanyThemeFromHex, applyThemeMode, THEME_MODE_STORAGE_KEY, DEFAULT_THEME_COLOR } from './shared/utils/theme';
import type { ThemeMode } from './shared/utils/theme';

const persistedTheme = useAuthStore.getState().companyThemeColor ?? DEFAULT_THEME_COLOR;
applyCompanyThemeFromHex(persistedTheme);

const storedMode = (localStorage.getItem(THEME_MODE_STORAGE_KEY) as ThemeMode | null) ?? 'system';
applyThemeMode(storedMode);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Non-blocking: app keeps working without service worker registration.
    });
  });
}
