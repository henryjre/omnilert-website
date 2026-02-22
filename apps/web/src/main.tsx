import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './assets/styles/globals.css';
import { useAuthStore } from './features/auth/store/authSlice';
import { applyCompanyThemeFromHex, DEFAULT_THEME_COLOR } from './shared/utils/theme';

const persistedTheme = useAuthStore.getState().companyThemeColor ?? DEFAULT_THEME_COLOR;
applyCompanyThemeFromHex(persistedTheme);

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
