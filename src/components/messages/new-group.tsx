"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, UsersRound, X } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { chatName, listNames, type ChatProfile } from "@/lib/messages";
import { errorMessage } from "@/lib/utils";
import { refreshInbox, useMessages } from "@/stores/messages";
import { PeoplePicker } from "./people-picker";
import { GroupPhotoPicker } from "./group-photo-picker";

/** A name made from the first people picked: "Anna, Ben and Cara" (or "… and 3 more"). */
export function defaultGroupName(people: ChatProfile[]) {
  const names = people.map((p) => chatName(p).split(" ")[0]);
  const name = names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : listNames(names);
  return name.slice(0, 60);
}

/** "New group" in the inbox: pick at least two people, a name and (if you like) a picture. */
export function NewGroupButton({ me }: { me: string }) {
  const router = useRouter();
  const inbox = useMessages((s) => s.inbox);
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<ChatProfile[]>([]);
  const [title, setTitle] = useState("");
  const [photo, setPhoto] = useState<{ path: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // People you've talked to one to one, as suggestions.
  const suggestions = useMemo(
    () => (inbox ?? []).filter((c) => !c.is_group && c.other).map((c) => c.other as ChatProfile).slice(0, 8),
    [inbox],
  );

  const reset = () => {
    setPeople([]);
    setTitle("");
    setPhoto(null);
  };

  const create = async () => {
    if (people.length < 2) return void toast.error("Pick at least two people for a group");
    setBusy(true);
    const { data, error } = await getSupabaseBrowserClient().rpc("create_group", {
      p_title: title.trim() || defaultGroupName(people),
      p_members: people.map((p) => p.id),
      p_photo_path: photo?.path ?? undefined,
    });
    setBusy(false);
    if (error || !data) return void toast.error("Couldn't make the group", { description: errorMessage(error) });
    setOpen(false);
    reset();
    void refreshInbox();
    router.push(`/messages/${data}`);
  };

  return (
    <>
      <Button variant="secondary" size="xs" onClick={() => setOpen(true)} aria-label="New group chat">
        <UsersRound className="h-3.5 w-3.5" /> New group
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New group"
        description="Pick at least two people. Everyone in the group can see its messages, rename it and add people."
        footer={
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-ink-400">{people.length ? `${people.length + 1} people with you` : ""}</span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={create} loading={busy} disabled={people.length < 2}>
                Create group
              </Button>
            </div>
          </div>
        }
      >
        <div className="mb-5 flex items-center gap-4">
          <GroupPhotoPicker me={me} onUploaded={(path, url) => setPhoto({ path, url })}>
            {(choose, uploading) => (
              <div className="relative">
                <button
                  type="button"
                  onClick={choose}
                  disabled={uploading}
                  className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border border-dashed border-white/20 bg-white/[0.04] text-ink-300 transition hover:border-white/40 hover:text-white"
                  aria-label={photo ? "Change the group picture" : "Add a group picture"}
                >
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo.url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Camera className="h-5 w-5" />
                  )}
                </button>
                {photo && (
                  <button
                    type="button"
                    onClick={() => setPhoto(null)}
                    className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-ink-800 text-ink-200 ring-2 ring-ink-900 hover:text-white"
                    aria-label="Remove the picture"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
          </GroupPhotoPicker>
          <Field label="Group name" htmlFor="group-name" className="flex-1">
            <Input
              id="group-name"
              value={title}
              maxLength={60}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={people.length ? defaultGroupName(people) : "e.g. Studio crew"}
            />
          </Field>
        </div>
        <PeoplePicker me={me} selected={people} onChange={setPeople} suggestions={suggestions} />
      </Modal>
    </>
  );
}
