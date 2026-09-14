import { RoomServiceClient, TrackType } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { logError } from "@/lib/logError";
import { randomUUID } from "crypto";

function httpUrlFromWsUrl(wsUrl: string) {
  return wsUrl.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
}

// muteAll can touch 100+ participants; sequential awaits risk running past
// Vercel's default function timeout at that scale. Allow more headroom.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { room, hostSecret, action, targetIdentity } = body as {
    room?: string;
    hostSecret?: string;
    action?: "mute" | "muteAll" | "remove" | "lock" | "unlock" | "admit" | "deny" | "admitAll" | "addCohost";
    targetIdentity?: string;
  };

  if (!room || !hostSecret || !action) {
    return NextResponse.json({ error: "room, hostSecret, and action are required" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseClient();
    const { data: roomRow } = await supabase
      .from("rooms")
      .select("host_secret, cohost_secrets")
      .eq("name", room)
      .single();

    const isPrimaryHost = !!roomRow && roomRow.host_secret === hostSecret;
    const isCohost = !!roomRow && (roomRow.cohost_secrets ?? []).includes(hostSecret);

    if (!isPrimaryHost && !isCohost) {
      return NextResponse.json({ error: "Not authorized as host for this room" }, { status: 403 });
    }

    if (action === "addCohost") {
      if (!isPrimaryHost) {
        return NextResponse.json({ error: "Only the primary host can invite co-hosts" }, { status: 403 });
      }
      const cohostSecret = randomUUID();
      const nextSecrets = [...(roomRow!.cohost_secrets ?? []), cohostSecret];
      await supabase.from("rooms").update({ cohost_secrets: nextSecrets }).eq("name", room);
      return NextResponse.json({ ok: true, cohostSecret });
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
    if (!apiKey || !apiSecret || !wsUrl) {
      return NextResponse.json({ error: "server missing LiveKit configuration" }, { status: 500 });
    }

    if (action === "lock" || action === "unlock") {
      await supabase.from("rooms").update({ locked: action === "lock" }).eq("name", room);
      return NextResponse.json({ ok: true, locked: action === "lock" });
    }

    if (action === "admit" || action === "deny") {
      if (!targetIdentity) {
        return NextResponse.json({ error: "targetIdentity is required for this action" }, { status: 400 });
      }
      await supabase
        .from("join_requests")
        .update({ status: action === "admit" ? "admitted" : "denied" })
        .eq("room_name", room)
        .eq("identity", targetIdentity);
      return NextResponse.json({ ok: true });
    }

    if (action === "admitAll") {
      // A wave of joins hitting a locked room at once (e.g. a 100-person
      // event starting on time) shouldn't force the host to click Admit
      // one-by-one — one bulk update handles it in a single query.
      await supabase
        .from("join_requests")
        .update({ status: "admitted" })
        .eq("room_name", room)
        .eq("status", "pending");
      return NextResponse.json({ ok: true });
    }

    const svc = new RoomServiceClient(httpUrlFromWsUrl(wsUrl), apiKey, apiSecret);

    if (action === "remove") {
      if (!targetIdentity) {
        return NextResponse.json({ error: "targetIdentity is required for this action" }, { status: 400 });
      }
      await svc.removeParticipant(room, targetIdentity);
      return NextResponse.json({ ok: true });
    }

    if (action === "mute") {
      if (!targetIdentity) {
        return NextResponse.json({ error: "targetIdentity is required for this action" }, { status: 400 });
      }
      const participant = await svc.getParticipant(room, targetIdentity);
      const audioTracks = (participant.tracks ?? []).filter((t) => t.type === TrackType.AUDIO);
      for (const track of audioTracks) {
        await svc.mutePublishedTrack(room, targetIdentity, track.sid, true);
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "muteAll") {
      const participants = await svc.listParticipants(room);
      // At 20 participants a sequential loop is fine; at 100+ it can run
      // long enough to risk the function timeout. Fire all mute calls in
      // parallel instead of awaiting one at a time.
      const muteJobs = participants.flatMap((participant) =>
        (participant.tracks ?? [])
          .filter((t) => t.type === TrackType.AUDIO)
          .map((track) => svc.mutePublishedTrack(room, participant.identity, track.sid, true))
      );
      await Promise.allSettled(muteJobs);
      return NextResponse.json({ ok: true, muted: muteJobs.length });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    await logError("api/moderate", err, { room, action, targetIdentity });
    return NextResponse.json({ error: "Something went wrong performing that action." }, { status: 500 });
  }
}
