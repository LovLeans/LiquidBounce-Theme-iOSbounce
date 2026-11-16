/**
 * iOS-style scrolling for a list (Svelte action).
 *
 * Ported from the iPadOS menu prototype ("Select World" list). Native scrolling is switched off and this file owns the
 * scroll position, which is what makes the following possible:
 *
 *   - wheel / trackpad: every delta is an impulse that is slowed down by friction. A delta of d px glides exactly d px,
 *     so it still feels 1:1, but it is smooth instead of stepping.
 *   - momentum carries into the ends of the list and the edge spring catches it (rubber band). The spring gets
 *     stiffer the further the list is pulled, and it is critically damped: it eases back without wobbling.
 *   - touch: the content follows the finger, rubber-bands past the ends and keeps its velocity when released.
 *   - the edge blur is driven from here: it sets `--edge-top` and `--edge-bottom` (0..1: how much content is hidden
 *     above / below) on the PARENT of the scrolling box. CSS does the rest, see Panel.svelte.
 *   - `scrollTo(node, y)` glides to a position (used by "locate" in the search); `scrollTo(node, y, true)` jumps there at once.
 *   - optional `use:scroller={{ onscroll }}`: `onscroll()` is called every time the list has moved (wheel, momentum, rubber band, scrollTo),
 *     for lists whose rows react to a pointer that stands still while the content moves under it (the Add Component menu's hover light).
 *
 *   <div class="body">                  <- gets --edge-top / --edge-bottom
 *     <div class="mods" use:scroller>   <- the box that clips; its FIRST child is what moves
 *       <div class="list">...</div>
 *     </div>
 *   </div>
 *
 * With `prefers-reduced-motion` the browser's own scrolling is kept (no momentum, no rubber band); the edge variables still work.
 */

const FRICTION = 7;        // 1/s. Velocity decays as e^(-7t), so total glide = impulse / 7 = the wheel delta
const SPRING_K = 140;      // edge spring stiffness
const SPRING_C = 24;       // edge spring damping (about critical for K = 140, no bounce)
const SPRING_SOFTEN = 75;  // the spring stiffens by (1 + overscroll / 75): more resistance the further it is pulled
const MAX_OVER = 150;      // hard limit of the overscroll in px
const WHEEL_MAX_V = 7000;  // px/s
const WHEEL_RESIST = 36;   // a wheel impulse that pushes further past the end is divided by (1 + overscroll / 36)
const FLING_MAX_V = 5000;  // px/s
const TOUCH_PULL = 0.55;   // finger movement past the end counts for 55% ...
const TOUCH_RESIST = 48;   // ... and is divided by (1 + overscroll / 48)
const GOTO_K = 170;        // scrollTo(): critically damped spring towards the target
const GOTO_C = 2 * Math.sqrt(GOTO_K);

// edge blur: nothing within 4 px of an end, full strength 22 px later
const EDGE_DEAD = 4;
const EDGE_RAMP = 26;
// top: the list runs under the window header, so content is hidden there from the first pixel on -> start at once, ramp quickly
const TOP_DEAD = 0;
const TOP_RAMP = 16;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (t) => t * t * (3 - 2 * t); // smoothstep: the blur eases in and out instead of ramping linearly
const overOf = (p, m) => (p < 0 ? p : p > m ? p - m : 0); // signed distance past the nearest end
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const registry = new WeakMap(); // node -> { to(y) }

/** Glide to scroll position `y` (px from the top of the content), or jump there at once with `instant`. Falls back to the native scroll. */
export function scrollTo(node, y, instant = false) {
  const s = registry.get(node);
  if (s) s.to(y, instant);
  else node.scrollTo({ top: y, behavior: instant ? 'auto' : 'smooth' });
}

export function scroller(node, opts) {
  const inner = node.firstElementChild;
  const host = node.parentElement;
  if (!inner || !host) return {};

  let lastTop = -1, lastBottom = -1;
  /** publish how much content is hidden above / below (0..1 each) as CSS variables; only writes when a value changed */
  function fade(pos, m) {
    const top = m <= 0 ? 0 : smooth(clamp((pos - TOP_DEAD) / TOP_RAMP, 0, 1));
    const bottom = m <= 0 ? 0 : smooth(clamp((m - pos - EDGE_DEAD) / EDGE_RAMP, 0, 1));
    if (top !== lastTop) { lastTop = top; host.style.setProperty('--edge-top', top.toFixed(3)); }
    if (bottom !== lastBottom) { lastBottom = bottom; host.style.setProperty('--edge-bottom', bottom.toFixed(3)); }
  }

  // ---------------------------------------------------------------------------------------------- reduced motion
  if (reduced()) {
    node.style.overflowY = 'auto';
    const paint = () => { fade(node.scrollTop, node.scrollHeight - node.clientHeight); opts?.onscroll?.(); };
    node.addEventListener('scroll', paint, { passive: true });
    const ro = new ResizeObserver(paint);
    ro.observe(node); ro.observe(inner);
    registry.set(node, { to: (y) => node.scrollTo({ top: y, behavior: 'auto' }) });
    paint();
    return {
      destroy() { ro.disconnect(); node.removeEventListener('scroll', paint); registry.delete(node); }
    };
  }

  // ---------------------------------------------------------------------------------------------- the engine
  node.style.overflowY = 'hidden';

  let pos = 0;         // scroll position in px. < 0: pulled past the top, > max: pulled past the bottom
  let vel = 0;         // px/s
  let target = null;   // scrollTo() goal
  let dragging = false;
  let raf = 0, last = 0;
  let suppressClick = false, suppressTimer = 0;

  const max = () => Math.max(0, inner.offsetHeight - node.clientHeight);

  function paint() {
    inner.style.transform = `translate3d(0, ${(-pos).toFixed(2)}px, 0)`;
    fade(pos, max());
    opts?.onscroll?.();
  }

  function tick(now) {
    raf = 0;
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = 0.016;
    if (dt > 0.05) dt = 0.05; // a stalled frame must not catapult the list
    if (dragging) return;

    const m = max();
    if (m <= 0) {
      pos = 0; vel = 0; target = null;
    } else {
      if (target !== null) target = clamp(target, 0, m);
      const h = dt / 2; // two sub-steps per frame keep the spring stable
      for (let i = 0; i < 2; i++) {
        const ov = overOf(pos, m);
        if (ov !== 0) {
          vel += (-SPRING_K * ov * (1 + Math.abs(ov) / SPRING_SOFTEN) - SPRING_C * vel) * h;
          pos += vel * h;
        } else if (target !== null) {
          vel += (-GOTO_K * (pos - target) - GOTO_C * vel) * h;
          pos += vel * h;
        } else {
          const decay = Math.exp(-FRICTION * h); // exact free glide
          pos += (vel * (1 - decay)) / FRICTION;
          vel *= decay;
        }
      }
      if (pos < -MAX_OVER) { pos = -MAX_OVER; if (vel < 0) vel = 0; }
      if (pos > m + MAX_OVER) { pos = m + MAX_OVER; if (vel > 0) vel = 0; }
    }

    let done = false;
    if (target !== null) {
      if (Math.abs(pos - target) < 0.4 && Math.abs(vel) < 8) { pos = target; vel = 0; target = null; done = true; }
    } else if (Math.abs(vel) < 6 && Math.abs(m <= 0 ? 0 : overOf(pos, m)) < 0.25) {
      pos = clamp(pos + vel / FRICTION, 0, m); // let the remaining glide finish at once
      vel = 0;
      done = true;
    }
    paint();
    if (!done) raf = requestAnimationFrame(tick);
  }
  const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };

  // ---------------------------------------------------------------------------------------------- wheel / trackpad
  function onWheel(e) {
    if (e.ctrlKey) return; // pinch-zoom gesture
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;
    else if (e.deltaMode === 2) dy *= node.clientHeight;
    if (!dy) return;
    const m = max();
    if (m <= 0) return; // nothing to scroll: leave the event alone
    e.preventDefault();
    if (dragging) return;
    target = null;
    let impulse = dy * FRICTION;
    const ov = overOf(pos, m);
    if (ov * dy > 0) impulse /= 1 + Math.abs(ov) / WHEEL_RESIST; // pushing further past the end: more resistance
    vel = clamp(vel + impulse, -WHEEL_MAX_V, WHEEL_MAX_V);
    kick();
  }

  // ---------------------------------------------------------------------------------------------- touch
  let ty = 0, tTime = 0, tVel = 0, tMoved = 0, tOn = false;
  function onTouchStart(e) {
    if (e.touches.length !== 1) return;
    // sliders and text fields handle their own touch drag
    if (e.target instanceof Element && e.target.closest('input, textarea, select')) { tOn = false; return; }
    tOn = true; dragging = true; target = null;
    stop();
    ty = e.touches[0].clientY; tTime = performance.now(); tVel = 0; tMoved = 0; vel = 0;
  }
  function onTouchMove(e) {
    if (!tOn) return;
    const y = e.touches[0].clientY;
    const d = ty - y; // finger up = content up = position grows
    ty = y;
    const now = performance.now();
    const dt = Math.max(0.004, (now - tTime) / 1000);
    tTime = now;
    tMoved += Math.abs(d);
    tVel = 0.65 * tVel + 0.35 * (d / dt);
    const m = max();
    if (m <= 0) return;
    if (e.cancelable) e.preventDefault();
    const ov = overOf(pos, m);
    pos += ov * d > 0 ? (d * TOUCH_PULL) / (1 + Math.abs(ov) / TOUCH_RESIST) : d;
    paint();
  }
  function onTouchEnd() {
    if (!tOn) return;
    tOn = false; dragging = false;
    if (tMoved > 8) { // it was a drag, not a tap: swallow the click that follows
      suppressClick = true;
      clearTimeout(suppressTimer);
      suppressTimer = setTimeout(() => { suppressClick = false; }, 350);
    }
    const idle = performance.now() - tTime;
    vel = idle > 90 ? 0 : clamp(tVel * 1.4, -FLING_MAX_V, FLING_MAX_V); // finger stopped before lifting: no fling
    kick();
  }
  function onClick(e) { if (suppressClick) { e.stopPropagation(); e.preventDefault(); } }

  // ---------------------------------------------------------------------------------------------- native scroll
  // Keyboard focus (Tab) and scrollIntoView can still scroll the hidden-overflow box: fold that into our position.
  function onScroll() {
    const s = node.scrollTop;
    if (s) {
      node.scrollTop = 0;
      pos = clamp(pos + s, 0, max());
      vel = 0; target = null;
      paint();
    }
    if (node.scrollLeft) node.scrollLeft = 0;
  }

  // content or box changed size (settings drawer opening / closing, window collapsing, ...)
  const ro = new ResizeObserver(() => {
    const m = max();
    if (pos > m && !raf) pos = Math.max(0, m); // list got shorter while resting at the bottom: stay anchored to the bottom
    paint();
  });

  registry.set(node, {
    to(y, instant) {
      if (instant) { stop(); pos = clamp(y, 0, max()); vel = 0; target = null; paint(); return; }
      target = Math.max(0, y); kick();
    }
  });

  node.addEventListener('wheel', onWheel, { passive: false });
  node.addEventListener('touchstart', onTouchStart, { passive: true });
  node.addEventListener('touchmove', onTouchMove, { passive: false });
  node.addEventListener('touchend', onTouchEnd);
  node.addEventListener('touchcancel', onTouchEnd);
  node.addEventListener('scroll', onScroll);
  node.addEventListener('click', onClick, true);
  ro.observe(node); ro.observe(inner);
  paint();

  return {
    destroy() {
      stop(); clearTimeout(suppressTimer); ro.disconnect(); registry.delete(node);
      node.removeEventListener('wheel', onWheel);
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchmove', onTouchMove);
      node.removeEventListener('touchend', onTouchEnd);
      node.removeEventListener('touchcancel', onTouchEnd);
      node.removeEventListener('scroll', onScroll);
      node.removeEventListener('click', onClick, true);
      inner.style.transform = '';
    }
  };
}
