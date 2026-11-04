"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { Camera, CircleCheck, ExternalLink, ImagePlus, LoaderCircle, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Card } from "@/components/ui/misc";
import { Avatar } from "@/components/ui/avatar";
import { AVATAR_CROP, BANNER_CROP, ImageCropper } from "@/components/account/image-cropper";
import { SocialIcon } from "@/components/layout/social-icon";
import { useAuth } from "@/components/providers/auth-provider";
import { updateProfile } from "@/actions/profile";
import { buildPath, uploadSmall } from "@/lib/upload";
import { avatarUrl } from "@/lib/storage";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { SOCIAL_FIELDS, type SocialKey } from "@/lib/constants";
import type { Profile } from "@/lib/types";

// The chosen image is framed and re-encoded in the browser, so large photos are fine.
const MAX_SOURCE_IMAGE = 25 * 1024 * 1024;

export function ProfileForm({ profile }: { profile: Profile }) {
  const { refreshProfile, isSeller } = useAuth();
  const [form, setForm] = useState({
    username: profile.username,
    display_name: profile.display_name ?? "",
    producer_name: profile.producer_name ?? "",
    bio: profile.bio ?? "",
    location: profile.location ?? "",
  });
  const [socials, setSocials] = useState<Record<string, string>>(() => {
    const raw = (profile.social_links ?? {}) as Record<string, unknown>;
    return Object.fromEntries(SOCIAL_FIELDS.map((f) => [f.key, typeof raw[f.key] === "string" ? (raw[f.key] as string) : ""]));
  });
  const [avatarPath, setAvatarPath] = useState<string | null>(profile.avatar_path);
  const [bannerPath, setBannerPath] = useState<string | null>(profile.banner_path);
  const [uploading, setUploading] = useState<"avatar" | "banner" | null>(null);
  const [cropping, setCropping] = useState<{ kind: "avatar" | "banner"; file: File } | null>(null);
  const [usernameState, setUsernameState] = useState<"same" | "checking" | "available" | "taken" | "invalid" | "error">("same");
  const [pending, startTransition] = useTransition();
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const u = form.username.trim().toLowerCase();
    if (u === profile.username) return setUsernameState("same");
    if (!/^[a-z0-9_]{3,24}$/.test(u)) return setUsernameState("invalid");
    setUsernameState("checking");
    const t = setTimeout(async () => {
      const { data, error } = await getSupabaseBrowserClient().rpc("is_username_available", { p_username: u });
      if (error) {
        console.error("Username check failed:", error.message);
        return setUsernameState("error");
      }
      setUsernameState(data ? "available" : "taken");
    }, 350);
    return () => clearTimeout(t);
  }, [form.username, profile.username]);

  // Step 1: pick a file, then frame it in the cropper.
  const pickImage = (kind: "avatar" | "banner", file?: File | null) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) return void toast.error("Use a PNG, JPG, WEBP or GIF image.");
    if (file.size > MAX_SOURCE_IMAGE) return void toast.error("Images must be smaller than 25 MB.");
    setCropping({ kind, file });
  };

  // Step 2: upload the framed result.
  const uploadCropped = async (image: Blob) => {
    if (!cropping) return;
    const { kind } = cropping;
    const file = new File([image], `${kind}.jpg`, { type: "image/jpeg" });
    setUploading(kind);
    try {
      const path = await uploadSmall("avatars", buildPath(profile.id, "", kind, file), file);
      if (kind === "avatar") setAvatarPath(path);
      else setBannerPath(path);
      setCropping(null);
      toast.success(`${kind === "avatar" ? "Profile picture" : "Banner"} uploaded — remember to save.`);
    } catch (err) {
      toast.error("Upload failed", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setUploading(null);
    }
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (usernameState === "taken" || usernameState === "invalid") return void toast.error("Please choose a valid, available username.");
    if (usernameState === "error") return void toast.error("We couldn't check that username right now. Please try again in a moment.");
    startTransition(async () => {
      const res = await updateProfile({
        ...form,
        avatar_path: avatarPath,
        banner_path: bannerPath,
        social_links: socials,
      });
      if (!res.ok) return void toast.error("Couldn't save your profile", { description: res.error });
      toast.success("Profile saved");
      await refreshProfile();
    });
  };

  const name = form.producer_name || form.display_name || form.username;
  const bannerSrc = avatarUrl(bannerPath);

  return (
    <form onSubmit={save} className="space-y-6">
      <ImageCropper
        file={cropping?.file ?? null}
        preset={cropping?.kind === "banner" ? BANNER_CROP : AVATAR_CROP}
        onCancel={() => setCropping(null)}
        onConfirm={uploadCropped}
      />
      <Card className="overflow-hidden">
        <div className="relative h-40 bg-ink-800 md:h-48">
          {bannerSrc ? (
            <Image src={bannerSrc} alt="" fill sizes="1100px" className="object-cover" />
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(70%_120%_at_20%_0%,rgba(124,108,255,0.45),transparent_60%),radial-gradient(60%_100%_at_90%_100%,rgba(61,139,255,0.3),transparent_60%)]" />
          )}
          <div className="absolute right-4 top-4 flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => bannerInput.current?.click()} loading={uploading === "banner"}>
              <ImagePlus className="h-4 w-4" /> {bannerPath ? "Change banner" : "Add banner"}
            </Button>
            {bannerPath && (
              <Button type="button" variant="secondary" size="icon-sm" onClick={() => setBannerPath(null)} aria-label="Remove banner">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          <input ref={bannerInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => {
              pickImage("banner", e.target.files?.[0]);
              e.target.value = "";
            }} />
        </div>
        <div className="flex flex-col gap-4 px-6 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="-mt-12 flex items-end gap-4">
            <button type="button" onClick={() => avatarInput.current?.click()} className="group relative rounded-full" aria-label="Change profile picture">
              <Avatar path={avatarPath} name={name} size={104} className="ring-[5px] ring-ink-900" />
              <span className="absolute inset-0 grid place-items-center rounded-full bg-black/55 opacity-0 transition group-hover:opacity-100">
                {uploading === "avatar" ? <LoaderCircle className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
              </span>
            </button>
            <input ref={avatarInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => {
              pickImage("avatar", e.target.files?.[0]);
              e.target.value = "";
            }} />
            <div className="pb-1">
              <p className="font-display text-xl font-bold">{name}</p>
              <p className="text-sm text-ink-400">@{profile.username} · {profile.role === "admin" ? "Administrator" : profile.role === "seller" ? "Seller" : "Buyer"}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {avatarPath && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setAvatarPath(null)}>
                Remove photo
              </Button>
            )}
            <Link href={`/producers/${profile.username}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              View public page <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="mb-5 font-display text-lg font-bold">Identity</h2>
        <div className="grid gap-5 md:grid-cols-2">
          <Field
            label="Username"
            htmlFor="username"
            error={
              usernameState === "taken"
                ? "That username is taken."
                : usernameState === "invalid"
                  ? "3–24 characters: a–z, 0–9 and _"
                  : usernameState === "error"
                    ? "Couldn't check usernames right now. Please try again in a moment."
                    : null
            }
            hint="Your public URL handle."
          >
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-ink-400">@</span>
              <Input id="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, "") })} className="pl-8 pr-10" maxLength={24} />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
                {usernameState === "checking" && <LoaderCircle className="h-4 w-4 animate-spin text-ink-400" />}
                {usernameState === "available" && <CircleCheck className="h-4 w-4 text-success" />}
                {(usernameState === "taken" || usernameState === "invalid") && <XCircle className="h-4 w-4 text-danger" />}
              </span>
            </div>
          </Field>
          <Field label="Display name" htmlFor="display_name" optional>
            <Input id="display_name" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} maxLength={60} placeholder="How buyers see you" />
          </Field>
          <Field label="Producer name" htmlFor="producer_name" optional={!isSeller} hint="Shown on your beats and producer page.">
            <Input id="producer_name" value={form.producer_name} onChange={(e) => setForm({ ...form, producer_name: e.target.value })} maxLength={60} placeholder="e.g. Midnight Keys" />
          </Field>
          <Field label="Location" htmlFor="location" optional>
            <Input id="location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} maxLength={80} placeholder="Warsaw, PL" />
          </Field>
          <Field label="Biography" htmlFor="bio" className="md:col-span-2" hint={`${form.bio.length}/1200`}>
            <Textarea id="bio" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} maxLength={1200} rows={5} placeholder="Your sound, your credits, your story…" />
          </Field>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="mb-1 font-display text-lg font-bold">Social links</h2>
        <p className="mb-5 text-sm text-ink-400">Displayed on your public producer page.</p>
        <div className="grid gap-4 md:grid-cols-2">
          {SOCIAL_FIELDS.map((f) => (
            <Field key={f.key} label={<span className="flex items-center gap-2"><SocialIcon name={f.key as SocialKey} className="h-3.5 w-3.5 text-ink-300" /> {f.label}</span>} htmlFor={`social-${f.key}`}>
              <Input id={`social-${f.key}`} type="url" inputMode="url" value={socials[f.key] ?? ""} onChange={(e) => setSocials({ ...socials, [f.key]: e.target.value })} placeholder={f.placeholder} maxLength={300} />
            </Field>
          ))}
        </div>
      </Card>

      <div className="sticky bottom-28 z-20 flex justify-end md:bottom-32">
        <Button type="submit" size="lg" loading={pending} disabled={!!uploading} className="shadow-2xl">
          Save changes
        </Button>
      </div>
    </form>
  );
}
