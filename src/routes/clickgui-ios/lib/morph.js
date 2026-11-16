/**
 * The "morph" feel, in one place.
 *
 * This is the motion of the morphing menu (menu/title/main-menu/MorphingMenu.svelte: the lock-screen +, and the Add Component pill of
 * the HUD editor): underdamped springs, so every size overshoots a little and wobbles to rest ("jelly"), and closing is quicker and
 * nearly critically damped. The contents are NOT animated on a clock of their own: they sit in the surface and are revealed by its moving
 * edge (transitions.js `drawer`, Panel.svelte), so the surface and what is in it are one motion. The numbers below are
 * the menu's own (stiffness / damping pairs of its `go(...)` calls); the ClickGUI's drawers, windows and tab pages use these instead of
 * their own springs, so the whole GUI moves the same way. To make everything jellier or tighter, change them HERE.
 *
 *   zeta = damping / (2 * sqrt(stiffness)):  < 1 overshoots,  ~0.65 = 7 % overshoot (sizes),  ~0.5 = 17 % (content),  ~0.8 = barely
 */
import { makeSpring } from './spring.js';

const sp = (stiffness, damping) => makeSpring({ stiffness, damping });

/** the stiffness / damping pairs, for code that integrates its own springs (lib/pageMorph.js: it needs to retarget a spring that is already moving) */
export const K = {
  grow: [314, 23],     // height of a growing surface (the menu's `h`)                  zeta .65
  widen: [264, 21],    // width of a growing surface (the menu's `w`)                   zeta .65
  pop: [248, 15.5],    // content popping in (the menu's rows)                          zeta .49
  fold: [397, 32.7],   // height of a closing surface (the menu's closing rows)         zeta .82
  narrow: [500, 36],   // the width narrows first when something closes ("tall capsule") zeta .80
  // big surfaces (a page, a window): the springs of the multiplayer dialogs (ExpandWindow motion="morph"); the menu's own are too snappy there
  pageW: [150, 17.5],
  pageH: [170, 18.5],
};

export const MORPH = {
  grow: sp(...K.grow),
  widen: sp(...K.widen),
  pop: sp(...K.pop),
  fold: sp(...K.fold),
  narrow: sp(...K.narrow),
  pageW: sp(...K.pageW),
  pageH: sp(...K.pageH),
};

/** seconds a spring needs until it stays within `tol` of its target (a looser test than makeSpring's 0.2 % so that the tail of a long ringing is not waited for) */
export function settleSeconds(spring, tol = 0.006) {
  let last = 0.05;
  for (let s = 0; s < 3; s += 0.004) if (Math.abs(spring.at(s) - 1) > tol) last = s;
  return last + 0.02;
}

/** the spring's value `s` seconds after the start: 0 before it starts, exactly 1 once it has settled (`done` = settleSeconds) */
export function val(spring, s, done) {
  return s <= 0 ? 0 : s >= done ? 1 : spring.at(s);
}

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Soft limit for an overshoot measured in px: 7 % of a 60 px drawer is 4 px (kept as it is), 7 % of a 600 px window would be 42 px
 * (held to about `cap`). `f` is the size as a fraction of its full size (1 = full), `full` the full size in px.
 */
export function capOvershoot(f, full, cap = 14) {
  if (f <= 1 || full <= 0) return f;
  return 1 + (cap * Math.tanh(((f - 1) * full) / cap)) / full;
}

/** settle times (seconds) of the springs above, with the tolerance each one needs: 1 % of a 200 px drawer is 2 px, 3 % of a 12 px travel a third of a pixel */
export const T = {
  grow: settleSeconds(MORPH.grow, 0.01),
  widen: settleSeconds(MORPH.widen, 0.01),
  pop: settleSeconds(MORPH.pop, 0.03),
  fold: settleSeconds(MORPH.fold, 0.01),
  narrow: settleSeconds(MORPH.narrow, 0.01)
};
