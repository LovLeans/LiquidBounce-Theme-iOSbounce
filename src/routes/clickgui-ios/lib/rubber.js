/**
 * iOS-style rubber band for a scroll container (Svelte action).
 *
 * Browsers on desktop just stop at the end of a list. This lets the content be pulled past the end with growing
 * resistance while the wheel / trackpad keeps pushing, and springs it back (with a small wobble) when it stops.
 *
 *   <div class="scroller" use:rubber>   <- the container that scrolls; its FIRST child is what moves
 */
export function rubber(node, { limit = 84, pull = 0.45 } = {}) {
  if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const STIFFNESS = 280, DAMPING = 24;   // slightly underdamped: one tiny bounce on the way back
  let y = 0;      // how far the content is pulled past the end (px). >0 = past the top, <0 = past the bottom
  let v = 0;      // spring velocity
  let raf = 0, last = 0, idle = 0;

  const content = () => node.firstElementChild;
  const render = () => { const c = content(); if (c) c.style.transform = y ? `translate3d(0, ${y.toFixed(2)}px, 0)` : ''; };

  function step(now) {
    const dt = Math.min(0.032, (now - last) / 1000); last = now;
    v += (-STIFFNESS * y - DAMPING * v) * dt;
    y += v * dt;
    if (Math.abs(y) < 0.15 && Math.abs(v) < 3) { y = 0; v = 0; raf = 0; render(); return; }
    render();
    raf = requestAnimationFrame(step);
  }
  function release() {
    idle = 0;
    if (!raf && y !== 0) { last = performance.now(); raf = requestAnimationFrame(step); }
  }

  function onWheel(e) {
    if (e.ctrlKey) return; // pinch-zoom gesture
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? node.clientHeight : 1);
    const max = node.scrollHeight - node.clientHeight;
    if (!dy || max <= 1) return; // nothing to scroll: leave it alone

    const atTop = node.scrollTop <= 0, atBottom = node.scrollTop >= max - 1;
    const pushingPastEnd = (atTop && dy < 0) || (atBottom && dy > 0);
    if (!pushingPastEnd && y === 0) return; // ordinary scrolling inside the list: native behaviour

    e.preventDefault();
    cancelAnimationFrame(raf); raf = 0; v = 0;

    const delta = -dy;                       // how the content wants to move
    if (y === 0 || Math.sign(delta) === Math.sign(y)) {
      const resist = Math.pow(1 - Math.min(1, Math.abs(y) / limit), 2); // gets harder the further it is pulled
      y += delta * pull * resist;
    } else {
      y += delta;                            // moving back towards the list: no resistance
      if (Math.sign(y) !== Math.sign(y - delta)) y = 0;
    }
    y = Math.max(-limit, Math.min(limit, y));
    render();
    clearTimeout(idle);
    idle = setTimeout(release, 70);          // wheel stopped -> let go
  }

  node.addEventListener('wheel', onWheel, { passive: false });
  return {
    destroy() {
      node.removeEventListener('wheel', onWheel);
      cancelAnimationFrame(raf); clearTimeout(idle);
    }
  };
}
