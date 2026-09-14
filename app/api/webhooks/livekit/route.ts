import { NextRequest, NextResponse } from "next/server";
import { WebhookReceiver } from "livekit-server-sdk";
import { createSupabaseClient } from "@/lib/supabase";
import { startRoomRecording, stopRoomRecording } from "@/lib/egress";
import { logError } from "@/lib/logError";

// LiveKit Cloud must be configured (project settings -> Webhooks) to POST
// here. room_started fires the moment a room goes from 0 -> 1 participants
// (even on a repeat visit to the same room code), and room_finished fires
// once the last participant leaves and the room's emptyTimeout elapses —
// this is what makes recording restart per-session instead of once ever,
// and finalize promptly instead of waiting for the 2h stale-room sweep.
export async function POST(req: NextRequest) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    return NextResponse.json({ error: "server missing LiveKit configuration" }, { status: 500 });
  }

  const body = await req.text();
  const authHeader = req.headers.get("authorization") ?? undefined;

  try {
    const receiver = new WebhookReceiver(apiKey, apiSecret);
    const event = await receiver.receive(body, authHeader);
    const roomName = event.room?.name;

    if (event.event === "room_started" && roomName) {
      await startRoomRecording(roomName);
    } else if (event.event === "room_finished" && roomName) {
      const supabase = createSupabaseClient();
      const { data } = await supabase.from("rooms").select("egress_id").eq("name", roomName).maybeSingle();
      if (data?.egress_id) {
        await stopRoomRecording(roomName, data.egress_id);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    await logError("api/webhooks/livekit", err);
    return NextResponse.json({ error: "invalid webhook request" }, { status: 400 });
  }
}
