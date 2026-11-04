"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 py-20 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-danger">Something broke</p>
      <h1 className="mt-4 font-display text-5xl font-extrabold tracking-[-0.04em]">Signal lost.</h1>
      <p className="mt-4 text-ink-300">An unexpected error occurred. Please try again — if it keeps happening, contact support.</p>
      {error.digest && <p className="mt-2 font-mono text-xs text-ink-500">Ref: {error.digest}</p>}
      <Button className="mt-8" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
