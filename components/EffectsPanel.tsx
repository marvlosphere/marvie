"use client";

import BackgroundEffects from "./BackgroundEffects";
import PanelCloseButton from "@/components/PanelCloseButton";

export default function EffectsPanel({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="glass-card marvie-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        ["--panel-width" as string]: "280px",
        margin: "0 0.75rem 0.75rem 0",
        borderRadius: 16,
        overflow: "hidden",
        padding: "1rem",
        gap: "1.25rem",
      }}
    >
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontWeight: 600,
            fontSize: "0.85rem",
            marginBottom: "0.5rem",
          }}
        >
          Background
          <PanelCloseButton onClose={onClose} />
        </div>
        <BackgroundEffects />
      </div>
    </div>
  );
}
