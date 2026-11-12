import "server-only";

import { createSupabaseServerClient } from "../supabase/server";

/** An open invite or active collaboration of the signed-in producer (either side). */
export interface Collaboration {
  id: string;
  status: "pending" | "accepted";
  share_percent: number;
  created_at: string;
  responded_at: string | null;
  /** "owner": it's my beat. "collaborator": I was invited to someone else's beat. */
  role: "owner" | "collaborator";
  beat: { id: string; title: string; slug: string; cover_path: string | null; status: string; bpm: number; key_note: number; key_mode: string };
  /** The other producer. */
  other: { id: string; username: string; name: string; avatar_path: string | null };
}

export async function getMyCollaborations(): Promise<Collaboration[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_collaborations");
  // A database without update 12 simply has no collaborations.
  if (error) return [];
  return (data as unknown as Collaboration[]) ?? [];
}
