import { useEffect, useState, useRef } from "react";

/**
 * Animates a number counting up from 0 to `value` over `duration` ms.
 * Usage: <CountUp value={stats.totalFixtures} />
 */
export default function CountUp({ value, duration = 900, className = "" }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);
  const startRef = useRef(null);

  useEffect(() => {
    if (value == null) return;
    const target = Number(value) || 0;
    startRef.current = null;

    function tick(ts) {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  return <span className={className}>{display}</span>;
}
