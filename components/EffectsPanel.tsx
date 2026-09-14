"use client";

import BackgroundEffects from "./BackgroundEffects";

export default function EffectsPanel() {
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
        <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.5rem" }}>Background</div>
        <BackgroundEffects />
      </div>
    </div>
  );
}
