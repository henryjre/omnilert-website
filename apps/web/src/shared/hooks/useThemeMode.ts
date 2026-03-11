import { useState, useEffect, useCallback } from 'react';
import { applyThemeMode, THEME_MODE_STORAGE_KEY } from '@/shared/utils/theme';
import type { ThemeMode } from '@/shared/utils/theme';

export function useThemeMode() {
  const [mode, setMode] = useState<ThemeMode>(
    () => (localStorage.getItem(THEME_MODE_STORAGE_KEY) as ThemeMode | null) ?? 'light',
  );

  useEffect(() => {
    applyThemeMode(mode);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyThemeMode('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode]);

  const updateMode = useCallback((next: ThemeMode) => {
    localStorage.setItem(THEME_MODE_STORAGE_KEY, next);
    setMode(next);
  }, []);

  return { mode, setMode: updateMode };
}
