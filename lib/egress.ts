import { EgressClient, EncodedFileOutput, EncodedFileType, S3Upload } from "livekit-server-sdk";
import { createSupabaseClient } from "@/lib/supabase";
import { logError } from "@/lib/logError";

function httpUrlFromWsUrl(wsUrl: string) {
  return wsUrl.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
}

function getEgressClient(): EgressClient | null {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if (!apiKey || !apiSecret || !wsUrl) return null;
  return new EgressClient(httpUrlFromWsUrl(wsUrl), apiKey, apiSecret);
}

function getS3Upload(): S3Upload | null {
  const accessKey = process.env.RECORDING_S3_ACCESS_KEY;
  const secret = process.env.RECORDING_S3_SECRET_KEY;
  const region = process.env.RECORDING_S3_REGION;
  const bucket = process.env.RECORDING_S3_BUCKET;
  if (!accessKey || !secret || !region || !bucket) return null;
  return new S3Upload({
    accessKey,
    secret,
    region,
    bucket,
    endpoint: process.env.RECORDING_S3_ENDPOINT ?? "",
    // Path-style addressing is required for Supabase Storage and Cloudflare R2
    forcePathStyle: !!process.env.RECORDING_S3_ENDPOINT,
  });
}

/** Starts a composite room recording and persists the egress ID to the DB.
 * Silently skips if S3 env vars are not configured, or if this room is
 * already recording (webhooks can be delivered more than once). Never throws. */
export async function startRoomRecording(roomName: string): Promise<void> {
  const client = getEgressClient();
  const s3 = getS3Upload();
  if (!client || !s3) return;

  try {
    const supabaseCheck = createSupabaseClient();
    const { data: roomRow } = await supabaseCheck.from("rooms").select("egress_id").eq("name", roomName).maybeSingle();
    if (roomRow?.egress_id) return;

    const filepath = `${roomName}/${Date.now()}.mp4`;
    const fileOutput = new EncodedFileOutput({
      fileType: EncodedFileType.MP4,
      filepath,
      output: { case: "s3", value: s3 },
    });

    const info = await client.startRoomCompositeEgress(roomName, fileOutput);

    const supabase = createSupabaseClient();
    await Promise.all([
      supabase.from("rooms").update({ egress_id: info.egressId }).eq("name", roomName),
      supabase.from("recordings").insert({
        room_name: roomName,
        egress_id: info.egressId,
        file_path: filepath,
        status: "recording",
      }),
    ]);
  } catch (err) {
    await logError("egress/start", err, { roomName });
  }
}

// LiveKit hard-caps file egress at 3 hours regardless of plan. Heartbeats
// arrive roughly every 20 minutes per participant (see RoomHeartbeat.tsx),
// so checking at 2h20m elapsed leaves a 20min+ margin even in the unlucky
// case where the *next* heartbeat is the one that finally notices — without
// this margin, detection latency alone could push the actual rotation past
// LiveKit's cutoff and lose the tail of the call entirely.
const RECORDING_ROTATE_AFTER_MS = 2 * 60 * 60 * 1000 + 20 * 60 * 1000;

/** Called from the heartbeat endpoint. If this room's current recording is
 * approaching LiveKit's 3-hour file cap, stops it and immediately starts a
 * fresh one (a new file/egress) so long calls keep recording in segments
 * instead of silently cutting off. Never throws. */
export async function rotateRoomRecordingIfNeeded(roomName: string): Promise<void> {
  const client = getEgressClient();
  const s3 = getS3Upload();
  if (!client || !s3) return;

  try {
    const supabase = createSupabaseClient();
    const { data: roomRow } = await supabase.from("rooms").select("egress_id").eq("name", roomName).maybeSingle();
    const egressId = roomRow?.egress_id;
    if (!egressId) return;

    const { data: recording } = await supabase
      .from("recordings")
      .select("started_at")
      .eq("egress_id", egressId)
      .maybeSingle();
    if (!recording) return;

    const elapsed = Date.now() - new Date(recording.started_at).getTime();
    if (elapsed < RECORDING_ROTATE_AFTER_MS) return;

    // Multiple participants' heartbeats can land within the same window —
    // this conditional update only succeeds for whichever request gets
    // there first (it only matches while egress_id still equals the value
    // we just read), so a second concurrent heartbeat sees 0 rows affected
    // and backs off instead of rotating twice.
    const { data: claimed } = await supabase
      .from("rooms")
      .update({ egress_id: null })
      .eq("name", roomName)
      .eq("egress_id", egressId)
      .select();
    if (!claimed || claimed.length === 0) return;

    await stopRoomRecording(roomName, egressId);
    await startRoomRecording(roomName);
  } catch (err) {
    await logError("egress/rotate", err, { roomName });
  }
}

/** Stops an active egress job and marks the recording as completed.
 * Never throws. */
export async function stopRoomRecording(roomName: string, egressId: string): Promise<void> {
  const client = getEgressClient();
  if (!client) return;

  let stopFailed = false;
  try {
    await client.stopEgress(egressId);
  } catch (err) {
    // A failed stop call very often just means the job already ended on its
    // own (e.g. it aborted). Log it, but still sync our DB state below —
    // otherwise egress_id stays stuck set forever and every future
    // room_finished redelivery retries the same dead job indefinitely (this
    // is exactly what happened: 6 retries against one already-aborted job).
    stopFailed = true;
    await logError("egress/stop", err, { roomName, egressId });
  }

  const supabase = createSupabaseClient();
  await Promise.all([
    supabase
      .from("recordings")
      .update({ status: stopFailed ? "failed" : "completed", stopped_at: new Date().toISOString() })
      .eq("egress_id", egressId),
    supabase.from("rooms").update({ egress_id: null }).eq("name", roomName),
  ]);
}
