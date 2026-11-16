/**
 * Damped-spring physics, solved in closed form (a mass on a spring released from rest, travelling 0 -> 1).
 *
 *   stiffness  how hard it pulls (higher = faster)
 *   damping    how much it resists (below 2*sqrt(stiffness*mass) it overshoots and wobbles)
 *
 * Returns the settle time and an `easing(p)` that maps linear progress 0..1 onto the spring curve, so it can
 * drive Svelte transitions (JS) and, through `cssLinear`, CSS transitions. The curve may go above 1 (overshoot).
 */
export function makeSpring({ stiffness = 300, damping = 22, mass = 1 } = {}) {
  const w0 = Math.sqrt(stiffness / mass);
  const z = damping / (2 * Math.sqrt(stiffness * mass));
  const at = (s) => {
    if (z < 1) {
      const wd = w0 * Math.sqrt(1 - z * z);
      return 1 - Math.exp(-z * w0 * s) * (Math.cos(wd * s) + ((z * w0) / wd) * Math.sin(wd * s));
    }
    return 1 - Math.exp(-w0 * s) * (1 + w0 * s); // critically damped: fastest way to arrive without overshoot
  };
  let settle = 0.05; // last moment the spring is still more than 0.2% away from its target
  for (let s = 0; s < 4; s += 0.004) if (Math.abs(at(s) - 1) > 0.002) settle = s;
  settle += 0.02;
  return {
    /** value at `s` SECONDS after release (0 -> 1, may overshoot); lets several springs share one clock (see lib/morph.js) */
    at,
    duration: Math.round(settle * 1000),
    easing: (p) => (p <= 0 ? 0 : p >= 1 ? 1 : at(p * settle)),
    /** CSS `linear(...)` easing string approximating this spring (supported by Chromium 113+) */
    cssLinear(points = 48) {
      const v = [];
      for (let i = 0; i <= points; i++) v.push(+this.easing(i / points).toFixed(4));
      return `linear(${v.join(', ')})`;
    }
  };
}

// the three springs used by the GUI
export const BOUNCY = makeSpring({ stiffness: 460, damping: 32 });                  // things appearing: ~3% overshoot, quick
export const SNAPPY = makeSpring({ stiffness: 760, damping: 40 });                  // small details (setting rows)
export const SETTLE = makeSpring({ stiffness: 900, damping: 2 * Math.sqrt(900) });  // things leaving: no overshoot
