"use client";

import { useEffect } from "react";

const HEARTBEAT_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes

/** Keeps a room's last_active_at fresh while someone is actively connected,
 * so a long call with no new joiners doesn't get swept by the 2-hour
 * inactivity cleanup mid-call. */
export default function RoomHeartbeat({ roomName }: { roomName: string }) {
  useEffect(() => {
    const ping = () => {
      fetch("/api/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: roomName }),
      }).catch(() => {});
    };
    const id = window.setInterval(ping, HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [roomName]);

  return null;
}
