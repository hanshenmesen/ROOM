"use client";

import { useEffect } from "react";

const TILT_SELECTOR = ".demo-panel, .intake-preview-items > div";
const MAX_TILT_DEG = 4.2;

/**
 * Pointer-driven 3D tilt for cards. Uses document-level event delegation so
 * the cards themselves need no wrapper components or per-card handlers —
 * any element matching TILT_SELECTOR tilts towards the cursor, and eases back
 * via the CSS transition on transform. Disabled for touch/reduced-motion.
 */
export function TiltEffect() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    let current: HTMLElement | null = null;

    const reset = () => {
      if (!current) return;
      current.style.setProperty("--rx", "0deg");
      current.style.setProperty("--ry", "0deg");
      current = null;
    };

    const onMove = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const card = target?.closest(TILT_SELECTOR) as HTMLElement | null;
      if (!card) {
        reset();
        return;
      }
      if (card !== current) {
        reset();
        current = card;
      }
      const rect = card.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      card.style.setProperty("--ry", `${(px * MAX_TILT_DEG).toFixed(2)}deg`);
      card.style.setProperty("--rx", `${(-py * MAX_TILT_DEG).toFixed(2)}deg`);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("blur", reset);
      reset();
    };
  }, []);

  return null;
}
