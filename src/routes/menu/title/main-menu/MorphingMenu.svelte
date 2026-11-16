<script>
  import { onMount } from 'svelte';
  import { spring, retarget, createLoop, mixRgb, clamp } from './spring.js';

  /**
   * Menu button that morphs into a menu, growing up and to the left from its corner.
   * Sizes and timings were measured from the reference recording (button = 1 unit).
   * Press-and-hold also opens it: slide to a row and release to pick it.
   */
  let {
    title = 'New Theme',
    onselect,
    icon = 'dots', // glyph on the resting button: 'dots' | 'plus'
    escape = true, // close on Escape itself; the lock-screen editor turns this off and closes it from its own onKey
    canOpen, // optional guard: return false to refuse opening (delete sheet busy, wrong page, ...)
    glass = false, // translucent tint + backdrop blur (the lock-screen look, same as PressButton's glass) instead of the solid grey
  } = $props();

  // To change the rows, edit this list (and the icon branch in the template).
  const ITEMS = [
    { id: 'photos', label: 'Photos' },
    { id: 'colors', label: 'Colors' },
  ];

  const B = 48; // resting button size
  const W = 260; // open menu width
  const HEAD = 40; // title row
  const ROW = 50; // item row
  const PAD = 10; // menu padding
  const R = 36; // open corner radius
  const N = ITEMS.length;
  const H = PAD * 2 + HEAD + N * ROW; // open menu height (160 for two rows)
  const LEAD = 0.44 * B;
  const REST = [44, 44, 46];
  const LIT = [112, 112, 118];
  const GLASS_REST = [62, 64, 76, 0.4]; // same values as PressButton's glass
  const GLASS_LIT = [104, 113, 150, 0.62];

  // ── springs ────────────────────────────────────────────────────────────────
  const w = spring(B, 420, 26);
  const h = spring(B, 420, 26);
  const lx = spring(0, 900, 60); // "lead": blob slides toward the menu, then settles back onto the corner
  const ly = spring(0, 900, 60);
  const cen = spring(1, 700, 42); // 1 = scale around the button's centre (idle / press), 0 = grow from its corner
  const press = spring(0, 520, 34);
  const dot = spring(1, 700, 44);
  const rows = ITEMS.map(() => spring(0, 340, 22)); // index 0 = bottom row, last = top row
  const hy = spring(0, 700, 38); // the highlight pill: glides between rows, fades in and out
  const ho = spring(0, 800, 50);
  const ms = spring(0, 320, 25); // the whole menu swells as one while a row is pressed
  const gx = spring(50, 500, 40); // where the light sits horizontally
  const all = [w, h, lx, ly, cen, press, dot, hy, ho, ms, gx, ...rows];

  const loop = createLoop(all, { render, onFrame });

  // ── state ──────────────────────────────────────────────────────────────────
  // $state: the template depends on these
  let phase = $state('idle'); // idle | opening | open | closing
  let expanded = $state(false);
  let triggerBlocked = $state(false);
  const interactive = $derived(phase === 'opening' || phase === 'open');

  // plain variables: only the imperative code reads these
  let anchorEl, morphEl, dotsEl, hlEl, hdrEl, triggerEl;
  const itemEls = [];
  let timers = [];
  let dotsIn = false;
  let pressed = false;
  let holdT = 0;
  let tracking = null;
  let hl = null; // DOM index of the highlighted row
  let down = null;
  let downId = null;

  function go(s, t, k, c) {
    retarget(s, t, k, c);
    loop.kick();
  }
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  // ── rendering ──────────────────────────────────────────────────────────────
  function render() {
    if (!morphEl) return;
    const k = clamp(cen.p, 0, 1); // pressed button stays exactly centred on its resting spot
    const ms_ = morphEl.style;
    ms_.width = w.p + 'px';
    ms_.height = h.p + 'px';
    ms_.right = ((B - w.p) / 2) * k + lx.p + 'px';
    ms_.bottom = ((B - h.p) / 2) * k + ly.p + 'px';
    ms_.borderRadius = Math.min(R, Math.min(w.p, h.p) / 2) + 'px';
    ms_.background = glass ? mixRgb(GLASS_REST, GLASS_LIT, press.p) : mixRgb(REST, LIT, press.p);
    ms_.transform = 'scale(' + (1 + 0.05 * ms.p) + ',' + (1 + 0.075 * ms.p) + ')';

    const s = clamp(Math.min(w.p, h.p) / B, 0, 1.6);
    hlEl.style.setProperty('--px', clamp(gx.p, 0, 100) + '%');
    hlEl.style.opacity = clamp(ho.p, 0, 1);
    hlEl.style.transform = 'translateY(' + hy.p + 'px)';
    dotsEl.style.opacity = clamp(dot.p, 0, 1);
    dotsEl.style.transform =
      'translate(' + -(w.p - B) / 2 + 'px,' + -(h.p - B) / 2 + 'px) scale(' + s + ')';

    const hq = rows[N - 1].p; // the title comes in and leaves with the top row
    hdrEl.style.opacity = clamp(hq, 0, 1);
    hdrEl.style.transform = 'translateY(' + (1 - hq) * 12 + 'px)';
    itemEls.forEach((el, j) => {
      const q = rows[N - 1 - j].p;
      el.style.opacity = clamp(q, 0, 1);
      el.style.transform = 'translateY(' + (1 - q) * 12 + 'px) scale(' + (0.92 + 0.08 * q) + ')';
    });
  }

  // runs every frame after integration, before the "keep animating?" check
  function onFrame() {
    if (phase === 'closing' && !dotsIn && w.p < B * 1.6 && h.p < B * 1.6) {
      dotsIn = true;
      go(dot, 1, 198, 22.7); // dots cross-fade in while the capsule lands
    }
    if (phase === 'closing' && w.p < B * 1.12 && h.p < B * 1.12) {
      // reached the button: hand off with velocity kept, so it lands in one smooth motion
      phase = 'idle';
      go(w, B, 248, 10.2); // underdamped landing: little jelly bounce, w and h out of phase
      go(h, B, 281, 11.5);
      go(lx, 0, 165, 10);
      go(ly, 0, 165, 10);
      go(cen, 1, 579, 38);
    }
  }

  // ── press physics on the trigger ───────────────────────────────────────────
  // touch-down swells to ~1.43x + brightens over ~120ms and holds; release squeezes to ~0.9x
  // while the brightness fades (critically damped), then springs back with a small overshoot.
  function pressDown() {
    if (phase !== 'idle' || canOpen?.() === false) return;
    pressed = true;
    clearTimers();
    if (!holdT) {
      // press-and-hold opens too; slide to a row and release to pick it
      holdT = setTimeout(() => {
        holdT = 0;
        if (pressed && phase === 'idle') {
          tracking = down ? { x: down.x, y: down.y, moved: false } : null;
          open();
        }
      }, 200);
    }
    go(press, 1, 248, 24.5);
    go(w, B * 1.43, 281, 24.5);
    go(h, B * 1.43, 281, 24.5);
  }

  function release() {
    if (phase !== 'idle' || !pressed) return; // plain hover (no press) must not animate
    pressed = false;
    clearTimeout(holdT);
    holdT = 0;
    clearTimers();
    go(press, 0, 165, 25.5);
    go(w, B * 0.9, 992, 54.5);
    go(h, B * 0.9, 992, 54.5);
    later(() => {
      if (phase === 'idle') {
        go(w, B, 347, 13.6);
        go(h, B, 347, 13.6);
      }
    }, 165);
  }

  // ── open / close ───────────────────────────────────────────────────────────
  function open() {
    if (phase !== 'idle' || canOpen?.() === false) return;
    phase = 'opening';
    expanded = true;
    triggerBlocked = true;
    pressed = false;
    clearTimeout(holdT);
    holdT = 0;
    clearTimers();
    try {
      if (downId != null) triggerEl.releasePointerCapture(downId); // touch: let moves reach the rows
    } catch {}
    go(press, 0, 165, 25.5);
    go(dot, 0, 909, 60);
    go(cen, 0, 744, 54.5); // stop centring, grow from the corner
    go(w, W, 264, 21); // flows straight out of the swell; underdamped = jelly overshoot
    go(h, H, 314, 23);
    go(lx, LEAD, 430, 32.7); // soft drift toward the menu...
    go(ly, LEAD, 430, 32.7);
    later(() => go(lx, 0, 165, 15.5), 77); // ...then back onto the corner with a little wobble
    later(() => go(ly, 0, 132, 13.6), 110);
    rows.forEach((r, i) => later(() => go(r, 1, 248, 15.5), 55 + i * 50)); // bottom row first
    later(() => {
      phase = 'open';
    }, 352);
  }

  function close() {
    if (phase !== 'open' && phase !== 'opening') return;
    phase = 'closing';
    expanded = false;
    clearTimers();
    dotsIn = false;
    go(ms, 0, 190, 13);
    rows.forEach((r, i) => later(() => go(r, 0, 397, 32.7), (N - 1 - i) * 42)); // top row leaves first
    go(lx, LEAD * 0.85, 248, 23.6);
    go(ly, LEAD * 0.85, 248, 23.6);
    go(w, B * 0.8, 314, 23.6); // width narrows first -> tall capsule
    go(h, B * 0.8, 198, 17.3); // height follows, gliding toward the button
    later(() => {
      triggerBlocked = false;
    }, 275);
  }

  // used by the lock-screen editor
  export const isOpen = () => phase === 'opening' || phase === 'open';
  export function show() {
    open();
  }
  export function hide() {
    close();
  }

  function choose(j) {
    if (phase !== 'open' && phase !== 'opening') return;
    onselect?.(ITEMS[j]);
    close();
  }

  // ── row tracking (press-hold-slide-release) ────────────────────────────────
  // returns the DOM index of the row under the pointer once the menu is grown, else null
  // (the stage is scaled to the window, so on-screen distances are k times the layout ones, k = anchor on-screen width / 48)
  function rowAt(e) {
    const a = anchorEl.getBoundingClientRect();
    const k = a.width / B || 1;
    if (
      e.clientX < a.right - (W + 6) * k ||
      e.clientX > a.right + 6 * k ||
      e.clientY < a.bottom - (H - HEAD - 4) * k ||
      e.clientY > a.bottom + 6 * k
    )
      return null;
    return Math.min(N - 1, Math.max(0, Math.floor((e.clientY - (a.bottom - (H - PAD - HEAD) * k)) / (ROW * k))));
  }

  function glow(e) {
    // the light follows the finger sideways
    const a = anchorEl.getBoundingClientRect();
    const k = a.width / B || 1;
    const x = clamp(((e.clientX - (a.right - (W - PAD) * k)) / ((W - 2 * PAD) * k)) * 100, 0, 100);
    if (hl === null && ho.p < 0.05) {
      gx.p = gx.t = x;
      gx.v = 0;
    } else go(gx, x);
  }

  function setHl(j) {
    // the grey bar follows the row under the pointer
    if (hl === j) return;
    const was = hl;
    hl = j;
    if (j === null) {
      // let go or left the menu: fade out
      go(ho, 0, 220, 26);
      go(ms, 0, 190, 13);
      return;
    }
    const y = PAD + HEAD + j * ROW; // pill fills the row; 26px corners are concentric with the menu's 36px corners
    if (was === null && ho.p < 0.05) {
      hy.p = hy.t = y; // fresh press: appear on the row, no slide-in
      hy.v = 0;
    } else go(hy, y, 700, 38); // switching rows: glide over
    go(ho, 1, 800, 50);
    go(ms, 1, 320, 25);
  }

  function endTrack(e, cancelled) {
    // releasing over a row picks it
    if (!tracking) return;
    const t = tracking;
    tracking = null;
    const sel = !cancelled && t.moved ? rowAt(e) : null;
    setHl(null);
    if (sel !== null) choose(sel);
  }

  // ── document-level handlers ────────────────────────────────────────────────
  function onDocPointerMove(e) {
    if (!tracking) return;
    if (!tracking.moved) {
      // after a hold-open the finger still sits on the button: only start once it really moves
      if (Math.hypot(e.clientX - tracking.x, e.clientY - tracking.y) < 10) return;
      tracking.moved = true;
    }
    glow(e);
    setHl(rowAt(e));
  }

  function onDocPointerDown(e) {
    if (phase !== 'open' && phase !== 'opening') return;
    // a row, or where one will be before the menu has grown there
    const rowEl = e.target.closest?.('[data-row]');
    const j = rowEl ? Number(rowEl.dataset.row) : phase === 'opening' ? rowAt(e) : null;
    if (j !== null) {
      tracking = { x: e.clientX, y: e.clientY, moved: true };
      glow(e);
      setHl(j);
      return;
    }
    if (morphEl.contains(e.target)) return;
    if (phase === 'opening') {
      // taps on the area the menu hasn't grown into yet do nothing
      const a = anchorEl.getBoundingClientRect();
      const k = a.width / B || 1;
      if (
        e.clientX >= a.right - W * k &&
        e.clientX <= a.right &&
        e.clientY >= a.bottom - H * k &&
        e.clientY <= a.bottom
      )
        return;
    }
    close();
  }

  // ── trigger handlers ───────────────────────────────────────────────────────
  function onTriggerDown(e) {
    if (e.button === 0 || e.pointerType !== 'mouse') {
      down = { x: e.clientX, y: e.clientY };
      downId = e.pointerId;
      pressDown();
    }
  }
  function onTriggerUp() {
    if (phase === 'idle' && pressed) open();
  }
  function onTriggerKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      down = null;
      pressDown();
    }
  }
  function onTriggerKeyUp(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  }

  onMount(() => {
    render();
    return () => {
      loop.stop();
      clearTimers();
      clearTimeout(holdT);
    };
  });
</script>

<svelte:document
  onpointermove={onDocPointerMove}
  onpointerup={(e) => endTrack(e, false)}
  onpointercancel={(e) => endTrack(e, true)}
  onpointerdown={onDocPointerDown}
  onkeydown={(e) => escape && e.key === 'Escape' && close()}
/>

<!-- anchor = the button's resting box (48x48). The menu grows up and to the left from its bottom-right corner. -->
<div class="anchor" bind:this={anchorEl}>
  <div class="morph" class:glass bind:this={morphEl}>
    <div
      class="menu"
      role="menu"
      aria-label="Menu"
      style:width="{W}px"
      style:height="{H}px"
      style:visibility={phase === 'idle' ? 'hidden' : 'visible'}
    >
      <div class="hl" bind:this={hlEl}></div>
      <div class="hdr" role="presentation" bind:this={hdrEl}>{title}</div>
      {#each ITEMS as item, j (item.id)}
        <button
          class="item"
          type="button"
          role="menuitem"
          data-row={j}
          bind:this={itemEls[j]}
          style:pointer-events={interactive ? 'auto' : 'none'}
          onclick={() => choose(j)}
        >
          {#if item.id === 'photos'}
            <svg viewBox="0 0 24 24">
              <rect x="3.5" y="4.5" width="17" height="15" rx="3.2" />
              <circle cx="9" cy="10" r="1.6" />
              <path d="M4 17l4.6-4.4a1.6 1.6 0 0 1 2.2 0L14 15.5l2-1.9a1.6 1.6 0 0 1 2.2 0L20.5 16" />
            </svg>
          {:else}
            <svg viewBox="0 0 24 24">
              <path
                d="M12 3.5a8.5 8.5 0 1 0 0 17c1.3 0 1.9-.9 1.9-1.8 0-1.4-1.3-1.6-1.3-2.9 0-1 .8-1.7 1.9-1.7H16a4.5 4.5 0 0 0 4.5-4.5C20.5 5.8 16.8 3.5 12 3.5z"
              />
              <circle cx="7.8" cy="11" r=".9" />
              <circle cx="10.6" cy="7.6" r=".9" />
              <circle cx="15" cy="7.8" r=".9" />
            </svg>
          {/if}
          {item.label}
        </button>
      {/each}
    </div>
    <div class="dots" bind:this={dotsEl}>
      {#if icon === 'plus'}
        <svg class="plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
      {:else}
        <i></i><i></i><i></i>
      {/if}
    </div>
  </div>
  <button
    class="trigger"
    type="button"
    bind:this={triggerEl}
    aria-label={icon === 'plus' ? title : 'More'}
    aria-haspopup="menu"
    aria-expanded={expanded}
    style:pointer-events={triggerBlocked ? 'none' : null}
    onpointerdown={onTriggerDown}
    onpointerup={onTriggerUp}
    onpointerleave={release}
    onpointercancel={release}
    onkeydown={onTriggerKeyDown}
    onkeyup={onTriggerKeyUp}
  ></button>
</div>

<style>
  .anchor {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 48px;
    height: 48px;
  }

  .morph {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 48px;
    height: 48px;
    border-radius: 24px;
    background: #2c2c2e;
    overflow: hidden;
    will-change: width, height, right, bottom;
  }

  /* the blur needs no ancestor with opacity < 1 (a fade belongs on .morph itself); --glass-* come from .lb-menu */
  .morph.glass {
    -webkit-backdrop-filter: blur(28px) saturate(1.8);
    backdrop-filter: blur(28px) saturate(1.8);
    box-shadow:
      var(--glass-edge, inset 0 0 0 1px rgba(255, 255, 255, 0.12)),
      var(--glass-lift, 0 1px 2px rgba(0, 0, 0, 0.18), 0 8px 22px rgba(0, 0, 0, 0.22));
  }

  .trigger {
    position: absolute;
    right: -14px;
    bottom: -14px;
    width: 76px;
    height: 76px;
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    border-radius: 50%;
    cursor: pointer;
    touch-action: manipulation;
    outline: none;
    z-index: 3;
  }

  .anchor:has(.trigger:focus-visible) .morph {
    box-shadow: 0 0 0 3px #fff, 0 0 0 5px #0a84ff;
  }

  .dots {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    pointer-events: none;
    z-index: 2;
  }

  .dots .plus {
    width: 22px;
    height: 22px;
    fill: none;
    stroke: #fff;
    stroke-width: 1.9;
    stroke-linecap: round;
  }

  .dots i {
    width: 4.5px;
    height: 4.5px;
    border-radius: 50%;
    background: #fff;
    display: block;
  }

  .menu {
    position: absolute;
    right: 0;
    bottom: 0;
    padding: 10px;
    display: flex;
    flex-direction: column;
    z-index: 1;
    pointer-events: none;
  }

  .item {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 18px;
    border: 0;
    border-radius: 26px;
    background: transparent;
    color: #fff;
    font-family: inherit;
    font-size: 18px;
    font-weight: 500;
    line-height: 1;
    text-align: left;
    opacity: 0;
    transform-origin: 100% 100%;
    outline: none;
    touch-action: manipulation;
    transition: background-color 0.4s ease;
  }

  .hl {
    position: absolute;
    left: 10px;
    right: 10px;
    top: 0;
    height: 50px;
    border-radius: 26px;
    background: radial-gradient(
      130% 160% at var(--px, 50%) 50%,
      rgba(255, 255, 255, 0.22),
      rgba(255, 255, 255, 0.07) 75%
    );
    opacity: 0;
    pointer-events: none;
    will-change: transform, opacity;
  }

  .hdr {
    flex: none;
    height: 40px;
    display: flex;
    align-items: center;
    padding: 0 18px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.01em;
    opacity: 0;
    pointer-events: none;
  }

  .item svg {
    width: 24px;
    height: 24px;
    flex: none;
    fill: none;
    stroke: #fff;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
