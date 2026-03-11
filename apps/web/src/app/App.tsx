import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { router } from './router';
import { THEME_MODE_STORAGE_KEY } from '@/shared/utils/theme';
import type { ThemeMode } from '@/shared/utils/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  const toasterTheme = (localStorage.getItem(THEME_MODE_STORAGE_KEY) as ThemeMode | null) ?? 'system';

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster position="top-right" richColors theme={toasterTheme} />
    </QueryClientProvider>
  );
}
