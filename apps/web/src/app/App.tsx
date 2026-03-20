import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { router } from './router';
import { AppToastViewport } from '@/shared/components/ui/AppToastViewport';
import { queryClient } from '@/shared/services/queryClient';
import { THEME_MODE_STORAGE_KEY } from '@/shared/utils/theme';
import type { ThemeMode } from '@/shared/utils/theme';

export function App() {
  const toasterTheme = (localStorage.getItem(THEME_MODE_STORAGE_KEY) as ThemeMode | null) ?? 'system';

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster position="top-right" richColors theme={toasterTheme} />
      <AppToastViewport />
    </QueryClientProvider>
  );
}
