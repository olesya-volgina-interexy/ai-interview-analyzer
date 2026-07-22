import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query';
import { Toaster, toast } from 'sonner';
import { AuthProvider } from './context/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { router } from './router';
import { getErrorMessage } from './api/client';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
  // App-wide safety net: any mutation that doesn't handle its own error
  // (or does, in addition) surfaces here instead of failing silently.
  mutationCache: new MutationCache({
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  }),
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Toaster richColors position="top-right" />
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
);