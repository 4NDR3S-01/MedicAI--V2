"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Returns a progress value [0..1] representing how far the element has
 * scrolled out of view upward.
 * 0 = element is fully in view (at/near top of viewport)
 * 1 = element has scrolled completely above viewport
 */
export function useScrollProgress() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onScroll = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // How far element top is above viewport mid-point, normalized
      const raw = 1 - (rect.bottom / vh);
      const clamped = Math.min(1, Math.max(0, raw));
      setProgress(clamped);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return [ref, progress] as const;
}
