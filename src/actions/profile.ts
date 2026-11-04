"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SOCIAL_FIELDS } from "@/lib/constants";
import type { ActionResult } from "@/lib/types";

const socialKeys = SOCIAL_FIELDS.map((f) => f.key) as [string, ...string[]];

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const profileSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,24}$/, "Usernames are 3–24 characters: lowercase letters, numbers and underscores."),
  display_name: optionalText(60),
  producer_name: optionalText(60),
  bio: optionalText(1200),
  location: optionalText(80),
  avatar_path: z.string().max(512).nullable().optional(),
  banner_path: z.string().max(512).nullable().optional(),
  social_links: z
    .record(
      z.enum(socialKeys),
      z
        .string()
        .trim()
        .max(300)
        .refine((v) => v === "" || /^https?:\/\/[^\s]+$/i.test(v), "Social links must start with https://"),
    )
    .optional(),
});

export type ProfileInput = z.input<typeof profileSchema>;

export async function updateProfile(input: ProfileInput): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };

  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, error: "Your session expired — please sign in again." };

  const v = parsed.data;
  for (const p of [v.avatar_path, v.banner_path]) {
    if (p && !p.startsWith(`${userId}/`)) return { ok: false, error: "Invalid image upload." };
  }

  const { data: before } = await supabase.from("profiles").select("username").eq("id", userId).single();

  const social_links = Object.fromEntries(Object.entries(v.social_links ?? {}).filter(([, url]) => url));
  const { error } = await supabase
    .from("profiles")
    .update({
      username: v.username,
      display_name: v.display_name ?? null,
      producer_name: v.producer_name ?? null,
      bio: v.bio ?? null,
      location: v.location ?? null,
      avatar_path: v.avatar_path ?? null,
      banner_path: v.banner_path ?? null,
      social_links,
    })
    .eq("id", userId);

  if (error) {
    if (/profiles_username_key|duplicate key/i.test(error.message)) return { ok: false, error: "That username is already taken." };
    return { ok: false, error: error.message };
  }

  updateTag("producers");
  updateTag("beats");
  updateTag(`producer:${v.username}`);
  if (before?.username && before.username !== v.username) updateTag(`producer:${before.username}`);
  return { ok: true };
}
