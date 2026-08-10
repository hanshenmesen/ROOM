"use client";

import { useEffect, useRef, useState } from "react";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  ttl: number;
  size: number;
  color: string;
};

const PARTICLE_COLORS = ["82, 127, 174", "238, 118, 84", "101, 215, 195"];
const MAX_PARTICLES = 90;
const SPAWN_DISTANCE = 14;

/**
 * Sparkle trail that follows fast pointer movement — tiny motes lift and
 * fade like dust kicked up by the cursor. Rendered on a fixed canvas that
 * never intercepts events; off for touch devices and reduced motion.
 */
export function TrailEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [enabled, setEnabled] = useState(false);

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
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let width = 0;
    let height = 0;
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const particles: Particle[] = [];
    let lastX = -1;
    let lastY = -1;
    let lastTime = performance.now();
    let frame = 0;

    const spawn = (x: number, y: number) => {
      if (particles.length >= MAX_PARTICLES) particles.shift();
      particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 26,
        vy: -16 - Math.random() * 28,
        life: 0,
        ttl: 0.5 + Math.random() * 0.45,
        size: 1.5 + Math.random() * 2.6,
        color: PARTICLE_COLORS[(Math.random() * PARTICLE_COLORS.length) | 0],
      });
    };

    const onMove = (event: PointerEvent) => {
      const { clientX: x, clientY: y } = event;
      if (lastX >= 0) {
        const distance = Math.hypot(x - lastX, y - lastY);
        if (distance > SPAWN_DISTANCE) {
          spawn(x, y);
          if (distance > SPAWN_DISTANCE * 3) spawn((x + lastX) / 2, (y + lastY) / 2);
        }
      }
      lastX = x;
      lastY = y;
    };

    const tick = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      context.clearRect(0, 0, width, height);
      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index];
        particle.life += dt;
        if (particle.life >= particle.ttl) {
          particles.splice(index, 1);
          continue;
        }
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vy += 26 * dt; // gentle buoyancy curve, not real gravity
        const progress = particle.life / particle.ttl;
        const alpha = (1 - progress) * 0.5;
        const radius = particle.size * (1 - progress * 0.55);
        context.beginPath();
        context.arc(particle.x, particle.y, Math.max(radius, 0.3), 0, Math.PI * 2);
        context.fillStyle = `rgba(${particle.color}, ${alpha.toFixed(3)})`;
        context.fill();
      }
      frame = window.requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    frame = window.requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(frame);
    };
  }, [enabled]);

  if (!enabled) return null;
  return <canvas ref={canvasRef} className="trail-effect-canvas" aria-hidden="true" />;
}
