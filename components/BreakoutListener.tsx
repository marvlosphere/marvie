"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocalParticipant } from "@livekit/components-react";
import { createSupabaseClient } from "@/lib/supabase";
import { parentRoomOf } from "./BreakoutRooms";

export default function BreakoutListener({ roomName, name }: { roomName: string; name: string }) {
  const router = useRouter();
  const { localParticipant } = useLocalParticipant();
  const identity = localParticipant?.identity;
  const parent = parentRoomOf(roomName);

  useEffect(() => {
    if (!identity) return;
    const supabase = createSupabaseClient();
    const listenRoom = parent ?? roomName;
    const channel = supabase.channel(`breakout:${listenRoom}`);

    channel
      .on("broadcast", { event: "assign" }, ({ payload }) => {
        if (parent) return; // already in a breakout room; ignore reassignment
        if (payload.identity === identity) {
          router.push(`/room/${encodeURIComponent(payload.room)}?name=${encodeURIComponent(name)}${window.location.hash}`);
        }
      })
      .on("broadcast", { event: "recall" }, ({ payload }) => {
        if (!parent) return; // only breakout participants should be recalled
        router.push(`/room/${encodeURIComponent(payload.room)}?name=${encodeURIComponent(name)}${window.location.hash}`);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [identity, parent, roomName, name, router]);

  return null;
}
