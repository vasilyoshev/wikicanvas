import { useEffect, type PropsWithChildren } from "react";
import { focusManager, QueryClientProvider } from "@tanstack/react-query";
import { AppState, Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { validateRequiredEnv } from "@/src/lib/env";
import { queryClient } from "@/src/lib/query-client";
import { useSync } from "@/src/features/sync/use-sync";
import { I18nProvider } from "@/src/providers/i18n-provider";
import { SessionProvider } from "@/src/providers/session-provider";

// React Query doesn't know about AppState on native - teach it to treat
// foreground transitions as focus events so stale queries are refetched.
if (Platform.OS !== "web") {
  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener("change", (state) => {
      handleFocus(state === "active");
    });
    return () => subscription.remove();
  });
}

export { queryClient };

/** Lives inside SessionProvider so useSession() resolves; drives sync as auth state flips. */
function SyncGate({ children }: PropsWithChildren) {
  useSync();
  return <>{children}</>;
}

export function AppProviders({ children }: PropsWithChildren) {
  useEffect(() => {
    validateRequiredEnv();
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <SessionProvider>
            <SyncGate>{children}</SyncGate>
          </SessionProvider>
        </I18nProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
