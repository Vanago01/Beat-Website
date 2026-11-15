"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

/** Follows or unfollows a producer. Follower counts on public pages refresh straight away. */
export async function setFollow(profileId: string, follow: boolean): Promise<ActionResult<{ following: boolean }>> {
  if (!z.uuid().safeParse(profileId).success) return { ok: false, error: "Invalid profile" };
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims?.sub;
  if (!me) return { ok: false, error: "Sign in to follow producers." };
  if (me === profileId) return { ok: false, error: "You can't follow yourself." };

  const { error } = follow
    ? await supabase.from("follows").insert({ follower_id: me, followee_id: profileId })
    : await supabase.from("follows").delete().eq("follower_id", me).eq("followee_id", profileId);
  if (error && !(follow && error.code === "23505")) {
    if (/could not find the (table|function)|schema cache|does not exist/i.test(error.message))
      return { ok: false, error: "Following isn't set up yet: the site's database still needs update 13." };
    if (/row-level security|permission denied/i.test(error.message)) return { ok: false, error: "You can only follow producers." };
    return { ok: false, error: error.message };
  }

  const { data: p } = await supabase.from("profiles").select("username").eq("id", profileId).maybeSingle();
  updateTag("producers");
  if (p?.username) updateTag(`producer:${p.username}`);
  return { ok: true, data: { following: follow } };
}
