import type { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";
import { AudioWaveform, Blocks, LibraryBig, Orbit, ScanEye, Spline } from "lucide-react";
import { getPluginDownloads, PLUGINS } from "@/lib/plugins";
import { PluginDownload } from "@/components/plugins/plugin-download";
import { Skeleton } from "@/components/ui/misc";

const plugin = PLUGINS.dlay;

export const metadata: Metadata = {
  title: "DLAY - free delay plug-in (VST3, Audio Unit)",
  description:
    "DLAY is a creative delay plug-in with 21 algorithms, modulation you draw yourself and a live picture of every echo. Free for members, for Windows and Mac.",
  openGraph: {
    title: "DLAY - free delay plug-in",
    description: "21 delay algorithms, drawable modulation and a live picture of every echo. Free for members.",
    images: [{ url: "/plugins/dlay/share.jpg", width: 1200, height: 675, alt: "The DLAY plug-in" }],
  },
};

const STATS = [
  { k: "21", v: "delay algorithms" },
  { k: "239", v: "presets, 15 categories" },
  { k: "Free", v: "for every member" },
];

const FEATURES = [
  {
    icon: Blocks,
    title: "21 algorithms, one set of controls",
    body: "Clean digital, ping-pong and multi-tap. Tape, bucket-brigade and lo-fi. Reverse, granular, spectral, glitch and shimmer.",
  },
  {
    icon: Spline,
    title: "MOTION: draw your modulation",
    body: "Six lanes for speed, pan, feedback, filter, pitch and mix. Pick an LFO shape or draw the curve with the mouse.",
  },
  {
    icon: Orbit,
    title: "Time Warp and Echo Orbit",
    body: "Bend the tape speed with pitch glides, send the echoes travelling around the stereo field, freeze them or let them ring for ever.",
  },
  {
    icon: ScanEye,
    title: "See every echo",
    body: "The display is the real tape: where the sound is recorded, where each echo is read and how it feeds back. Drag it to change time and feedback.",
  },
  {
    icon: LibraryBig,
    title: "239 presets",
    body: "From vocal throws to cinematic washes, in fifteen categories with search and favourites. Save your own next to them.",
  },
  {
    icon: AudioWaveform,
    title: "Made for sessions",
    body: "Resizable window, undo and redo, a description on every control, full automation, and a limiter that keeps runaway feedback away from your speakers.",
  },
];

const GALLERY = [
  { src: "/plugins/dlay/space.webp", alt: "The SPACE page of DLAY", caption: "SPACE: orbit, ghosts and the stereo field" },
  { src: "/plugins/dlay/motion.webp", alt: "The MOTION page of DLAY", caption: "MOTION: six lanes of modulation" },
  { src: "/plugins/dlay/presets.webp", alt: "The preset library of DLAY", caption: "The preset library" },
];

const INSTALL = [
  {
    system: "Windows",
    needs: "Windows 10 or later, 64-bit",
    steps: [
      "Your browser may warn that the file is not commonly downloaded. Choose to keep it: in Chrome the button reads “Download suspicious file”, in Edge open the three-dot menu beside the file and choose Keep.",
      "Unzip the download and run the Setup file inside.",
      "Windows may show “Windows protected your PC”. Click More info, then Run anyway.",
      "Open your DAW and let it look for new plug-ins. In FL Studio: OPTIONS > Manage plugins > Find installed plugins.",
    ],
  },
  {
    system: "Mac",
    needs: "macOS 11 or later, Apple Silicon and Intel",
    steps: [
      "If your browser warns that the file is not commonly downloaded, choose to keep it.",
      "Unzip the download and open the .pkg file inside.",
      "macOS says it could not verify the package. Open System Settings > Privacy & Security, scroll down and click Open Anyway.",
      "Open your DAW. Logic and GarageBand use the Audio Unit, Ableton Live and FL Studio the VST3.",
    ],
  },
];

function Screenshot({ src, alt, priority = false, sizes }: { src: string; alt: string; priority?: boolean; sizes: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-900 shadow-[0_40px_120px_-50px_color-mix(in_oklab,var(--color-accent)_70%,transparent)] md:rounded-3xl">
      <Image src={src} alt={alt} width={1920} height={1080} sizes={sizes} priority={priority} className="h-auto w-full" />
    </div>
  );
}

export default async function DlayPage() {
  const files = await getPluginDownloads("dlay");

  return (
    <div className="relative isolate overflow-hidden">
      <div
        className="absolute inset-x-0 top-0 -z-10 h-[760px] opacity-60 [background:radial-gradient(50%_60%_at_72%_8%,color-mix(in_oklab,var(--color-accent)_38%,transparent),transparent_70%)]"
        aria-hidden
      />

      <div className="mx-auto grid max-w-[1400px] gap-12 px-4 pb-4 pt-10 sm:px-6 md:pt-16 lg:grid-cols-[1.2fr_0.8fr] lg:gap-14 lg:px-8">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent-300">Free plug-in · VST3 · Audio Unit</p>
          <h1 className="mt-4 font-display text-[clamp(3rem,8vw,6.5rem)] font-extrabold leading-[0.9] tracking-[-0.05em]">
            DLAY.
            <br />
            <span className="text-accent-gradient">Bend time.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-200">
            A creative delay for producers: 21 algorithms from clean digital to tape, granular and shimmer, modulation you draw yourself,
            and a live picture of every echo.
          </p>
          <dl className="mt-10 grid max-w-xl grid-cols-3 gap-4">
            {STATS.map((s) => (
              <div key={s.v} className="glass rounded-2xl p-4">
                <dt className="text-3xl font-semibold tracking-[-0.03em]">{s.k}</dt>
                <dd className="mt-1 text-xs text-ink-300">{s.v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <aside className="lg:pt-6" aria-labelledby="download-heading">
          <div className="glass-strong rounded-3xl p-6 sm:p-8">
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent-300">Members only</p>
            <h2 id="download-heading" className="mt-3 font-display text-3xl font-extrabold tracking-[-0.03em]">
              Free download
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-300">
              DLAY is free for everyone with an account. Signing up takes a minute and costs nothing.
            </p>
            <div className="mt-6">
              <Suspense
                fallback={
                  <div className="grid gap-3" aria-busy>
                    <Skeleton className="h-14 rounded-full" />
                    <Skeleton className="h-14 rounded-full" />
                  </div>
                }
              >
                <PluginDownload plugin="dlay" files={files} />
              </Suspense>
            </div>
            <ul className="mt-6 space-y-1.5 border-t border-white/[0.07] pt-5 text-xs leading-relaxed text-ink-400">
              <li>Windows 10 or later, 64-bit</li>
              <li>macOS 11 or later, Apple Silicon and Intel</li>
              <li>VST3, Audio Unit and a standalone app</li>
            </ul>
          </div>
        </aside>
      </div>

      <section className="mx-auto mt-12 max-w-[1400px] px-4 sm:px-6 lg:px-8" aria-label="DLAY">
        <Screenshot src="/plugins/dlay/time.webp" alt="DLAY: the engine, the echo display and the TIME page" priority sizes="(min-width: 1400px) 1336px, 100vw" />
      </section>

      <section className="mx-auto mt-20 max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent-300">What is inside</p>
        <h2 className="mt-3 max-w-2xl font-display text-3xl font-extrabold tracking-[-0.03em] md:text-5xl">One delay for every kind of echo.</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="glass rounded-3xl p-6">
              <f.icon className="h-6 w-6 text-accent-300" aria-hidden />
              <p className="mt-4 font-display text-lg font-bold">{f.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-300">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-[1400px] px-4 sm:px-6 lg:px-8" aria-label="More of DLAY">
        <div className="grid gap-6 md:grid-cols-3">
          {GALLERY.map((shot) => (
            <figure key={shot.src}>
              <Screenshot src={shot.src} alt={shot.alt} sizes="(min-width: 768px) 33vw, 100vw" />
              <figcaption className="mt-3 text-sm text-ink-300">{shot.caption}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent-300">After the download</p>
        <h2 className="mt-3 font-display text-3xl font-extrabold tracking-[-0.03em] md:text-5xl">How to install it.</h2>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-ink-300">
          {plugin.name} is new and is not signed with a paid certificate. Because of that your browser and your system each ask once
          whether you really want it. That is expected for a new program - the steps show what to click.
        </p>
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {INSTALL.map((guide) => (
            <div key={guide.system} className="glass rounded-3xl p-6 sm:p-8">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="font-display text-2xl font-bold">{guide.system}</h3>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-400">{guide.needs}</p>
              </div>
              <ol className="mt-5 grid gap-4">
                {guide.steps.map((step, i) => (
                  <li key={step} className="grid grid-cols-[2rem_1fr] gap-3 border-t border-white/10 pt-4">
                    <span className="font-mono text-xs text-accent-300">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-sm leading-relaxed text-ink-200">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
        <p className="mt-8 max-w-3xl text-sm leading-relaxed text-ink-400">
          {plugin.name} is free software under the GNU Affero General Public License, version 3. Using it places no conditions on the music you
          make with it. The source code is on{" "}
          <a href={plugin.sourceUrl} target="_blank" rel="noreferrer" className="text-ink-200 underline underline-offset-4 hover:text-white">
            GitHub
          </a>
          .
        </p>
      </section>
    </div>
  );
}
