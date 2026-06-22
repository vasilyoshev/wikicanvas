import { createContext, type PropsWithChildren, useContext, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";

import { hasSupabaseConfig } from "@/src/lib/env";
import { initializeSupabaseAutoRefresh, supabase } from "@/src/lib/supabase";
import { getActiveUserId, subscribeActiveUserId } from "@/src/lib/active-user";

type SessionStatus = "loading" | "ready";

interface SessionContextValue {
  hasSupabaseConfig: boolean;
  session: Session | null;
  status: SessionStatus;
  user: User | null;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");
  // E2E / test seam: tracks fake user id injected by runSyncSignIn when real OAuth isn't used.
  const [fakeUserId, setFakeUserId] = useState<string | null>(getActiveUserId);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!supabase) {
      setStatus("ready");
      return;
    }

    initializeSupabaseAutoRefresh();

    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) {
          return;
        }

        setSession(data.session);
        setStatus("ready");
      })
      .catch(() => {
        if (mounted) setStatus("ready");
      });

    const authSubscription = supabase.auth.onAuthStateChange((event, nextSession) => {
      // Clear cached remote data on sign-out so the previous user's synced sessions
      // never linger in the in-memory QueryClient (matters most on native, which has
      // no full page reload). Local anonymous data in LocalStore is untouched.
      if (event === "SIGNED_OUT") {
        queryClient.clear();
      }

      setSession(nextSession);
      setStatus("ready");
    });

    return () => {
      mounted = false;
      authSubscription.data.subscription.unsubscribe();
    };
  }, [queryClient]);

  // Subscribe to the active-user signal so the e2e fake-user path updates the context.
  useEffect(() => subscribeActiveUserId(setFakeUserId), []);

  // Real Supabase user takes precedence; fake user is the fallback for e2e / no-Supabase paths.
  const resolvedUser: User | null =
    session?.user ?? (fakeUserId ? ({ id: fakeUserId } as User) : null);

  const value: SessionContextValue = {
    hasSupabaseConfig,
    session,
    status,
    user: resolvedUser,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used inside SessionProvider.");
  }

  return context;
}
