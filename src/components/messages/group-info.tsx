"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Camera, LogOut, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/overlay";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { chatName, type ChatProfile, type ConversationDetail } from "@/lib/messages";
import { errorMessage } from "@/lib/utils";
import { refreshInbox } from "@/stores/messages";
import { GroupAvatar } from "./group-avatar";
import { GroupPhotoPicker } from "./group-photo-picker";
import { PeoplePicker } from "./people-picker";

/**
 * A group's settings: picture and name (anyone in it can change them), who's
 * in it (whoever runs it can take people out), adding people, and leaving.
 */
export function GroupInfoDialog({
  open,
  onClose,
  detail,
  me,
  onChanged,
  onLeft,
}: {
  open: boolean;
  onClose: () => void;
  detail: ConversationDetail;
  me: string;
  onChanged: () => void | Promise<void>;
  onLeft: () => void;
}) {
  const members = detail.members ?? [];
  const runsIt = detail.created_by === me;
  const [title, setTitle] = useState(detail.title ?? "");
  const [adding, setAdding] = useState<ChatProfile[] | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(detail.title ?? "");
      setAdding(null);
      setConfirmRemove(null);
      setConfirmLeave(false);
    }
  }, [open, detail.title]);

  const run = async (key: string, call: () => PromiseLike<{ error: { message: string } | null }>, success?: string) => {
    setBusy(key);
    const { error } = await call();
    setBusy(null);
    if (error) {
      toast.error("Couldn't change the group", { description: errorMessage(error) });
      return false;
    }
    if (success) toast.success(success);
    await onChanged();
    void refreshInbox();
    return true;
  };

  const client = getSupabaseBrowserClient();
  const rename = () =>
    run("title", () => client.rpc("update_group", { p_conversation: detail.id, p_title: title.trim() }), "Group renamed");
  const setPhoto = (path: string) =>
    run("photo", () => client.rpc("update_group", { p_conversation: detail.id, p_photo_path: path }), "Group picture changed");
  const removePhoto = () =>
    run("photo", () => client.rpc("update_group", { p_conversation: detail.id, p_remove_photo: true }), "Group picture removed");
  const add = async () => {
    if (!adding?.length) return;
    const ok = await run(
      "add",
      () => client.rpc("add_group_members", { p_conversation: detail.id, p_members: adding.map((p) => p.id) }),
      adding.length === 1 ? `${chatName(adding[0])} was added` : `${adding.length} people were added`,
    );
    if (ok) setAdding(null);
  };
  const remove = (id: string) =>
    run("remove:" + id, () => client.rpc("remove_group_member", { p_conversation: detail.id, p_user: id }), "Removed from the group");
  const leave = async () => {
    setBusy("leave");
    const { error } = await client.rpc("remove_group_member", { p_conversation: detail.id, p_user: me });
    setBusy(null);
    if (error) return void toast.error("Couldn't leave the group", { description: errorMessage(error) });
    toast.success("You left the group");
    void refreshInbox();
    onLeft();
  };

  const nameChanged = title.trim() !== (detail.title ?? "") && title.trim().length > 0;

  return (
    <Modal open={open} onClose={onClose} title="Group info" size="md">
      <div className="flex flex-col items-center text-center">
        <GroupAvatar photoPath={detail.photo_path} title={detail.title ?? "Group"} members={members.filter((m) => m.id !== me)} size={84} />
        <GroupPhotoPicker me={me} onUploaded={(path) => void setPhoto(path)}>
          {(choose, uploading) => (
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" size="xs" onClick={choose} loading={uploading || busy === "photo"}>
                <Camera className="h-3.5 w-3.5" /> {detail.photo_path ? "Change picture" : "Add a picture"}
              </Button>
              {detail.photo_path && (
                <Button variant="ghost" size="xs" onClick={() => void removePhoto()} disabled={busy === "photo"}>
                  Remove
                </Button>
              )}
            </div>
          )}
        </GroupPhotoPicker>
      </div>

      <form
        className="mt-6 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (nameChanged) void rename();
        }}
      >
        <label className="flex-1 text-left">
          <span className="mb-1.5 block text-xs text-ink-300">Group name</span>
          <Input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} aria-label="Group name" />
        </label>
        <Button type="submit" variant="secondary" disabled={!nameChanged} loading={busy === "title"}>
          Save
        </Button>
      </form>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">
            {members.length} {members.length === 1 ? "person" : "people"}
          </p>
          {adding === null && members.length < 50 && (
            <Button variant="ghost" size="xs" onClick={() => setAdding([])}>
              <UserPlus className="h-3.5 w-3.5" /> Add people
            </Button>
          )}
        </div>
        {adding !== null && (
          <div className="mb-4 rounded-2xl border border-white/[0.08] p-3">
            <PeoplePicker me={me} selected={adding} onChange={setAdding} exclude={members.map((m) => m.id)} max={50 - members.length} />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setAdding(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => void add()} disabled={!adding.length} loading={busy === "add"}>
                Add to group
              </Button>
            </div>
          </div>
        )}
        <ul className="divide-y divide-white/[0.05]" aria-label="People in the group">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2.5">
              <Link href={`/producers/${m.username}`} className="shrink-0" tabIndex={-1} aria-hidden>
                <Avatar path={m.avatar_path} name={chatName(m)} size={38} />
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={`/producers/${m.username}`} className="flex items-center gap-1 truncate text-sm font-medium hover:underline">
                  <span className="truncate">{m.id === me ? "You" : chatName(m)}</span>
                  {m.is_verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-accent-400" aria-label="Verified" />}
                </Link>
                <p className="truncate text-xs text-ink-400">
                  @{m.username}
                  {m.id === detail.created_by && " · runs the group"}
                </p>
              </div>
              {runsIt && m.id !== me && (
                <Button
                  variant={confirmRemove === m.id ? "danger" : "ghost"}
                  size="xs"
                  loading={busy === "remove:" + m.id}
                  onClick={() => (confirmRemove === m.id ? void remove(m.id) : setConfirmRemove(m.id))}
                  aria-label={confirmRemove === m.id ? `Confirm removing ${chatName(m)}` : `Remove ${chatName(m)} from the group`}
                >
                  {confirmRemove === m.id ? "Remove?" : "Remove"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 border-t border-white/[0.06] pt-4">
        <Button
          variant={confirmLeave ? "danger" : "ghost"}
          className="w-full"
          loading={busy === "leave"}
          onClick={() => (confirmLeave ? void leave() : setConfirmLeave(true))}
        >
          <LogOut className="h-4 w-4" /> {confirmLeave ? "Tap again to leave the group" : "Leave group"}
        </Button>
      </div>
    </Modal>
  );
}
