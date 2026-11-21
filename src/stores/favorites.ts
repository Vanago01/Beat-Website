"use client";

import { create } from "zustand";
import { toast } from "sonner";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

interface FavoritesState {
  ids: Set<string>;
  userId: string | null;
  loaded: boolean;
  /** Loads the signed-in person's favorites; `force` loads them again even if already loaded. */
  load: (userId: string | null, force?: boolean) => Promise<void>;
  toggle: (beatId: string) => Promise<boolean | null>;
}

// Only the newest load counts (one started before the two-factor code may finish after a reload).
let loads = 0;

export const useFavorites = create<FavoritesState>((set, get) => ({
  ids: new Set(),
  userId: null,
  loaded: false,
  load: async (userId, force = false) => {
    if (!userId) {
      loads += 1;
      return set({ ids: new Set(), userId: null, loaded: true });
    }
    if (!force && get().userId === userId && get().loaded) return;
    const ticket = ++loads;
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.from("favorites").select("beat_id").eq("user_id", userId).limit(2000);
    if (ticket !== loads) return;
    if (error) return set({ userId, loaded: true });
    set({ ids: new Set((data ?? []).map((f) => f.beat_id)), userId, loaded: true });
  },
  /** Returns the new state (true = favorited), or null if the user must sign in. */
  toggle: async (beatId) => {
    const { userId, ids } = get();
    if (!userId) return null;
    const supabase = getSupabaseBrowserClient();
    const was = ids.has(beatId);
    const optimistic = new Set(ids);
    if (was) optimistic.delete(beatId);
    else optimistic.add(beatId);
    set({ ids: optimistic });

    const { error } = was
      ? await supabase.from("favorites").delete().eq("user_id", userId).eq("beat_id", beatId)
      : await supabase.from("favorites").insert({ user_id: userId, beat_id: beatId });

    if (error && !/duplicate key/i.test(error.message)) {
      const rollback = new Set(get().ids);
      if (was) rollback.add(beatId);
      else rollback.delete(beatId);
      set({ ids: rollback });
      toast.error("Couldn't update favorites", { description: error.message });
      return was;
    }
    return !was;
  },
}));
