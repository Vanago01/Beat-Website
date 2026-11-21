"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";
import type { Profile } from "@/lib/types";
import { useFavorites } from "@/stores/favorites";

interface AuthUser {
  id: string;
  email: string | null;
}

interface AuthState {
  user: AuthUser | null;
  profile: Profile | null;
  loading: boolean;
  /**
   * Goes up when the signed-in session is upgraded without a new sign-in (the
   * two-factor code was accepted), so live connections reconnect with it.
   */
  sessionVersion: number;
}

/**
 * Auth state lives in an external store rather than React context: context
 * updates during hydration would force still-streaming Suspense boundaries to
 * re-render on the client and discard their server HTML.
 */
const useAuthStore = create<AuthState>(() => ({ user: null, profile: null, loading: true, sessionVersion: 0 }));

async function fetchProfile(userId: string | null) {
  if (!userId) return null;
  const { data } = await getSupabaseBrowserClient().from("profiles").select("*").eq("id", userId).maybeSingle();
  return data ?? null;
}

function AuthBootstrap() {
  const router = useRouter();
  const lastUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      useAuthStore.setState({ loading: false });
      return;
    }
    const supabase = getSupabaseBrowserClient();
    let active = true;

    const apply = async (next: AuthUser | null) => {
      if (!active) return;
      const changed = next?.id !== lastUserId.current;
      lastUserId.current = next?.id ?? null;
      if (changed || !next) {
        const [profile] = await Promise.all([fetchProfile(next?.id ?? null), useFavorites.getState().load(next?.id ?? null)]);
        if (!active) return;
        useAuthStore.setState({ user: next, profile, loading: false });
      } else {
        useAuthStore.setState({ user: next, loading: false });
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      apply(u ? { id: u.id, email: u.email ?? null } : null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user;
      const next = u ? { id: u.id, email: u.email ?? null } : null;
      if (event === "MFA_CHALLENGE_VERIFIED") {
        // The two-factor code upgraded the sign-in. Supabase only hands a new
        // token to its live connection on sign-in and refresh, so without this
        // live messages, the unread badge and "typing…" would keep the
        // password-only sign-in (and see nothing) until the page is reloaded.
        setTimeout(() => {
          void supabase.realtime
            .setAuth()
            .catch(() => {})
            .then(() => useAuthStore.setState((s) => ({ sessionVersion: s.sessionVersion + 1 })));
        }, 0);
        return;
      }
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        // Defer: Supabase recommends not awaiting other calls inside the callback.
        setTimeout(() => {
          const previous = lastUserId.current;
          apply(next);
          // Re-render server components only on real login/logout transitions.
          if (event !== "USER_UPDATED" && previous !== undefined && previous !== (next?.id ?? null)) router.refresh();
        }, 0);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <>
      <AuthBootstrap />
      {children}
    </>
  );
}

export function useAuth() {
  const router = useRouter();
  const { user, profile, loading, sessionVersion } = useAuthStore(
    useShallow((s) => ({ user: s.user, profile: s.profile, loading: s.loading, sessionVersion: s.sessionVersion })),
  );

  const refreshProfile = useCallback(async () => {
    const id = useAuthStore.getState().user?.id ?? null;
    useAuthStore.setState({ profile: await fetchProfile(id) });
  }, []);

  const signOut = useCallback(async () => {
    await getSupabaseBrowserClient().auth.signOut();
    useAuthStore.setState({ user: null, profile: null, loading: false });
    useFavorites.getState().load(null);
    router.push("/");
    router.refresh();
  }, [router]);

  return {
    user,
    profile,
    loading,
    sessionVersion,
    isSeller: profile?.role === "seller" || profile?.role === "admin",
    isAdmin: profile?.role === "admin",
    refreshProfile,
    signOut,
  };
}
