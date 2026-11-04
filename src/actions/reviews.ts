"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const reviewSchema = z.object({
  beatId: z.uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

export async function submitReview(input: z.input<typeof reviewSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please choose a rating between 1 and 5." };
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, error: "Please sign in to leave a review." };

  const { beatId, rating, comment } = parsed.data;
  const { data: existing } = await supabase.from("reviews").select("id").eq("beat_id", beatId).eq("user_id", userId).maybeSingle();

  const result = existing
    ? await supabase.from("reviews").update({ rating, comment: comment || null }).eq("id", existing.id).select("id").single()
    : await supabase.from("reviews").insert({ beat_id: beatId, user_id: userId, rating, comment: comment || null }).select("id").single();

  if (result.error) {
    const msg = /row-level security/i.test(result.error.message)
      ? "Only verified buyers of this beat can leave a review."
      : result.error.message;
    return { ok: false, error: msg };
  }
  updateTag(`reviews:${beatId}`);
  updateTag("beats");
  return { ok: true, data: { id: result.data.id } };
}

export async function deleteReview(reviewId: string, beatId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(reviewId).success) return { ok: false, error: "Invalid review" };
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase.from("reviews").delete({ count: "exact" }).eq("id", reviewId);
  if (error) return { ok: false, error: error.message };
  if (!count) return { ok: false, error: "You can't delete this review." };
  updateTag(`reviews:${beatId}`);
  updateTag("beats");
  return { ok: true };
}
