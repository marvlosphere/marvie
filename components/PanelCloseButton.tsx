"use client";

// Consistent close ("X") control for every side panel (chat, people, polls,
// whiteboard, breakout, background) so closing one doesn't require finding
// and re-clicking whichever button opened it in the first place.
export default function PanelCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close panel"
      title="Close"
      style={{
        background: "transparent",
        border: "none",
        color: "var(--text-1)",
        fontSize: "1.1rem",
        lineHeight: 1,
        cursor: "pointer",
        padding: "0.2rem 0.4rem",
        borderRadius: 8,
        flexShrink: 0,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      ✕
    </button>
  );
}
