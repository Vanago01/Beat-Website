"use client";

import { create } from "zustand";
import { toast } from "sonner";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

interface FavoritesState {
  ids: Set<string>;
  userId: string | null;
  loaded: boolean;
  load: (userId: string | null) => Promise<void>;
  toggle: (beatId: string) => Promise<boolean | null>;
}

export const useFavorites = create<FavoritesState>((set, get) => ({
  ids: new Set(),
  userId: null,
  loaded: false,
  load: async (userId) => {
    if (!userId) return set({ ids: new Set(), userId: null, loaded: true });
    if (get().userId === userId && get().loaded) return;
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.from("favorites").select("beat_id").eq("user_id", userId).limit(2000);
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
