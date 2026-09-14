"use client";

import { useEffect, useState } from "react";
import { createSupabaseClient } from "@/lib/supabase";

export type JoinRequest = {
  identity: string;
  display_name: string;
  status: string;
};

/** Live list of pending join requests for a room, kept in sync via Supabase
 * Realtime. Only the host/co-host needs this, so it's a no-op otherwise. */
export function usePendingJoinRequests(roomName: string, isHost: boolean) {
  const [requests, setRequests] = useState<JoinRequest[]>([]);

  useEffect(() => {
    if (!isHost) {
      setRequests([]);
      return;
    }
    const supabase = createSupabaseClient();

    supabase
      .from("join_requests")
      .select("identity, display_name, status")
      .eq("room_name", roomName)
      .eq("status", "pending")
      .then(({ data }) => {
        if (data) setRequests(data as JoinRequest[]);
      });

    const channel = supabase
      .channel(`join_requests:${roomName}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "join_requests", filter: `room_name=eq.${roomName}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as JoinRequest;
          setRequests((prev) => {
            const withoutRow = prev.filter((r) => r.identity !== row.identity);
            if (payload.eventType !== "DELETE" && (payload.new as JoinRequest).status === "pending") {
              return [...withoutRow, payload.new as JoinRequest];
            }
            return withoutRow;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isHost, roomName]);

  return requests;
}
