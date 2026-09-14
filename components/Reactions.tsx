"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDataChannel, useLocalParticipant } from "@livekit/components-react";

type ReactionPayload =
  | { type: "emoji"; emoji: string; from: string }
  | { type: "hand"; raised: boolean; from: string; identity: string };

type FloatingEmoji = { id: number; emoji: string };

const EMOJIS = ["👍", "❤️", "😂", "🎉", "👏"];

export default function Reactions({
  senderName,
  raisedHands,
  setRaisedHands,
}: {
  senderName: string;
  raisedHands: Set<string>;
  setRaisedHands: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  const [floating, setFloating] = useState<FloatingEmoji[]>([]);
  const [handRaised, setHandRaised] = useState(false);
  const nextId = useRef(0);
  const { localParticipant } = useLocalParticipant();

  // The device-selector dropdowns (mic/camera chevrons) on the control bar
  // pop up right where this bar sits. Hide the reactions pill while any of
  // them are open instead of letting the two overlap.
  //
  // LiveKit keeps .lk-device-menu permanently mounted and only toggles its
  // `visibility` style rather than adding/removing it from the DOM, so
  // existence alone isn't "open" — checking that unconditionally hid the
  // reactions bar forever, including on mobile where nothing ever un-hides
  // it. Must check actual visibility, and watch attribute mutations (not
  // just childList) since that's how LiveKit flips it.
  const [dropdownOpen, setDropdownOpen] = useState(false);
  useEffect(() => {
    const check = () => {
      const menu = document.querySelector(".lk-device-menu");
      setDropdownOpen(!!menu && getComputedStyle(menu).visibility !== "hidden");
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
    check();
    return () => observer.disconnect();
  }, []);

  const { send } = useDataChannel("reactions", (msg) => {
    try {
      const text = new TextDecoder().decode(msg.payload);
      const payload = JSON.parse(text) as ReactionPayload;
      if (payload.type === "emoji") {
        const id = nextId.current++;
        setFloating((prev) => [...prev, { id, emoji: payload.emoji }]);
        window.setTimeout(() => {
          setFloating((prev) => prev.filter((f) => f.id !== id));
        }, 2200);
      } else if (payload.type === "hand") {
        setRaisedHands((prev) => {
          const next = new Set(prev);
          if (payload.raised) next.add(payload.identity);
          else next.delete(payload.identity);
          return next;
        });
      }
    } catch {
      // ignore malformed reaction payloads
    }
  });

  const sendEmoji = useCallback(
    (emoji: string) => {
      const id = nextId.current++;
      setFloating((prev) => [...prev, { id, emoji }]);
      window.setTimeout(() => {
        setFloating((prev) => prev.filter((f) => f.id !== id));
      }, 2200);
      const payload: ReactionPayload = { type: "emoji", emoji, from: senderName };
      send(new TextEncoder().encode(JSON.stringify(payload)), { reliable: true });
    },
    [send, senderName]
  );

  const toggleHand = useCallback(() => {
    const next = !handRaised;
    setHandRaised(next);
    const identity = localParticipant?.identity ?? senderName;
    setRaisedHands((prev) => {
      const s = new Set(prev);
      if (next) s.add(identity);
      else s.delete(identity);
      return s;
    });
    const payload: ReactionPayload = { type: "hand", raised: next, from: senderName, identity };
    send(new TextEncoder().encode(JSON.stringify(payload)), { reliable: true });
  }, [handRaised, localParticipant, send, senderName, setRaisedHands]);

  useEffect(() => {
    return () => {
      if (handRaised) {
        const identity = localParticipant?.identity ?? senderName;
        const payload: ReactionPayload = { type: "hand", raised: false, from: senderName, identity };
        send(new TextEncoder().encode(JSON.stringify(payload)), { reliable: true }).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div
        style={{
          position: "absolute",
          bottom: "calc(var(--lk-control-bar-height, 69px) + 14px)",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: "0.4rem",
          zIndex: 20,
          padding: "0.4rem",
          borderRadius: 999,
          background: "rgba(20, 22, 34, 0.7)",
          backdropFilter: "blur(12px)",
          border: "1px solid var(--glass-border)",
          opacity: dropdownOpen ? 0 : 1,
          pointerEvents: dropdownOpen ? "none" : "auto",
          transition: "opacity 0.15s ease",
        }}
      >
        {EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => sendEmoji(emoji)}
            type="button"
            style={{
              background: "transparent",
              border: "none",
              fontSize: "1.3rem",
              cursor: "pointer",
              padding: "0.2rem 0.35rem",
              borderRadius: 8,
              lineHeight: 1,
            }}
          >
            {emoji}
          </button>
        ))}
        <button
          onClick={toggleHand}
          type="button"
          title="Raise hand"
          style={{
            background: handRaised ? "var(--accent-1)" : "transparent",
            border: "none",
            fontSize: "1.3rem",
            cursor: "pointer",
            padding: "0.2rem 0.35rem",
            borderRadius: 8,
            lineHeight: 1,
          }}
        >
          ✋
        </button>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: 200,
          height: "70vh",
          pointerEvents: "none",
          zIndex: 19,
        }}
      >
        {floating.map((f) => (
          <span
            key={f.id}
            style={{
              position: "absolute",
              bottom: 0,
              left: `${20 + ((f.id * 37) % 60)}%`,
              fontSize: "2rem",
              animation: "marvie-float-up 2.2s ease-out forwards",
            }}
          >
            {f.emoji}
          </span>
        ))}
      </div>
      <style>{`
        @keyframes marvie-float-up {
          0% { transform: translateY(0); opacity: 1; }
          100% { transform: translateY(-260px); opacity: 0; }
        }
      `}</style>
    </>
  );
}
