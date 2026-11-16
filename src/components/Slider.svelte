<script>
  /*
   * Spring slider (the one from Slider.svelte of the reference prototype), made usable everywhere in the theme.
   * Same engine as the tab bars: the thumb sits on a soft spring (290 / 19) that chases the finger, so it lags,
   * overshoots the ends and wobbles to a stop; its width stretches with speed, and pressing swells it on a second
   * spring (185 / 14.5). The track itself never moves. Units are the reference recording's pixels (track 746 wide,
   * thumb 84x50), scaled by K when drawn.
   *
   * What was added for the game:
   *  - real values: `min`, `max`, `step` (the prototype was 0..100 in whole percents). A slider with few steps (up to 24)
   *    snaps the thumb from step to step while it is dragged; one with many steps follows the finger and lands on the
   *    nearest step when it is released.
   *  - `width`: drawn width in px, or leave it out to fill the parent (measured, follows resizes).
   *  - `big`: thumb size factor (1 = the reference). The track keeps its length, so a short track can have a bigger thumb.
   *  - `oninput(value)`: only for changes made by the user. `ondone()`: the pointer / key was released.
   *  - `track`: a CSS background for the track (a colour gradient); the blue fill is hidden then.
   *  - `disabled`.
   *  - colours come from CSS variables: --sl-track (#e9e9ea), --sl-fill (#0091ff), --sl-focus (#0a84ff).
   */
  import { onMount, untrack } from 'svelte';

  let {
    value = $bindable(34),
    min = 0,
    max = 100,
    step = 1,
    label = 'Slider',
    width = undefined,
    big = 1,
    oninput = undefined,
    ondone = undefined,
    track = undefined,
    disabled = false
  } = $props();

  const UW = 746, TK = 13, TW0 = 84, TH0 = 50, CH = 64;
  const TW = $derived(TW0 * big);
  const TH = $derived(TH0 * big);
  // LO / HI = thumb-centre travel
  const LO = $derived(TW / 2); // the thumb's edge sits at the box's edge at both ends
  const HI = $derived(UW - LO);
  const TRAVEL = $derived(HI - LO);

  const clamp = (a, lo, hi) => Math.min(hi, Math.max(lo, a));

  // ---- value <-> position ----
  const span = $derived(Math.max(1e-9, max - min));
  const dec = $derived(Math.min(8, (String(step).split('.')[1] || '').length));
  const coarse = $derived(step > 0 && span / step <= 24);
  const snapV = (val) => {
    let r = step > 0 ? min + Math.round((val - min) / step) * step : val;
    r = clamp(r, min, max);
    return step > 0 ? +r.toFixed(dec) : r;
  };
  const posOf = (val) => LO + (TRAVEL * (clamp(val, min, max) - min)) / span;
  const valOf = (c) => snapV(min + ((clamp(c, LO, HI) - LO) / TRAVEL) * span);

  // No measuring: the box is `width: 100%` with the track's aspect ratio, and everything inside is placed in percent of it,
  // so the size is right at once and also inside a zoomed / scaled layer.
  let el = $state(); // the slider itself
  let reduce = false;
  const pw = (u) => `${(u / UW) * 100}%`; // reference units -> percent of the width
  const ph = (u) => `${(u / CH) * 100}%`; // ... of the height
  const ptk = (u) => `${(clamp(u, 0, TRAVEL) / TRAVEL) * 100}%`; // ... of the track (the thumb-centre travel)

  // tx = where the finger wants the thumb (centre, may exceed the ends a hair)
  let tx = untrack(() => posOf(value));
  let x = tx, v = 0, p = 0, pv = 0, pt = 0;
  let raf = 0, last = 0, down = false, off = 0, downAt = 0, pend;

  let rx = $state(x), rv = $state(0), rp = $state(0);
  let pressed = $state(false);

  // no room at the ends: the thumb stops, with only a tiny give
  function rb(raw) {
    const g = TW * 0.09;
    const lim = (d) => g * (1 - Math.exp(-d / (TW * 0.45)));
    return raw < LO ? LO - lim(LO - raw) : raw > HI ? HI + lim(raw - HI) : raw;
  }

  const geo = $derived.by(() => {
    const s = clamp(rv / (TW * 13), -0.2, 0.42); // speed -> stretch (squeezes a little the other way)
    const W = TW * (1 + s * 0.63) * (1 + rp * 0.45); // stretch, plus the press swell
    const H = TH * Math.sqrt(1 / (1 + s * 0.63)) * (1 + rp * 0.5); // stretch thins, squeeze fattens
    return {
      left: pw(rx - W / 2),
      top: ph((CH - H) / 2),
      w: pw(W),
      h: ph(H),
      q: clamp(rp, 0, 1).toFixed(3),
      fill: ptk(rx - LO) // the fill reaches the thumb centre: empty at the minimum, full at the maximum
    };
  });

  function render() {
    rx = x; rv = v; rp = p;
  }

  function step_(t) {
    const dt = Math.min(0.033, (t - last) / 1000 || 0.016);
    last = t;
    const k = Math.ceil(dt / 0.0042), h = dt / k;
    for (let i = 0; i < k; i++) {
      v += ((tx - x) * 290 - v * 19) * h; x += v * h;
      pv += ((pt - p) * 185 - pv * 14.5) * h; p += pv * h;
    }
    render();
    if (Math.abs(tx - x) > 0.04 || Math.abs(v) > 0.4 || Math.abs(pt - p) > 0.002 || Math.abs(pv) > 0.01)
      raf = requestAnimationFrame(step_);
    else raf = 0;
  }
  function kick() {
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(step_); }
  }
  // tiny beat before it swells
  function squeeze() {
    clearTimeout(pend);
    pend = setTimeout(() => { pt = 1; kick(); }, 60);
  }
  function release() {
    const wait = Math.max(0, 210 - (performance.now() - downAt));
    clearTimeout(pend);
    pend = setTimeout(() => { if (!down) { pt = 0; kick(); } }, wait);
  }

  // quiet = follow an outside change: move the thumb, tell nobody
  function aim(raw, soft, quiet = false) {
    let t = soft ? rb(raw) : clamp(raw, LO, HI);
    if (coarse && t >= LO && t <= HI) t = posOf(valOf(t)); // few steps: the thumb jumps from step to step
    tx = t;
    if (!quiet) {
      const nv = valOf(tx);
      if (nv !== value) { value = nv; oninput?.(nv); }
    }
    if (reduce) { x = tx; v = 0; render(); } else kick();
  }
  // on-screen px per reference unit (right also inside a scaled GUI)
  const ux = (e) => {
    const r = el.getBoundingClientRect();
    return (e.clientX - r.left) / Math.max(1e-6, r.width / UW);
  };

  function onpointerdown(e) {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    down = true; downAt = performance.now(); pressed = true;
    if (!reduce) squeeze();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    const u = ux(e);
    off = Math.abs(u - x) <= TW / 2 + 4 ? x - u : 0; // grab the thumb where it is, or jump to the tap
    aim(u + off, true);
  }
  function onpointermove(e) {
    if (down) aim(ux(e) + off, true);
  }
  function onpointerup() {
    if (!down) return;
    down = false; pressed = false;
    aim(posOf(valOf(tx)), false); // settle back inside the ends, on a step
    if (!reduce) release();
    ondone?.();
  }
  function onkeydown(e) {
    if (disabled) return;
    const st = step > 0 ? step : span / 100;
    let nv;
    switch (e.key) {
      case 'ArrowRight': case 'ArrowUp': nv = value + st * (e.shiftKey ? 10 : 1); break;
      case 'ArrowLeft': case 'ArrowDown': nv = value - st * (e.shiftKey ? 10 : 1); break;
      case 'PageUp': nv = value + st * 10; break;
      case 'PageDown': nv = value - st * 10; break;
      case 'Home': nv = min; break;
      case 'End': nv = max; break;
      default: return;
    }
    e.preventDefault();
    aim(posOf(snapV(nv)), false);
    ondone?.();
  }

  onMount(() => {
    reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(pend);
    };
  });

  // Follow external changes to `value`, `min`, `max` (e.g. a parent resetting it, or typing the number)
  $effect(() => {
    const val = clamp(value, min, max);
    void step;
    untrack(() => {
      if (!down && valOf(tx) !== snapV(val)) aim(posOf(val), false, true);
    });
  });
</script>

<div class="slw" style:width={typeof width === 'number' ? `${width}px` : undefined}>
  <div
    bind:this={el}
    class="sl"
    class:drag={pressed}
    class:dis={disabled}
    role="slider"
    aria-label={label}
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={value}
    aria-disabled={disabled}
    tabindex={disabled ? -1 : 0}
    style:--p={geo.q}
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    onpointercancel={onpointerup}
    {onkeydown}
  >
    <!-- the track runs from the thumb's centre at the minimum to its centre at the maximum -->
    <div class="tk" style:height={ph(TK)} style:top={ph((CH - TK) / 2)} style:left={pw(LO)} style:right={pw(LO)} style:background={track}>
      {#if !track}<div class="fl" style:width={geo.fill}></div>{/if}
    </div>
    <div class="th" style:left={geo.left} style:top={geo.top} style:width={geo.w} style:height={geo.h}></div>
  </div>
</div>

<style>
  /* takes the parent's width (inside a flex row it shares the row with its neighbours) */
  .slw {
    flex: 1 1 0;
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
  }
  .sl {
    --p: 0;
    position: relative;
    width: 100%;
    aspect-ratio: 746 / 64;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    cursor: grab;
    outline: none;
  }
  .sl.drag { cursor: grabbing; }
  .sl.dis { opacity: 0.4; pointer-events: none; }
  .sl:focus-visible {
    outline: 2px solid var(--sl-focus, #0a84ff);
    outline-offset: 4px;
    border-radius: 10px;
  }
  /* thin static track */
  .tk {
    position: absolute;
    border-radius: 999px;
    overflow: hidden;
    background: var(--sl-track, #e9e9ea);
  }
  .fl {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 0;
    background: var(--sl-fill, #0091ff);
  }
  /* same white thumb as the toggle */
  .th {
    position: absolute;
    border-radius: 999px;
    /* held: the thumb turns a little see-through, like the pressed pill of the tab bars (--p is the press spring, 0..1) */
    background: rgba(255, 255, 255, calc(1 - var(--p) * 0.45));
    pointer-events: none;
    will-change: left, width, height;
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, calc(0.1 + var(--p) * 0.1)),
      0 2px 0 rgba(0, 0, 0, 0.06);
  }
</style>
