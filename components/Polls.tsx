"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseClient } from "@/lib/supabase";
import PanelCloseButton from "@/components/PanelCloseButton";

type Poll = {
  id: number;
  question: string;
  options: string[];
  closed: boolean;
  created_by: string;
};

type Vote = { poll_id: number; identity: string; option_index: number };

export default function Polls({
  roomName,
  identity,
  isHost,
  hostSecret,
  onClose,
}: {
  roomName: string;
  identity: string;
  isHost: boolean;
  hostSecret: string | null;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createSupabaseClient(), []);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [creating, setCreating] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);

  useEffect(() => {
    supabase
      .from("polls")
      .select("id, question, options, closed, created_by")
      .eq("room_name", roomName)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setPolls(data as Poll[]);
      });

    supabase
      .from("poll_votes")
      .select("poll_id, identity, option_index")
      .then(({ data }) => {
        if (data) setVotes(data as Vote[]);
      });

    const channel = supabase
      .channel(`polls:${roomName}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "polls", filter: `room_name=eq.${roomName}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setPolls((prev) => [payload.new as Poll, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setPolls((prev) => prev.map((p) => (p.id === (payload.new as Poll).id ? (payload.new as Poll) : p)));
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "poll_votes" },
        (payload) => {
          setVotes((prev) => [...prev, payload.new as Vote]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomName, supabase]);

  async function createPoll(e: React.FormEvent) {
    e.preventDefault();
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || cleanOptions.length < 2) return;
    await supabase.from("polls").insert({
      room_name: roomName,
      question: question.trim(),
      options: cleanOptions,
      created_by: identity,
    });
    setQuestion("");
    setOptions(["", ""]);
    setCreating(false);
  }

  async function vote(pollId: number, optionIndex: number) {
    await supabase.from("poll_votes").upsert(
      { poll_id: pollId, identity, option_index: optionIndex },
      { onConflict: "poll_id,identity" }
    );
  }

  async function closePoll(pollId: number) {
    if (!hostSecret) return;
    await supabase.from("polls").update({ closed: true }).eq("id", pollId);
  }

  return (
    <div
      className="glass-card marvie-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        ["--panel-width" as string]: "320px",
        margin: "0 0.75rem 0.75rem 0",
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--glass-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Polls</span>
        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          {isHost && (
            <button className="btn-ghost" style={{ padding: "0.3rem 0.5rem", fontSize: "0.75rem" }} onClick={() => setCreating((c) => !c)}>
              {creating ? "Cancel" : "New poll"}
            </button>
          )}
          <PanelCloseButton onClose={onClose} />
        </div>
      </div>

      {creating && (
        <form onSubmit={createPoll} style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--glass-border)", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <input
            className="glass-input"
            placeholder="Question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            style={{ padding: "0.5rem 0.75rem", fontSize: "0.85rem" }}
          />
          {options.map((opt, i) => (
            <input
              key={i}
              className="glass-input"
              placeholder={`Option ${i + 1}`}
              value={opt}
              onChange={(e) =>
                setOptions((prev) => prev.map((o, idx) => (idx === i ? e.target.value : o)))
              }
              style={{ padding: "0.5rem 0.75rem", fontSize: "0.85rem" }}
            />
          ))}
          {options.length < 4 && (
            <button
              type="button"
              className="btn-ghost"
              style={{ fontSize: "0.75rem", padding: "0.3rem 0.5rem" }}
              onClick={() => setOptions((prev) => [...prev, ""])}
            >
              + Add option
            </button>
          )}
          <button type="submit" className="btn-primary" style={{ padding: "0.5rem", fontSize: "0.85rem" }}>
            Create poll
          </button>
        </form>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: "0.75rem 1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        {polls.length === 0 && <p style={{ color: "var(--text-2)", fontSize: "0.85rem" }}>No polls yet.</p>}
        {polls.map((poll) => {
          const pollVotes = votes.filter((v) => v.poll_id === poll.id);
          const totalVotes = pollVotes.length;
          const myVote = pollVotes.find((v) => v.identity === identity);
          return (
            <div key={poll.id}>
              <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                {poll.question} {poll.closed && <span style={{ color: "var(--text-2)", fontWeight: 400 }}>(closed)</span>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {poll.options.map((opt, i) => {
                  const count = pollVotes.filter((v) => v.option_index === i).length;
                  const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={poll.closed}
                      onClick={() => vote(poll.id, i)}
                      style={{
                        position: "relative",
                        overflow: "hidden",
                        textAlign: "left",
                        padding: "0.5rem 0.7rem",
                        borderRadius: 8,
                        border: myVote?.option_index === i ? "1px solid var(--accent-1)" : "1px solid var(--glass-border)",
                        background: "rgba(255,255,255,0.04)",
                        color: "var(--text-0)",
                        cursor: poll.closed ? "default" : "pointer",
                        fontSize: "0.82rem",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          width: `${pct}%`,
                          background: "rgba(124, 92, 255, 0.18)",
                          zIndex: 0,
                        }}
                      />
                      <span style={{ position: "relative", zIndex: 1 }}>
                        {opt} — {count} ({pct}%)
                      </span>
                    </button>
                  );
                })}
              </div>
              {isHost && !poll.closed && (
                <button
                  className="btn-ghost"
                  style={{ marginTop: "0.5rem", padding: "0.3rem 0.5rem", fontSize: "0.75rem" }}
                  onClick={() => closePoll(poll.id)}
                >
                  Close poll
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
