import { QueryClient } from "@tanstack/react-query";

/**
 * Singleton QueryClient for the entire app. Defined here (not in app-providers.tsx)
 * so sync code can import it without creating a circular dependency with AppProviders.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});
