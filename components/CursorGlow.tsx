"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Ambient cursor halo: a soft light blob that trails the pointer with
 * spring-like easing. Purely decorative — it never intercepts events,
 * and it stays off for touch devices and reduced-motion users.
 */
export function CursorGlow() {
  const [enabled, setEnabled] = useState(false);
  const dotRef = useRef<HTMLDivElement>(null);
  const haloRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const finePointer = window.matchMedia("(pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setEnabled(finePointer.matches && !reducedMotion.matches);
    update();
    finePointer.addEventListener("change", update);
    reducedMotion.addEventListener("change", update);
    return () => {
      finePointer.removeEventListener("change", update);
      reducedMotion.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const dot = dotRef.current;
    const halo = haloRef.current;
    if (!dot || !halo) return;

    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let haloX = targetX;
    let haloY = targetY;
    let dotX = targetX;
    let dotY = targetY;
    let visible = false;
    let frame = 0;

    const onMove = (event: PointerEvent) => {
      targetX = event.clientX;
      targetY = event.clientY;
      if (!visible) {
        visible = true;
        dot.style.opacity = "1";
        halo.style.opacity = "1";
      }
    };
    const onOver = (event: PointerEvent) => {
      const interactive = event.target instanceof Element
        && event.target.closest("a, button, input, textarea, select, [role='button'], [tabindex]");
      halo.classList.toggle("is-interactive", Boolean(interactive));
    };
    const onLeave = () => {
      visible = false;
      dot.style.opacity = "0";
      halo.style.opacity = "0";
    };
    const onDown = () => halo.classList.add("is-pressed");
    const onUp = () => halo.classList.remove("is-pressed");

    const tick = () => {
      // Halo trails slowly, dot hugs the cursor — two easing speeds read as depth.
      haloX += (targetX - haloX) * 0.085;
      haloY += (targetY - haloY) * 0.085;
      dotX += (targetX - dotX) * 0.35;
      dotY += (targetY - dotY) * 0.35;
      halo.style.transform = `translate3d(${haloX}px, ${haloY}px, 0)`;
      dot.style.transform = `translate3d(${dotX}px, ${dotY}px, 0)`;
      frame = window.requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerover", onOver, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    frame = window.requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerover", onOver);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.cancelAnimationFrame(frame);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      <div ref={haloRef} className="cursor-halo" aria-hidden="true" />
      <div ref={dotRef} className="cursor-dot" aria-hidden="true" />
    </>
  );
}
