import { useEffect, useState } from "react";

const COLORS = ["#e8b94a", "#2fae6b", "#4f9ef8", "#ef5757", "#f1f5fb"];

/**
 * Fires a one-shot confetti burst. Mount conditionally:
 *   {showConfetti && <ConfettiBurst onDone={() => setShowConfetti(false)} />}
 */
export default function ConfettiBurst({ pieceCount = 60, onDone }) {
  const [pieces, setPieces] = useState([]);

  useEffect(() => {
    const generated = Array.from({ length: pieceCount }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.3,
      duration: 1.6 + Math.random() * 1.2,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rotate: Math.random() * 360,
    }));
    setPieces(generated);

    const timeout = setTimeout(() => {
      onDone?.();
    }, 3200);
    return () => clearTimeout(timeout);
  }, [pieceCount, onDone]);

  return (
    <div className="confetti-burst" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}
