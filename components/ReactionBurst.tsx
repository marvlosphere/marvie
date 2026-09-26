"use client";

export type FloatingEmoji = { id: number; emoji: string };

// Purely presentational: the transient floating-up emoji animation over the
// video, decoupled from the reaction trigger buttons (which now live inside
// the merged control bar) so this can keep rendering in place regardless of
// where the buttons that create these entries live.
export default function ReactionBurst({ floating }: { floating: FloatingEmoji[] }) {
  return (
    <>
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
