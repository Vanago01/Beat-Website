"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Card } from "@/components/ui/misc";
import { Switch } from "@/components/ui/controls";
import { deleteGenre, updatePlatformSettings, upsertGenre } from "@/actions/admin";
import type { PlatformSettings } from "@/lib/types";

export function PlatformSettingsForm({ settings }: { settings: PlatformSettings }) {
  const router = useRouter();
  const [fee, setFee] = useState(String(settings.platform_fee_percent));
  const [rate, setRate] = useState(String(settings.eur_to_pln));
  const [approval, setApproval] = useState(settings.require_beat_approval);
  const [signups, setSignups] = useState(settings.seller_signups_open);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const res = await updatePlatformSettings({
        platform_fee_percent: Number(fee),
        eur_to_pln: Number(rate),
        require_beat_approval: approval,
        seller_signups_open: signups,
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Settings saved");
      router.refresh();
    });

  return (
    <Card className="p-6">
      <h2 className="font-display text-lg font-bold">Marketplace</h2>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Field label="Platform fee (%)" htmlFor="fee" hint="Taken from each seller sale. Your own beats are fee-free.">
          <Input id="fee" type="number" min={0} max={100} step={0.5} value={fee} onChange={(e) => setFee(e.target.value)} />
        </Field>
        <Field label="EUR → PLN suggestion rate" htmlFor="rate" hint="Used to pre-fill PLN prices in the upload form.">
          <Input id="rate" type="number" min={0.1} step={0.01} value={rate} onChange={(e) => setRate(e.target.value)} />
        </Field>
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-white/[0.07] p-4">
          <span>
            <span className="block text-sm font-semibold">Require approval for new beats</span>
            <span className="block text-xs text-ink-400">Seller uploads wait in the review queue until you approve them.</span>
          </span>
          <Switch checked={approval} onChange={setApproval} label="Require beat approval" />
        </label>
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-white/[0.07] p-4">
          <span>
            <span className="block text-sm font-semibold">Seller registrations open</span>
            <span className="block text-xs text-ink-400">Allow buyers to activate seller profiles.</span>
          </span>
          <Switch checked={signups} onChange={setSignups} label="Seller signups open" />
        </label>
      </div>
      <Button className="mt-6" onClick={save} loading={pending}>
        Save settings
      </Button>
    </Card>
  );
}

export function GenresManager({ genres }: { genres: { slug: string; name: string; sort_order: number }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState({ name: "", slug: "" });
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(genres.map((g) => [g.slug, g.name])));

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string, onSuccess?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error ?? "Failed");
      toast.success(msg);
      onSuccess?.();
      router.refresh();
    });

  const autoSlug = (name: string) => name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, "n").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return (
    <Card className="p-6">
      <h2 className="font-display text-lg font-bold">Genres</h2>
      <p className="mt-1 text-sm text-ink-400">Shown in filters, uploads and on the homepage. Genres in use can&apos;t be deleted.</p>
      <ul className="mt-5 space-y-2">
        {genres.map((g, i) => (
          <li key={g.slug} className="flex items-center gap-2">
            <span className="w-6 text-right font-mono text-xs text-ink-500">{i + 1}</span>
            <Input value={names[g.slug] ?? g.name} onChange={(e) => setNames({ ...names, [g.slug]: e.target.value })} className="h-10 max-w-xs" aria-label={`Name for ${g.slug}`} />
            <span className="font-mono text-xs text-ink-400">{g.slug}</span>
            <div className="ml-auto flex gap-1.5">
              {names[g.slug] !== g.name && (
                <Button size="xs" onClick={() => run(() => upsertGenre({ slug: g.slug, name: names[g.slug], sort_order: g.sort_order }), "Genre renamed")} disabled={pending}>
                  Save
                </Button>
              )}
              <Button size="icon-xs" variant="ghost" onClick={() => run(() => deleteGenre(g.slug), "Genre deleted")} disabled={pending} aria-label={`Delete ${g.name}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex flex-col gap-2 border-t border-white/[0.06] pt-5 sm:flex-row">
        <Input value={draft.name} onChange={(e) => setDraft({ name: e.target.value, slug: autoSlug(e.target.value) })} placeholder="New genre, e.g. Phonk" className="h-10 sm:max-w-xs" aria-label="New genre name" />
        <Input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} placeholder="slug" className="h-10 font-mono sm:max-w-[12rem]" aria-label="New genre slug" />
        <Button
          size="sm"
          className="h-10"
          disabled={!draft.name || !draft.slug || pending}
          onClick={() => run(() => upsertGenre({ ...draft, sort_order: genres.length + 1 }), "Genre added", () => setDraft({ name: "", slug: "" }))}
        >
          <Plus className="h-4 w-4" /> Add genre
        </Button>
      </div>
    </Card>
  );
}
