<script>
  /*
   * Spring switch (the one from Toggle.svelte of the reference prototype), made usable everywhere in the theme:
   *  - `size` is the drawn width in px (the box keeps the 176:72 shape); the physics still runs in the reference's
   *    own pixels (thumb 114x64, springs 420 / 33 and 320 / 28) and is scaled with a transform, so every size feels the same.
   *  - `onchange(checked)` is called only for changes made by the user (tap, drag, Space / Enter), never for a
   *    `checked` that the parent changed.
   *  - colours come from CSS variables, so the owner can theme it: --tg-on (default #34c759), --tg-off (default #e9e9ea).
   */
  import { onMount, untrack } from 'svelte';

  let { checked = $bindable(true), label = 'Toggle', size = 176, onchange = undefined, disabled = false } = $props();

  const BW = 176, BH = 72, PAD = 4, TW = 114, TH = 64;
  const D = BW - PAD * 2 - TW; // travel of the thumb, in px
  const cMin = PAD + TW / 2;

  let el = $state();
  let reduce = false;
  const K = $derived(Math.max(0.05, size / BW));

  // Physics state (plain vars, stepped every frame).
  // x = thumb offset (0..D), p = press amount; both are springs and may overshoot.
  let x = untrack(() => (checked ? D : 0));
  let v = 0, tx = x, p = 0, pv = 0, pt = 0;
  let raf = 0, last = 0, down = false, drag = false, downAt = 0, sx0 = 0, sp = 0;
  let pend, relT;

  // Rendered copies of the physics state (what the template reacts to)
  let rx = $state(x), rv = $state(0), rp = $state(0);
  let pressed = $state(false);

  const clamp = (a, lo, hi) => Math.min(hi, Math.max(lo, a));
  const sstep = (a, b, t) => {
    t = clamp((t - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  // no room at the ends: the thumb stops, with only a tiny give
  function rb(raw) {
    const g = D * 0.09;
    const lim = (d) => g * (1 - Math.exp(-d / (D * 0.45)));
    return raw < 0 ? -lim(-raw) : raw > D ? D + lim(raw - D) : raw;
  }

  const geo = $derived.by(() => {
    const s = Math.min(Math.abs(rv) / (D * 22), 0.3); // speed -> stretch
    const sxs = 1 + rp * 0.16 + s * 0.3;
    const sys = 1 + rp * 0.1 - s * 0.1; // squash & stretch
    const W = TW * sxs, H = TH * sys;
    const cx = clamp(cMin + rx, W / 2 + 1, BW - W / 2 - 1); // a swollen thumb grows inward from the edge
    const cy = BH / 2;
    const c = sstep(0.12, 0.62, clamp(rx / D, 0, 1)); // colour turns late in the travel
    return {
      W,
      H,
      transform: `translate(${cx - W / 2}px,${cy - H / 2}px)`,
      q: clamp(rp, 0, 1).toFixed(3),
      // the colour is mixed by the browser, so the two ends can be any CSS colour (also var(--accent))
      bg: `color-mix(in srgb, var(--tg-on, #34c759) ${(c * 100).toFixed(1)}%, var(--tg-off, #e9e9ea))`
    };
  });

  function render() {
    rx = x; rv = v; rp = p;
  }

  function step(t) {
    const dt = Math.min(0.033, (t - last) / 1000 || 0.016);
    last = t;
    const k = Math.ceil(dt / 0.0042), h = dt / k;
    for (let i = 0; i < k; i++) {
      v += ((tx - x) * 420 - v * 33) * h; x += v * h;
      pv += ((pt - p) * 320 - pv * 28) * h; p += pv * h;
    }
    render();
    if (Math.abs(tx - x) > 0.04 || Math.abs(v) > 0.4 || Math.abs(pt - p) > 0.002 || Math.abs(pv) > 0.01)
      raf = requestAnimationFrame(step);
    else raf = 0;
  }
  function kick() {
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); }
  }
  // tiny beat before the thumb swells
  function squeeze() {
    clearTimeout(pend);
    pend = setTimeout(() => { pt = 1; kick(); }, 60);
  }
  function release() {
    const wait = Math.max(0, 210 - (performance.now() - downAt));
    relT = setTimeout(() => { if (!drag) { pt = 0; kick(); } }, wait);
  }

  // Snap the target to the current `checked` value and animate (or jump) there.
  function settle(pulse) {
    tx = checked ? D : 0;
    if (reduce) { x = tx; v = 0; p = pv = pt = 0; render(); return; }
    if (pulse) { downAt = performance.now(); pt = 1; release(); }
    kick();
  }

  function onpointerdown(e) {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    down = true; drag = false; downAt = performance.now();
    sx0 = e.clientX; sp = checked ? D : 0;
    pressed = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (!reduce) squeeze();
  }
  function onpointermove(e) {
    if (!down) return;
    const k = el.getBoundingClientRect().width / BW; // on-screen px per reference px (also right inside a scaled GUI)
    const dx = (e.clientX - sx0) / k;
    if (!drag && Math.abs(dx) > 3) drag = true;
    if (drag) { tx = rb(sp + dx); kick(); }
  }
  function onpointerup() {
    if (!down) return;
    down = false; pressed = false; clearTimeout(pend);
    const wasDrag = drag; drag = false;
    const was = checked;
    checked = wasDrag ? tx > D / 2 : !checked;
    if (checked !== was) onchange?.(checked);
    if (reduce) return settle(false);
    tx = checked ? D : 0;
    pt = 1; release(); kick();
  }
  function onkeydown(e) {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      checked = !checked;
      onchange?.(checked);
      settle(true);
    }
  }

  onMount(() => {
    reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(pend);
      clearTimeout(relT);
    };
  });

  // Follow external changes to `checked` (e.g. a parent resetting it)
  $effect(() => {
    const c = checked;
    untrack(() => {
      if ((c ? D : 0) !== tx && !down) settle(false);
    });
  });
</script>

<div class="tg" class:dis={disabled} style:width="{BW * K}px" style:height="{BH * K}px" style:--k={K}>
  <div
    bind:this={el}
    class="sw"
    class:drag={pressed}
    role="switch"
    aria-checked={checked}
    aria-disabled={disabled}
    aria-label={label}
    tabindex={disabled ? -1 : 0}
    style:--p={geo.q}
    style:transform="scale({K})"
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    onpointercancel={onpointerup}
    {onkeydown}
  >
    <div class="gw" style:background={geo.bg}><div class="lift"></div></div>
    <div class="th" style:width="{geo.W}px" style:height="{geo.H}px" style:transform={geo.transform}></div>
  </div>
</div>

<style>
  /* the layout box has the drawn size; the 176x72 switch inside it is scaled down with a transform */
  .tg {
    position: relative;
    flex: none;
    display: inline-block;
    vertical-align: middle;
  }
  .tg.dis { opacity: 0.4; pointer-events: none; }
  .sw {
    --p: 0;
    position: absolute;
    left: 0;
    top: 0;
    width: 176px;
    height: 72px;
    transform-origin: 0 0;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    cursor: grab;
    outline: none;
  }
  .sw.drag { cursor: grabbing; }
  .sw:focus-visible {
    outline: calc(2px / var(--k)) solid var(--tg-focus, #0a84ff);
    outline-offset: calc(3px / var(--k));
    border-radius: 36px;
  }
  /* track: static (no movement), only its colour changes. The plain colours are what is drawn if color-mix() is not available. */
  .gw {
    position: absolute;
    inset: 0;
    border-radius: 999px;
    overflow: hidden;
    background: var(--tg-off, #e9e9ea);
  }
  .sw[aria-checked='true'] .gw { background: var(--tg-on, #34c759); }
  .lift {
    position: absolute;
    inset: 0;
    background: rgba(255, 255, 255, 0.15);
    opacity: var(--p);
  }
  /* thumb: solid white pill, outlined a little more while pressed (the ring keeps its on-screen width at every size) */
  .th {
    position: absolute;
    left: 0;
    top: 0;
    border-radius: 999px;
    background: #fff;
    pointer-events: none;
    will-change: transform, width, height;
    box-shadow:
      0 0 0 calc(1px / var(--k)) rgba(0, 0, 0, calc(0.1 + var(--p) * 0.1)),
      0 calc(2px / var(--k)) 0 rgba(0, 0, 0, 0.06);
  }
</style>
