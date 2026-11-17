<script>
  import { untrack } from 'svelte';
  import Module from './Module.svelte';
  import { scroller } from './scroller.js';
  import { spring, retarget, createLoop } from '../../menu/title/main-menu/spring.js';   // the morphing menu's own spring engine
  import { capOvershoot, clamp01 } from './morph.js';
  import { stage } from './stageMetrics.svelte';

  // iOS springs, in the SwiftUI / UIKit parametrisation: `response` = period of the undamped spring (s), `ratio` = damping ratio
  // (1 = critically damped, no overshoot; the system `.snappy` is .85, `.smooth` is 1). Change the two lines below to retune.
  const ios = (response, ratio) => { const w = (2 * Math.PI) / response; return [w * w, 2 * ratio * w]; };
  const OPEN = ios(0.42, 0.86);    // 224 / 25.7  like .snappy: ~0.4 % overshoot (was 13 %), done in ~0.45 s
  const CLOSE = ios(0.36, 1);      // 305 / 34.9  like .smooth: no overshoot, done in ~0.4 s

  // pos = { x, y, z, collapsed } (reactive, owned by ClickGui)
  // opening = the GUI is still cascading in (ClickGui.svelte): no backdrop blurs at all until it has settled
  let { panel, pos, opening = false, onfront = () => {}, onmoved = () => {} } = $props();

  // While this window expands / collapses (the height, the list's blur and the 10 edge-blur layers all change every frame) the
  // edge-blur layers are left out, and fade back in afterwards. `quiet` is what the CSS below looks at.
  const MOVE_MS = 700;   // safety net only: `moving` normally ends as soon as the body's spring is nearly there (see hLoop)
  let moving = $state(false);
  let moveTimer = 0, lastCollapsed = untrack(() => pos.collapsed);
  $effect(() => {
    const c = pos.collapsed;   // also changes from outside (locate() in ClickGui.svelte opens a window)
    untrack(() => {
      if (c === lastCollapsed) return;
      lastCollapsed = c;
      moving = true;
      clearTimeout(moveTimer);
      moveTimer = setTimeout(() => (moving = false), MOVE_MS);
    });
  });
  $effect(() => () => clearTimeout(moveTimer));

  // ---- expand / collapse: the body's height is a spring (the morphing menu's own engine and numbers, see lib/morph.js) ----
  // A CSS transition of `grid-template-rows` can never overshoot (an `fr` track is clamped to its content), so the window used to grow
  // exactly to its size and stop. With the height in px it overshoots a little and wobbles to rest, like the morphing menu: opening uses
  // the menu's grow spring (314 / 23, ~7 % overshoot, held to ~18 px on a tall window), closing its quick, nearly critically damped one
  // (397 / 32.7). The inline `height` exists only while it moves; at rest the CSS decides (`auto` open, `0` for `.collapsed`), so a window
  // whose list changes size still fits it. A window turned around half way continues from where it is, with its speed.
  let bodyEl = $state();
  const bh = spring(0, ...OPEN);
  let hMoving = false, hFull = 0, hStart = 0, hLast = untrack(() => pos.collapsed);
  const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // How far open the window is (0..1), the one number everything else follows: the list's fade (`--open`, below) and the moment the
  // edge blurs may come back. Nothing but this spring moves while the window expands / collapses.
  const progress = () => (hFull > 0 ? clamp01(bh.p / hFull) : 1);
  const hLoop = createLoop([bh], {
    render() {
      if (!bodyEl || !hMoving) return;
      bodyEl.style.height = Math.max(0, capOvershoot(bh.p / hFull, hFull, 8) * hFull) + 'px';
      const k = progress();
      el?.style.setProperty('--open', (k * k * (3 - 2 * k)).toFixed(3));   // smoothstep: the rows come in with the edge, not after it
    },
    onFrame() {
      if (!hMoving) return;
      const left = Math.abs(bh.t - bh.p);
      // the last few percent of a spring are not visible: hand the edge blurs back then, so they fade in WITH the end of the motion
      // instead of popping in after it
      if (moving && left < hFull * 0.06 && Math.abs(bh.v) < hFull * 2.2) { moving = false; clearTimeout(moveTimer); }
      // the tail of a spring rings on below a pixel for another second: end it once it can no longer be seen
      if (left < 0.3 && Math.abs(bh.v) < 6) {
        bh.p = bh.t; bh.v = 0; hMoving = false;
        if (bodyEl) bodyEl.style.height = '';
        el?.style.removeProperty('--open');
        moving = false; clearTimeout(moveTimer);
      }
    }
  });
  // where the body is when `collapsed` changes: measured BEFORE the DOM follows (the class would already have changed its height)
  $effect.pre(() => {
    void pos.collapsed;
    untrack(() => { hStart = hMoving ? bh.p : bodyEl ? bodyEl.offsetHeight : 0; });
  });
  $effect(() => {
    const c = pos.collapsed;
    untrack(() => {
      if (c === hLast) return;
      hLast = c;
      if (!bodyEl) return;
      if (calm) { hMoving = false; bodyEl.style.height = ''; el?.style.removeProperty('--open'); return; }
      let to = 0;
      if (!c) { bodyEl.style.height = ''; to = bodyEl.offsetHeight; }   // the natural height (the class is already off, so it can be measured)
      if (!c && to < 1) { hMoving = false; return; }
      hFull = c ? Math.max(1, hStart) : to;
      bh.p = hStart;
      if (!hMoving) bh.v = 0;
      hMoving = true;
      bodyEl.style.height = hStart + 'px';
      if (c) retarget(bh, 0, ...CLOSE); else retarget(bh, to, ...OPEN);
      hLoop.kick();
    });
  });
  $effect(() => () => hLoop.stop());
  const quiet = $derived(opening || moving);
  let el = $state();
  let dragging = $state(false);
  let sx = 0, sy = 0, ox = 0, oy = 0;
  let pressed = false, moved = false;
  const DRAG_START = 4; // px the pointer has to travel before a press counts as a drag (below that it is a click)

  function down(e) {
    if (e.button !== 0) return;
    pressed = true; moved = false;
    sx = e.clientX; sy = e.clientY; ox = pos.x; oy = pos.y;   // pointer in real pixels, the position in design pixels (lib/stageMetrics.svelte.ts): see move()
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e) {
    if (!pressed) return;
    if (!moved) {
      if (Math.hypot(e.clientX - sx, e.clientY - sy) < DRAG_START * stage.s) return;
      moved = true; dragging = true;
    }
    const w = el.offsetWidth;
    // kept inside the screen while dragging, but the limits always include where the drag started: a window that is outside the current
    // (windowed / resized) screen does not jump when it is picked up, it just cannot be dragged further out
    const k = stage.s;   // real pixels per design pixel
    pos.x = Math.max(Math.min(4, ox), Math.min(ox + (e.clientX - sx) / k, Math.max(stage.w - w - 4, ox)));
    pos.y = Math.max(Math.min(4, oy), Math.min(oy + (e.clientY - sy) / k, Math.max(stage.h - 52, oy)));
  }
  function up(e) {
    if (!pressed) return;
    pressed = false;
    if (moved) { moved = false; dragging = false; onmoved(); } // it was a drag: never open / close the window
    else if (e.type === 'pointerup') toggle();                // a plain click (no movement) opens / closes it
  }
  function context(e) {
    e.preventDefault();
    pressed = false; // ctrl+click on macOS also ends in a pointerup: that must not toggle a second time
    toggle();
  }
  function toggle() { pos.collapsed = !pos.collapsed; }
</script>

<section class="panel cg-glass" class:collapsed={pos.collapsed} class:dragging class:opening class:quiet bind:this={el}
         onpointerdown={onfront}>
  <header onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}
          oncontextmenu={context}>
    <svg viewBox="0 0 16 16" aria-hidden="true">{@html panel.icon}</svg>
    <h2>{panel.name}</h2>
  </header>
  <div class="body" inert={pos.collapsed} bind:this={bodyEl}>
    <!-- lib/scroller.js: momentum, rubber band, and --edge-top / --edge-bottom (0..1) which fade the edge blur below -->
    <div class="mods" use:scroller>
      <div class="list">
        {#each panel.modules as m (m.name)}<Module module={m} />{/each}
      </div>
    </div>
    <div class="pb top" aria-hidden="true"><i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b5"></i><i class="b8"></i></div>
    <div class="pb bottom" aria-hidden="true"><i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b5"></i><i class="b8"></i></div>
  </div>
</section>

<style>
  /* The glass (tint + backdrop blur) lives on ::before, BEHIND the content. If it stayed on .panel itself,
     the edge-blur layers would blur the panel's own tint a second time and show up as a grey band. */
  .panel {
    position: relative; isolation: isolate;
    background: none; -webkit-backdrop-filter: none; backdrop-filter: none;
    --hh: 42px;    /* header height: the list runs underneath it, so the header's height is a fixed, known value */
    --fade: 48px;  /* length of the edge-blur fade (below the header at the top, above the edge at the bottom) */
    border-radius: 22px; overflow: hidden; display: flex; flex-direction: column;
    max-height: min(calc(var(--stage-h, 100vh) * .72), 680px); min-height: var(--hh);
    /* Visibility (`--in`, set on the slot by ClickGui.svelte) is applied to each layer separately and never as an `opacity` on
       the window: a parent with opacity < 1 stops the glass from blurring what is behind it. The drop shadow is drawn by the slot. */
    border-color: color-mix(in srgb, var(--cg-stroke) calc(var(--in, 1) * 100%), transparent);
    box-shadow: none;
    transition: transform .35s cubic-bezier(.2, .9, .3, 1.25), box-shadow .35s;
    transition: transform 572ms linear(0, 0.0287, 0.1022, 0.204, 0.3206, 0.4415, 0.5589, 0.6674, 0.7636, 0.8457, 0.9132, 0.9665, 1.0066, 1.0352, 1.0538, 1.0643, 1.0684, 1.0676, 1.0633, 1.0568, 1.049, 1.0407, 1.0326, 1.0249, 1.0181, 1.0121, 1.0072, 1.0033, 1.0003, 0.9981, 0.9966, 0.9958, 0.9954, 0.9953, 0.9956, 0.996, 0.9965, 0.997, 0.9976, 0.9981, 1), box-shadow .35s;   /* the morph's grow spring (lib/morph.js) */
  }
  .panel::before { content: ''; position: absolute; inset: 0; z-index: -1; border-radius: inherit;
    opacity: var(--in, 1); box-shadow: inset 0 .5px 0 rgba(255, 255, 255, .28);
    background: var(--cg-glass); }
  /* The blur is a layer of its own UNDER the tint (the result is the same as tint + blur on one element), so that it can be
     left out while the GUI is opening: the biggest cost of the opening was this blur, redone every frame for every moving window.
     While `.opening` the window is just its tint, afterwards the blur fades in (the animation only holds the start value, the
     end is the live `--in`, so a window that is already leaving is not held up by it). */
  .panel::after { content: ''; position: absolute; inset: 0; z-index: -2; border-radius: inherit; pointer-events: none;
    opacity: var(--in, 1);
    -webkit-backdrop-filter: blur(28px) saturate(1.8); backdrop-filter: blur(28px) saturate(1.8);
    animation: glass-in 380ms ease-out backwards; }
  .panel.opening::after { -webkit-backdrop-filter: none; backdrop-filter: none; animation: none; }
  @keyframes glass-in { from { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .panel::after, .pb i { animation: none !important; } }
  .panel.dragging { transform: scale(1.03); box-shadow: 0 24px 60px rgba(0, 0, 0, .45); }
  header { opacity: var(--in, 1); display: flex; justify-content: center; align-items: center; position: relative;
    height: var(--hh); box-sizing: border-box; padding: 0 12px; z-index: 3;
    cursor: grab; user-select: none; touch-action: none; flex: none; }
  .dragging header { cursor: grabbing; }
  h2 { margin: 0; font-size: 15px; font-weight: 600; }
  svg { position: absolute; left: 12px; width: 16px; height: 16px; }
  /* The height of the body is ONE spring driven from the script (above); this is only what it is at rest. There is deliberately no
     CSS transform / scale on the body: it used to ease in a second, differently timed spring (translateY + scale .97) next to the height,
     which is the stiff-then-wobbly "morph" the window did. At rest the CSS decides (`auto` open, `0` + hidden for `.collapsed`); the
     inline height of the script takes over while it moves, and `visibility` is only switched off once the close has played out. */
  .body { position: relative; display: grid; grid-template-rows: 1fr; flex: 0 1 auto; min-height: 0;
    margin-top: calc(var(--hh) * -1); /* the list starts at the very top of the window, underneath the header */
    transition: visibility 0s; }
  .collapsed .body { height: 0; visibility: hidden; pointer-events: none; transition: visibility 0s 460ms; }
  /* The list has NO fade or blur of its own. It used to fade / blur on a separate .16-.30 s timer while the body's height spring ran,
     so the window opened (or folded) and the rows faded in (or out) next to it instead of being part of it. Now the list stays as it is
     and the body, which clips it, is the only thing that moves: opening reveals the rows top to bottom as the window grows,
     closing swallows them bottom to top as it folds (see .pb below for the blur at the edges).
     (A filter or an opacity < 1 on .body itself would also make it a "backdrop root": the edge-blur layers, its children, would then
     only see the body's own content and render as a hard dark band for a few frames of every open / close. The list does not need either.) */
  @media (prefers-reduced-motion: reduce) { .collapsed .body { transition: none; } }
  /* The list is clipped here; lib/scroller.js moves its first child (.list) and owns the scroll position. */
  .mods { position: relative; min-height: 0; overflow-y: hidden; scrollbar-width: none; touch-action: none; }
  .mods::-webkit-scrollbar { display: none; }
  .list { padding: calc(var(--hh) + 2px) 8px 10px; will-change: transform; opacity: calc(var(--in, 1) * var(--open, 1)); } /* top padding = header height, so at rest nothing sits under the header */

  /* Edge blur (the iPadOS look): where content is hidden above / below, five backdrop blurs (1, 2, 3, 5, 8 px)
     fade the rows out (no tint on top: the blur shows the glass behind it, unchanged). The blurs stack (each one blurs what the previous ones already blurred), and every layer has its own
     eased mask (--s = where it is still at full strength, --e = where it is gone, smoothstep in between), so the blur
     builds up gradually instead of showing a hard band: the strongest layer ends first, the lightest one reaches furthest.
     They are siblings of .mods, so they blur the list and not themselves. scroller.js sets --edge-top / --edge-bottom (0..1)
     on .body (eased, so the blur also fades in gradually while scrolling).
     At the TOP the band is taller: --o is the header height, so it covers the header and then fades over --fade below it;
     rows that scroll under the title are blurred too. The header (z-index 3) stays crisp on top.
     Fade each <i> with ITS OWN opacity, never the .pb wrapper: a parent with opacity < 1 becomes a "backdrop root" and
     the blur inside it stops seeing the list, so it would only pop in at the end. */
  .pb { position: absolute; left: 0; right: 0; height: calc(var(--o) + var(--fade)); z-index: 2; pointer-events: none; }
  .pb.top { top: 0; --to: to bottom; --o: var(--hh); }
  .pb.bottom { bottom: 0; --to: to top; --o: 0px; }
  .pb i { position: absolute; inset: 0; }
  .pb.top i { opacity: calc(var(--edge-top, 0) * var(--in, 1)); }
  .pb.bottom i { opacity: calc(var(--edge-bottom, 0) * var(--in, 1)); }
  /* Closing: the edge blur fades out with the list. Opening: the BOTTOM layers build up while the window grows (an
     animation, not a transition, so it starts together with the class change). It only holds the START value (`from`),
     the end is the live --edge-bottom, so scrolling is never delayed.
     The blur layers of both edges are off while the GUI is opening / the window expands (`.quiet`, below) and fade in afterwards. */
  .panel.collapsed .pb i { opacity: 0; transition: opacity .24s ease-in; }
  @keyframes edge-in { from { opacity: 0; } }
  /* The 5 backdrop blurs per edge (10 per window, each with a mask) are the heaviest part of a window. While the GUI is opening
     or this window expands / collapses (`.quiet`) they are off, and when it is over they
     fade in (`edge-in` again: the start value only, the end is the live --edge-top / --edge-bottom, so scrolling is never delayed). */
  .panel.quiet .pb i { -webkit-backdrop-filter: none; backdrop-filter: none; }
  .panel:not(.collapsed):not(.quiet) .pb i { animation: edge-in .22s ease-out backwards; }
  .pb i {
    -webkit-mask-image: linear-gradient(var(--to), #000 var(--s),
      rgba(0, 0, 0, .84) calc(var(--s) + (var(--e) - var(--s)) * .25),
      rgba(0, 0, 0, .5) calc(var(--s) + (var(--e) - var(--s)) * .5),
      rgba(0, 0, 0, .16) calc(var(--s) + (var(--e) - var(--s)) * .75),
      transparent var(--e));
    mask-image: linear-gradient(var(--to), #000 var(--s),
      rgba(0, 0, 0, .84) calc(var(--s) + (var(--e) - var(--s)) * .25),
      rgba(0, 0, 0, .5) calc(var(--s) + (var(--e) - var(--s)) * .5),
      rgba(0, 0, 0, .16) calc(var(--s) + (var(--e) - var(--s)) * .75),
      transparent var(--e)); }
  .pb .b8 { --s: calc(var(--o) * .45); --e: calc(var(--o) + var(--fade) * .30); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
  .pb .b5 { --s: calc(var(--o) * .60); --e: calc(var(--o) + var(--fade) * .50); -webkit-backdrop-filter: blur(5px); backdrop-filter: blur(5px); }
  .pb .b3 { --s: calc(var(--o) * .75); --e: calc(var(--o) + var(--fade) * .72); -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); }
  .pb .b2 { --s: calc(var(--o) * .90); --e: calc(var(--o) + var(--fade) * .90); -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px); }
  .pb .b1 { --s: var(--o);             --e: calc(var(--o) + var(--fade));       -webkit-backdrop-filter: blur(1px); backdrop-filter: blur(1px); }
</style>
