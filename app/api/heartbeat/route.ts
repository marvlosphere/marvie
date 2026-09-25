import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { logError } from "@/lib/logError";
import { rotateRoomRecordingIfNeeded } from "@/lib/egress";

export async function POST(req: NextRequest) {
  const { room } = (await req.json()) as { room?: string };
  if (!room) {
    return NextResponse.json({ error: "room is required" }, { status: 400 });
  }
  try {
    const supabase = createSupabaseClient();
    await supabase.from("rooms").update({ last_active_at: new Date().toISOString() }).eq("name", room);
    // Piggyback on the existing 20-minute heartbeat cadence instead of
    // needing dedicated cron — Vercel's Hobby plan only allows daily cron,
    // far too coarse to catch LiveKit's 3-hour recording cap in time.
    rotateRoomRecordingIfNeeded(room).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    await logError("api/heartbeat", err, { room });
    return NextResponse.json({ error: "heartbeat failed" }, { status: 500 });
  }
}
