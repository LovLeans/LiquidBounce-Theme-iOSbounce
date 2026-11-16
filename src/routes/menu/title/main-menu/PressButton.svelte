<script>
  import { onMount } from 'svelte';
  import { spring, retarget, createLoop, mixRgb } from './spring.js';

  /**
   * A round / pill button with the press physics: touch-down swells and brightens,
   * release squeezes to ~0.9 while the brightness fades, then springs back.
   * `width` is read once at mount (the springs are built around it).
   * `glass`: translucent tint + backdrop blur (the lock-screen look) instead of the solid colour.
   * `danger` (with `glass`): the same glass tinted red (the delete sheet's Cancel).
   */
  let { width = 48, label, onpress, glass = false, danger = false, children } = $props();

  const H = 48;
  const SWELL = H * 0.43;
  const SQUEEZE = H * 0.1;
  const REST = [53, 58, 81];
  const LIT = [104, 113, 150];
  // glass: the tint stays translucent so the backdrop blur shows through, and the press brightens it
  const GLASS_REST = [62, 64, 76, 0.4];
  const GLASS_LIT = [104, 113, 150, 0.62];
  // red glass: still translucent (the blur shows through), strong enough to read as the destructive colour on the dark sheet
  const DANGER_REST = [255, 69, 58, 0.86];
  const DANGER_LIT = [255, 108, 98, 0.95];

  // svelte-ignore state_referenced_locally
  const W = width;

  const w = spring(W, 420, 26);
  const h = spring(H, 420, 26);
  const pr = spring(0, 520, 34);
  const loop = createLoop([w, h, pr], { render });

  let capEl;
  let icEl;
  let pressed = false;
  let timer = 0;

  function go(s, t, k, c) {
    retarget(s, t, k, c);
    loop.kick();
  }

  function render() {
    if (!capEl) return;
    const s = capEl.style;
    s.width = w.p + 'px';
    s.height = h.p + 'px';
    s.left = (W - w.p) / 2 + 'px';
    s.top = (H - h.p) / 2 + 'px';
    s.borderRadius = Math.max(0, Math.min(w.p, h.p) / 2) + 'px';
    s.background = glass
      ? danger
        ? mixRgb(DANGER_REST, DANGER_LIT, pr.p)
        : mixRgb(GLASS_REST, GLASS_LIT, pr.p)
      : mixRgb(REST, LIT, pr.p);
    icEl.style.transform = 'scale(' + w.p / W + ')';
  }

  function down() {
    pressed = true;
    clearTimeout(timer);
    go(pr, 1, 248, 24.5);
    go(w, W + SWELL, 281, 24.5);
    go(h, H + SWELL, 281, 24.5);
  }

  function up() {
    if (!pressed) return;
    pressed = false;
    clearTimeout(timer);
    go(pr, 0, 165, 25.5);
    go(w, W - SQUEEZE, 992, 54.5);
    go(h, H - SQUEEZE, 992, 54.5);
    timer = setTimeout(() => {
      if (!pressed) {
        // critically damped (c = 2 * sqrt(k)): the old 13.6 overshot the rest size by ~1.4 px and wobbled for ~1 s after release
        go(w, W, 347, 37.3);
        go(h, H, 347, 37.3);
      }
    }, 165);
  }

  const isOver = (e) => document.elementFromPoint(e.clientX, e.clientY) === e.currentTarget;

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    down();
  }

  function onPointerUp(e) {
    if (!pressed) return;
    const inside = isOver(e);
    up();
    if (inside) onpress?.();
  }

  // touch keeps the pointer captured: release once the finger leaves the button
  function onPointerMove(e) {
    if (pressed && !isOver(e)) up();
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!e.repeat) down();
    }
  }

  function onKeyUp(e) {
    if ((e.key === 'Enter' || e.key === ' ') && pressed) {
      e.preventDefault();
      up();
      onpress?.();
    }
  }

  onMount(() => {
    render();
    return () => {
      loop.stop();
      clearTimeout(timer);
    };
  });
</script>

<div class="slot" style:width="{width}px">
  <div class="cap" class:glass bind:this={capEl} style:width="{width}px">
    <div
      class="ic"
      bind:this={icEl}
      style:width="{width}px"
      style:margin-left="{-width / 2}px"
    >
      {@render children?.()}
    </div>
  </div>
  <button
    class="hit"
    type="button"
    aria-label={label}
    onpointerdown={onPointerDown}
    onpointerup={onPointerUp}
    onpointermove={onPointerMove}
    onpointerleave={up}
    onpointercancel={up}
    onkeydown={onKeyDown}
    onkeyup={onKeyUp}
  ></button>
</div>

<style>
  .slot {
    position: relative;
    height: 48px;
    flex: none;
  }

  .cap {
    position: absolute;
    left: 0;
    top: 0;
    height: 48px;
    border-radius: 24px;
    background: #353a51;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.17);
    pointer-events: none;
    will-change: width, height, left, top;
  }

  /* the same glass as the other lock-screen controls (--glass-* come from .lb-menu); the blur needs no ancestor with opacity < 1 */
  .cap.glass {
    -webkit-backdrop-filter: blur(28px) saturate(1.8);
    backdrop-filter: blur(28px) saturate(1.8);
    box-shadow:
      var(--glass-edge, inset 0 0 0 1px rgba(255, 255, 255, 0.12)),
      var(--glass-lift, 0 1px 2px rgba(0, 0, 0, 0.18), 0 8px 22px rgba(0, 0, 0, 0.22));
  }

  .ic {
    position: absolute;
    left: 50%;
    top: 50%;
    height: 48px;
    margin-top: -24px;
    will-change: transform;
  }

  /* icon content comes from the parent's snippet, so reach it with :global */
  .ic :global(svg) {
    position: absolute;
    fill: none;
    stroke: #fff;
    stroke-linecap: round;
    stroke-linejoin: round;
    display: block;
  }

  .hit {
    position: absolute;
    inset: -5px;
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    outline: none;
    cursor: pointer;
    touch-action: manipulation;
    z-index: 2;
  }

  .slot:has(.hit:focus-visible) .cap.glass {
    box-shadow:
      var(--glass-edge, inset 0 0 0 1px rgba(255, 255, 255, 0.12)),
      0 0 0 3px #fff,
      0 0 0 5px #0a84ff;
  }

  .slot:has(.hit:focus-visible) .cap {
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.17),
      0 0 0 3px #fff,
      0 0 0 5px #0a84ff;
  }
</style>
