import { createSupabaseClient } from "@/lib/supabase";
import { stopRoomRecording } from "@/lib/egress";

const INACTIVITY_LIMIT_MS = 2 * 60 * 60 * 1000; // 2 hours

/** Deletes rooms (and their cascaded chat/polls/join-request rows) that have
 * had no activity for over 2 hours, so the database doesn't grow unbounded
 * with abandoned rooms. Returns the number of rooms removed. */
export async function cleanupStaleRooms(): Promise<number> {
  const supabase = createSupabaseClient();
  const cutoff = new Date(Date.now() - INACTIVITY_LIMIT_MS).toISOString();

  // Stop any active egress jobs before the rows are deleted, so LiveKit
  // doesn't keep recording into a bucket with no room record to match.
  const { data: staleRooms } = await supabase
    .from("rooms")
    .select("name, egress_id")
    .lt("last_active_at", cutoff)
    .not("egress_id", "is", null);

  if (staleRooms?.length) {
    await Promise.allSettled(
      staleRooms.map((r) => stopRoomRecording(r.name, r.egress_id as string))
    );
  }

  const { data, error } = await supabase
    .from("rooms")
    .delete()
    .lt("last_active_at", cutoff)
    .select("name");
  if (error) {
    console.error("cleanupStaleRooms failed", error);
    return 0;
  }
  return data?.length ?? 0;
}
