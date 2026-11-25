"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Check, Search, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { chatName, type ChatProfile } from "@/lib/messages";
import { cn } from "@/lib/utils";

const COLUMNS = "id, username, display_name, producer_name, avatar_path, is_verified";

/** Finds people by name or username (at least two letters). */
export function usePeopleSearch(query: string, me: string | null) {
  const [results, setResults] = useState<ChatProfile[] | null>(null);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    // Characters that would break the search filter are left out.
    const term = query.replace(/[,()*%\\"]/g, " ").trim();
    if (term.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      const like = `%${term}%`;
      let request = getSupabaseBrowserClient()
        .from("profiles")
        .select(COLUMNS)
        .or(`username.ilike.${like},display_name.ilike.${like},producer_name.ilike.${like}`)
        .limit(12);
      if (me) request = request.neq("id", me);
      const { data } = await request;
      if (cancelled) return;
      setResults((data ?? []) as ChatProfile[]);
      setSearching(false);
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, me]);
  return { results, searching };
}

/** Pick several people: search by name, tap to add or remove, chips for who's picked. */
export function PeoplePicker({
  me,
  selected,
  onChange,
  exclude = [],
  suggestions = [],
  max = 49,
}: {
  me: string | null;
  selected: ChatProfile[];
  onChange: (people: ChatProfile[]) => void;
  /** Already in the group: not offered. */
  exclude?: string[];
  /** Shown before anything is typed (people you've talked to). */
  suggestions?: ChatProfile[];
  max?: number;
}) {
  const [query, setQuery] = useState("");
  const { results, searching } = usePeopleSearch(query, me);
  const list = (results ?? suggestions).filter((p) => p.id !== me && !exclude.includes(p.id));
  const picked = new Set(selected.map((p) => p.id));

  const toggle = (person: ChatProfile) => {
    if (picked.has(person.id)) onChange(selected.filter((p) => p.id !== person.id));
    else if (selected.length < max) onChange([...selected, person]);
  };

  return (
    <div>
      {selected.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-1.5" aria-label="Picked">
          {selected.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => toggle(p)}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.08] py-1 pl-1 pr-2.5 text-xs font-medium transition hover:bg-white/[0.14]"
                aria-label={`Remove ${chatName(p)}`}
              >
                <Avatar path={p.avatar_path} name={chatName(p)} size={22} />
                {chatName(p)}
                <X className="h-3 w-3 text-ink-300" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people by name or username"
          aria-label="Search people"
          className="pl-10"
        />
      </div>
      <div className="mt-2 max-h-64 overflow-y-auto">
        {searching && !results ? (
          <div className="space-y-2 p-2" aria-hidden>
            <Skeleton className="h-9 rounded-xl" />
            <Skeleton className="h-9 rounded-xl" />
          </div>
        ) : list.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-ink-400">
            {results ? "Nobody found with that name." : "Type a name or username to find people."}
          </p>
        ) : (
          <ul aria-label={results ? "People found" : "Suggested"}>
            {list.map((p) => {
              const on = picked.has(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => toggle(p)}
                    aria-pressed={on}
                    className={cn("flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition", on ? "bg-white/[0.07]" : "hover:bg-white/[0.04]")}
                  >
                    <Avatar path={p.avatar_path} name={chatName(p)} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 truncate text-sm font-medium">
                        <span className="truncate">{chatName(p)}</span>
                        {p.is_verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-accent-400" aria-label="Verified" />}
                      </span>
                      <span className="block truncate text-xs text-ink-400">@{p.username}</span>
                    </span>
                    <span
                      className={cn(
                        "grid h-5 w-5 shrink-0 place-items-center rounded-full border transition",
                        on ? "border-white bg-white text-ink-950" : "border-white/25",
                      )}
                      aria-hidden
                    >
                      {on && <Check className="h-3 w-3" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
