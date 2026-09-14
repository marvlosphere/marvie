import { AccessToken, RoomConfiguration } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { cleanupStaleRooms } from "@/lib/cleanupStaleRooms";
import { logError } from "@/lib/logError";
import { parentRoomOf } from "@/lib/breakoutRooms";
import { randomUUID } from "crypto";

export async function GET(req: NextRequest) {
  const room = req.nextUrl.searchParams.get("room");
  const identity = req.nextUrl.searchParams.get("identity");
  const displayName = req.nextUrl.searchParams.get("name") ?? identity ?? "";
  const suppliedHostSecret = req.nextUrl.searchParams.get("hostSecret");

  if (!room || !identity) {
    return NextResponse.json(
      { error: "room and identity are required" },
      { status: 400 }
    );
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "server missing LIVEKIT_API_KEY/LIVEKIT_API_SECRET" },
      { status: 500 }
    );
  }

  try {
    // Opportunistic cleanup: piggyback on normal traffic so stale rooms get
    // swept without needing fine-grained cron (Vercel's free tier only allows
    // daily cron runs). A backup daily cron (see /api/cron/cleanup) covers
    // the case where the app gets no traffic at all for a while.
    if (Math.random() < 0.2) {
      cleanupStaleRooms().catch(() => {});
    }

    const supabase = createSupabaseClient();
    const parent = parentRoomOf(room);

    const { data: existing } = await supabase
      .from("rooms")
      .select("host_secret, cohost_secrets, locked")
      .eq("name", room)
      .maybeSingle();

    let isHost = false;
    let role: "host" | "cohost" | null = null;
    let hostSecret: string | null = null;
    let locked = false;
    let roomExists = !!existing;

    if (existing) {
      locked = existing.locked;
      if (suppliedHostSecret && suppliedHostSecret === existing.host_secret) {
        isHost = true;
        role = "host";
        hostSecret = existing.host_secret;
      } else if (suppliedHostSecret && (existing.cohost_secrets ?? []).includes(suppliedHostSecret)) {
        isHost = true;
        role = "cohost";
        hostSecret = suppliedHostSecret;
      }
    } else if (parent) {
      // Breakout sub-rooms are provisioned by the app itself (assigned via
      // the host's "split into rooms" action), never typed in by a user, so
      // it's safe to auto-create them here as long as the parent room is
      // real — this is what closes the loophole below without breaking
      // breakout rooms.
      const { data: parentRoom } = await supabase.from("rooms").select("name").eq("name", parent).maybeSingle();
      if (parentRoom) {
        const newSecret = randomUUID();
        const { data: created } = await supabase
          .from("rooms")
          .upsert({ name: room, host_secret: newSecret }, { onConflict: "name", ignoreDuplicates: true })
          .select();

        if (created && created.length > 0) {
          isHost = true;
          role = "host";
          hostSecret = newSecret;
          locked = false;
          roomExists = true;
        } else {
          const { data: raceWinner } = await supabase
            .from("rooms")
            .select("host_secret, cohost_secrets, locked")
            .eq("name", room)
            .maybeSingle();
          if (raceWinner) {
            roomExists = true;
            locked = raceWinner.locked;
            if (suppliedHostSecret && suppliedHostSecret === raceWinner.host_secret) {
              isHost = true;
              role = "host";
              hostSecret = raceWinner.host_secret;
            } else if (suppliedHostSecret && (raceWinner.cohost_secrets ?? []).includes(suppliedHostSecret)) {
              isHost = true;
              role = "cohost";
              hostSecret = suppliedHostSecret;
            }
          }
        }
      }
    }

    // Room codes are now only minted by /api/rooms/create (or auto-provisioned
    // breakout sub-rooms above) — visiting an arbitrary/never-created code no
    // longer silently spins up a room.
    if (!roomExists) {
      return NextResponse.json(
        { error: "This room doesn't exist. Ask the host for a valid invite link, or start a new call." },
        { status: 404 }
      );
    }

    // Any join attempt counts as activity, whether it succeeds, waits, or is
    // denied — this keeps a room alive as long as people are trying to use it.
    await supabase.from("rooms").update({ last_active_at: new Date().toISOString() }).eq("name", room);

    if (locked && !isHost) {
      const { data: existingRequest } = await supabase
        .from("join_requests")
        .select("status")
        .eq("room_name", room)
        .eq("identity", identity)
        .maybeSingle();

      if (!existingRequest) {
        await supabase.from("join_requests").insert({
          room_name: room,
          identity,
          display_name: displayName,
          status: "pending",
        });
        return NextResponse.json({ waiting: true });
      }

      if (existingRequest.status === "denied") {
        return NextResponse.json({ error: "The host denied your request to join." }, { status: 403 });
      }

      if (existingRequest.status !== "admitted") {
        return NextResponse.json({ waiting: true });
      }
      // status === "admitted" -> fall through and issue a token
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      ttl: "10h",
    });
    at.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    // Applies the first time this room is actually created on the SFU (i.e.
    // whichever token connects first). emptyTimeout controls how long the
    // room stays open with nobody in it before LiveKit closes it (which is
    // what fires the room_finished webhook that stops the recording).
    // A too-short value here is actively dangerous: composite egress spins
    // up a headless renderer that takes real time to join and start
    // capturing, and if the room closes before that finishes, the egress
    // aborts with "Start signal not received" and nothing gets saved at all
    // (this happened in production with 15s). 60s leaves real headroom for
    // that startup while still being far faster than LiveKit's ~5min default.
    at.roomConfig = new RoomConfiguration({ emptyTimeout: 60 });

    const token = await at.toJwt();
    return NextResponse.json({ token, isHost, role, hostSecret, locked });
  } catch (err) {
    await logError("api/token", err, { room, identity });
    return NextResponse.json({ error: "Something went wrong joining the room. Please try again." }, { status: 500 });
  }
}
