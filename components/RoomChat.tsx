"use client";

import { useEffect, useRef, useState } from "react";
import { createSupabaseClient } from "@/lib/supabase";
import PanelCloseButton from "@/components/PanelCloseButton";

type ChatMessage = {
  id: number;
  room_name: string;
  sender: string;
  body: string;
  created_at: string;
};

export default function RoomChat({
  roomName,
  senderName,
  onClose,
}: {
  roomName: string;
  senderName: string;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const supabaseRef = useRef(createSupabaseClient());

  useEffect(() => {
    const supabase = supabaseRef.current;
    let cancelled = false;

    // Load only the most recent messages — a busy 100-person room running
    // for hours could otherwise mean fetching thousands of rows on every
    // single join.
    supabase
      .from("messages")
      .select("*")
      .eq("room_name", roomName)
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (!cancelled && data) setMessages((data as ChatMessage[]).reverse());
      });

    const channel = supabase
      .channel(`messages:${roomName}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `room_name=eq.${roomName}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as ChatMessage]);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [roomName]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    supabaseRef.current.from("messages").insert({
      room_name: roomName,
      sender: senderName,
      body,
    }).then();
  }

  return (
    <div
      className="glass-card marvie-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        ["--panel-width" as string]: "300px",
        margin: "0 0.75rem 0.75rem 0",
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "0.75rem 1rem",
          borderBottom: "1px solid var(--glass-border)",
          fontWeight: 600,
          fontSize: "0.9rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        Room chat
        <PanelCloseButton onClose={onClose} />
      </div>
      <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "0.75rem 1rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {messages.length === 0 && (
          <p style={{ color: "var(--text-2)", fontSize: "0.85rem" }}>No messages yet. Say hi.</p>
        )}
        {messages.map((m) => (
          <div key={m.id}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-1)", marginBottom: 2 }}>{m.sender}</div>
            <div style={{ fontSize: "0.9rem", wordBreak: "break-word" }}>{m.body}</div>
          </div>
        ))}
      </div>
      <form onSubmit={sendMessage} style={{ display: "flex", gap: "0.5rem", padding: "0.75rem", borderTop: "1px solid var(--glass-border)" }}>
        <input
          className="glass-input"
          placeholder="Message"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{ padding: "0.5rem 0.75rem", fontSize: "0.85rem" }}
        />
        <button type="submit" className="btn-ghost">
          Send
        </button>
      </form>
    </div>
  );
}
