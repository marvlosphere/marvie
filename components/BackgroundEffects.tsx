"use client";

import { useCallback, useRef, useState } from "react";
import { useLocalParticipant } from "@livekit/components-react";
import { Track } from "livekit-client";
import { BackgroundProcessor, supportsBackgroundProcessors, type BackgroundProcessorWrapper } from "@livekit/track-processors";
import credits from "@/public/backgrounds/CREDITS.json";

type Mode = "none" | "blur" | "office" | "living-room" | "library" | "forest" | "beach" | "gradient-purple" | "gradient-blue";

const VIRTUAL_BACKGROUNDS: Partial<Record<Mode, string>> = {
  office: "/backgrounds/office.jpg",
  "living-room": "/backgrounds/living-room.jpg",
  library: "/backgrounds/library.jpg",
  forest: "/backgrounds/forest.jpg",
  beach: "/backgrounds/beach.jpg",
  "gradient-purple": "/backgrounds/gradient-purple.jpg",
  "gradient-blue": "/backgrounds/gradient-blue.jpg",
};

const OPTIONS: { key: Mode; label: string; thumb?: string }[] = [
  { key: "none", label: "None" },
  { key: "blur", label: "Blur" },
  { key: "living-room", label: "Living room", thumb: "/backgrounds/living-room.jpg" },
  { key: "library", label: "Library", thumb: "/backgrounds/library.jpg" },
  { key: "forest", label: "Forest", thumb: "/backgrounds/forest.jpg" },
  { key: "beach", label: "Beach", thumb: "/backgrounds/beach.jpg" },
  { key: "gradient-purple", label: "Purple", thumb: "/backgrounds/gradient-purple.jpg" },
  { key: "gradient-blue", label: "Blue", thumb: "/backgrounds/gradient-blue.jpg" },
];

export default function BackgroundEffects() {
  const { localParticipant } = useLocalParticipant();
  const [mode, setMode] = useState<Mode>("none");
  const [busy, setBusy] = useState(false);
  const processorRef = useRef<BackgroundProcessorWrapper | null>(null);
  const supported = useRef(typeof window !== "undefined" && supportsBackgroundProcessors()).current;

  const apply = useCallback(
    async (next: Mode) => {
      const pub = localParticipant?.getTrackPublication(Track.Source.Camera);
      const track = pub?.track;
      if (!track || busy) return;
      setBusy(true);
      try {
        if (next === "none") {
          await track.stopProcessor();
          processorRef.current = null;
        } else if (next === "blur") {
          if (processorRef.current) {
            await processorRef.current.switchTo({ mode: "background-blur", blurRadius: 12 });
          } else {
            const processor = BackgroundProcessor({ mode: "background-blur", blurRadius: 12 });
            await track.setProcessor(processor);
            processorRef.current = processor;
          }
        } else {
          const imagePath = VIRTUAL_BACKGROUNDS[next]!;
          if (processorRef.current) {
            await processorRef.current.switchTo({ mode: "virtual-background", imagePath });
          } else {
            const processor = BackgroundProcessor({ mode: "virtual-background", imagePath });
            await track.setProcessor(processor);
            processorRef.current = processor;
          }
        }
        setMode(next);
      } catch {
        // background effects are a progressive enhancement; ignore failures (e.g. unsupported browser)
      } finally {
        setBusy(false);
      }
    },
    [localParticipant, busy]
  );

  if (!supported) return null;

  const activeCredit = credits.find((c) => c.key === mode);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        {OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            disabled={busy}
            onClick={() => apply(opt.key)}
            title={opt.label}
            style={{
              width: opt.thumb ? 56 : "auto",
              height: opt.thumb ? 40 : 32,
              padding: opt.thumb ? 0 : "0 0.6rem",
              borderRadius: 8,
              overflow: "hidden",
              border: mode === opt.key ? "2px solid var(--accent-1)" : "1px solid var(--glass-border)",
              background: opt.thumb ? `url(${opt.thumb}) center/cover` : "rgba(255,255,255,0.06)",
              color: "var(--text-0)",
              fontSize: "0.72rem",
              cursor: "pointer",
              position: "relative",
            }}
          >
            {!opt.thumb && opt.label}
          </button>
        ))}
      </div>
      {activeCredit && (
        <a
          href={activeCredit.source}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: "0.68rem", color: "var(--text-2)" }}
        >
          Photo by {activeCredit.artist || "unknown"} ({activeCredit.license}) — via Wikimedia Commons
        </a>
      )}
    </div>
  );
}
