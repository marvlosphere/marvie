"use client";

import { useEffect } from "react";
import { useParticipants } from "@livekit/components-react";

/** Raised hands are broadcast over the data channel and tracked in
 * page.tsx's `raisedHands` state (a set of participant identities), but
 * nothing rendered that anywhere except inside the People panel — so unless
 * you had that panel open, someone else raising their hand was invisible.
 * LiveKit's own `VideoConference` prebuilt UI owns the actual tile DOM, so
 * there's no React slot to render a badge into; this appends one directly
 * onto each raised participant's tile, matched by `data-lk-participant-name`
 * (the only per-participant hook LiveKit's tile exposes), keyed off the
 * live participant list so identity -> current tile stays correct even as
 * tiles get torn down and recreated (e.g. on pin/focus layout changes). */
export default function RaisedHandsOverlay({ raisedHands }: { raisedHands: Set<string> }) {
  const participants = useParticipants();

  useEffect(() => {
    const badges = new Map<string, HTMLDivElement>();

    function sync() {
      const raisedNames = new Set(
        participants
          .filter((p) => raisedHands.has(p.identity))
          .map((p) => p.name || p.identity)
      );

      badges.forEach((badge, name) => {
        if (!raisedNames.has(name)) {
          badge.remove();
          badges.delete(name);
        }
      });

      raisedNames.forEach((name) => {
        if (badges.has(name)) return;
        const nameEl = document.querySelector(`[data-lk-participant-name="${CSS.escape(name)}"]`);
        const tile = nameEl?.closest(".lk-participant-tile") as HTMLElement | null;
        if (!tile) return;
        if (getComputedStyle(tile).position === "static") {
          tile.style.position = "relative";
        }
        const badge = document.createElement("div");
        badge.className = "marvie-raised-hand-badge";
        badge.textContent = "✋";
        tile.appendChild(badge);
        badges.set(name, badge);
      });
    }

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      badges.forEach((badge) => badge.remove());
    };
  }, [participants, raisedHands]);

  return null;
}
