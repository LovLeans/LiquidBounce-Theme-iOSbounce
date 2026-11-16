// Shared spring physics for the press-button and morphing-menu components.
// A spring is a plain object { p: position, v: velocity, t: target, k: stiffness, c: damping }.

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function spring(position, stiffness, damping) {
  return { p: position, v: 0, t: position, k: stiffness, c: damping };
}

/** Aim a spring at a new target; stiffness/damping are only replaced when given. */
export function retarget(s, target, stiffness, damping) {
  s.t = target;
  if (stiffness) {
    s.k = stiffness;
    s.c = damping;
  }
}

const isMoving = (s) => Math.abs(s.t - s.p) > 0.002 || Math.abs(s.v) > 0.01;

/** Linear mix between two [r, g, b] triples (or [r, g, b, a] quadruples for translucent colours), t in 0..1. */
export function mixRgb(from, to, t) {
  const k = clamp(t, 0, 1);
  const m = from.map((a, i) => a + (to[i] - a) * k);
  if (m.length > 3) return 'rgba(' + m.slice(0, 3).map(Math.round).join(',') + ',' + m[3].toFixed(3) + ')';
  return 'rgb(' + m.map(Math.round).join(',') + ')';
}

/**
 * requestAnimationFrame loop that integrates `springs` (sub-stepped at ~300Hz),
 * calls onFrame (which may retarget springs), then render(), and goes idle once
 * everything has settled. Call kick() after changing any target.
 */
export function createLoop(springs, { render, onFrame }) {
  let raf = 0;
  let last = 0;

  function tick(now) {
    const dt = Math.min(0.032, (now - last) / 1000 || 0.016);
    last = now;
    const n = Math.ceil(dt * 300);
    const d = dt / n;
    for (let i = 0; i < n; i++) {
      for (const s of springs) {
        s.v += (s.k * (s.t - s.p) - s.c * s.v) * d;
        s.p += s.v * d;
      }
    }
    onFrame?.();
    const active = springs.some(isMoving);
    render();
    raf = active ? requestAnimationFrame(tick) : 0;
  }

  return {
    kick() {
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
