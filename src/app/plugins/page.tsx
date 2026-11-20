import type { Metadata } from "next";
import { PackagePlus } from "lucide-react";
import { PLUGIN_LIST } from "@/lib/plugin-catalog";
import { PluginCard } from "@/components/plugins/plugin-card";

export const metadata: Metadata = {
  title: "Plugins",
  description: "Plug-ins for producers: effects for your DAW, for Windows and Mac. See what each one does, what it costs and how to get it.",
};

export default function PluginsPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-10 pt-8 sm:px-6 md:pt-12 lg:px-8">
      <header className="mb-10 flex flex-col gap-3 md:mb-12">
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent-300">Tools for producers</p>
        <h1 className="font-display text-5xl font-extrabold tracking-[-0.045em] md:text-7xl">Plugins</h1>
        <p className="max-w-xl text-ink-300">Effects for your DAW, for Windows and Mac. Open one to see what it does and how to get it.</p>
      </header>

      <div className="grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {PLUGIN_LIST.map((plugin, i) => (
          <PluginCard key={plugin.slug} plugin={plugin} eager={i < 3} />
        ))}
        <div className="grid aspect-video place-items-center rounded-2xl border border-dashed border-white/[0.12] p-6 text-center">
          <div>
            <PackagePlus className="mx-auto h-6 w-6 text-ink-400" aria-hidden />
            <p className="mt-3 font-display text-lg font-bold text-ink-100">More plugins on the way</p>
            <p className="mt-1 text-sm text-ink-400">New ones will show up here.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
