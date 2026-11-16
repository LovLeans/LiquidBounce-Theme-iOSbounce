<script>
  /*
   * Two-thumb version of Slider.svelte (INT_RANGE / FLOAT_RANGE settings): the same spring thumbs, press swell and
   * speed stretch, one set of springs per thumb. The thumbs never pass each other. The fill between them is the range.
   *
   *   <RangeSlider min max step from to onchange={(from, to) => ...} />
   *
   * `onchange` is called only for changes made by the user; `ondone()` when the pointer / key was released. Colours: --sl-track, --sl-fill, --sl-focus (see Slider.svelte).
   */
  import { onMount, untrack } from 'svelte';

  let { min = 0, max = 100, step = 1, from = 0, to = 100, onchange = undefined, ondone = undefined, big = 1, disabled = false, label = 'Range' } = $props();

  const UW = 746, TK = 13, TW0 = 84, TH0 = 50, CH = 64;
  const TW = $derived(TW0 * big);
  const TH = $derived(TH0 * big);
  const LO = $derived(TW / 2); // the thumb stays inside the box at both ends (nothing for a parent to clip)
  const HI = $derived(UW - LO);
  const TRAVEL = $derived(HI - LO);
  const clamp = (a, lo, hi) => Math.min(hi, Math.max(lo, a));

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

  // no measuring, see Slider.svelte: percent of a `width: 100%` box with the track's aspect ratio
  let el = $state();
  let reduce = false;
  const pw = (u) => `${(u / UW) * 100}%`;
  const ph = (u) => `${(u / CH) * 100}%`;
  const ptk = (u) => `${(clamp(u, 0, TRAVEL) / TRAVEL) * 100}%`; // ... of the track (the thumb-centre travel)

  // one physics object per thumb: x position, v speed, tx target, p press swell (pv its speed, pt its target)
  const mk = (x) => ({ x, v: 0, tx: x, p: 0, pv: 0, pt: 0 });
  const T = untrack(() => [mk(posOf(from)), mk(posOf(to))]);
  let raf = 0, last = 0, down = -1, off = 0, downAt = 0, top = 1, pend;

  let rs = $state([{ x: T[0].x, v: 0, p: 0 }, { x: T[1].x, v: 0, p: 0 }]);
  let pressed = $state(false);

  function rb(raw) {
    const g = TW * 0.09;
    const lim = (d) => g * (1 - Math.exp(-d / (TW * 0.45)));
    return raw < LO ? LO - lim(LO - raw) : raw > HI ? HI + lim(raw - HI) : raw;
  }

  const geoOf = (r) => {
    const s = clamp(r.v / (TW * 13), -0.2, 0.42);
    const W = TW * (1 + s * 0.63) * (1 + r.p * 0.45);
    const H = TH * Math.sqrt(1 / (1 + s * 0.63)) * (1 + r.p * 0.5);
    return {
      left: pw(r.x - W / 2),
      top: ph((CH - H) / 2),
      w: pw(W),
      h: ph(H),
      q: clamp(r.p, 0, 1).toFixed(3)
    };
  };
  const g0 = $derived(geoOf(rs[0]));
  const g1 = $derived(geoOf(rs[1]));
  const fillL = $derived(Math.max(0, Math.min(rs[0].x, rs[1].x)));
  const fillR = $derived(Math.max(0, Math.max(rs[0].x, rs[1].x)));

  function render() {
    rs = T.map((t) => ({ x: t.x, v: t.v, p: t.p }));
  }

  function tick(t) {
    const dt = Math.min(0.033, (t - last) / 1000 || 0.016);
    last = t;
    const k = Math.ceil(dt / 0.0042), h = dt / k;
    let busy = false;
    for (const m of T) {
      for (let i = 0; i < k; i++) {
        m.v += ((m.tx - m.x) * 290 - m.v * 19) * h; m.x += m.v * h;
        m.pv += ((m.pt - m.p) * 185 - m.pv * 14.5) * h; m.p += m.pv * h;
      }
      if (Math.abs(m.tx - m.x) > 0.04 || Math.abs(m.v) > 0.4 || Math.abs(m.pt - m.p) > 0.002 || Math.abs(m.pv) > 0.01) busy = true;
    }
    render();
    raf = busy ? requestAnimationFrame(tick) : 0;
  }
  function kick() {
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
  }
  function squeeze(i) {
    clearTimeout(pend);
    pend = setTimeout(() => { T[i].pt = 1; kick(); }, 60);
  }
  function release() {
    const wait = Math.max(0, 210 - (performance.now() - downAt));
    clearTimeout(pend);
    pend = setTimeout(() => { if (down < 0) { T[0].pt = T[1].pt = 0; kick(); } }, wait);
  }

  // move thumb i towards `raw`; the thumbs can not pass each other
  function aim(i, raw, soft) {
    let t = soft ? rb(raw) : clamp(raw, LO, HI);
    if (coarse && t >= LO && t <= HI) t = posOf(valOf(t));
    t = i === 0 ? Math.min(t, T[1].tx) : Math.max(t, T[0].tx);
    T[i].tx = t;
    const f = valOf(T[0].tx), e = valOf(T[1].tx);
    if (f !== snapV(from) || e !== snapV(to)) onchange?.(f, e);
    if (reduce) { T[i].x = t; T[i].v = 0; render(); } else kick();
  }
  const ux = (e) => {
    const r = el.getBoundingClientRect();
    return (e.clientX - r.left) / Math.max(1e-6, r.width / UW);
  };

  function onpointerdown(e) {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const u = ux(e);
    // the nearest thumb wins; when both sit on the same spot the side of the tap decides
    const d0 = Math.abs(u - T[0].x), d1 = Math.abs(u - T[1].x);
    const i = d0 < d1 || (d0 === d1 && u < T[0].x) ? 0 : 1;
    down = i; top = i; downAt = performance.now(); pressed = true;
    if (!reduce) squeeze(i);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    off = Math.abs(u - T[i].x) <= TW / 2 + 4 ? T[i].x - u : 0;
    aim(i, u + off, true);
  }
  function onpointermove(e) {
    if (down >= 0) aim(down, ux(e) + off, true);
  }
  function onpointerup() {
    if (down < 0) return;
    const i = down;
    down = -1; pressed = false;
    aim(i, posOf(valOf(T[i].tx)), false);
    if (!reduce) release();
    ondone?.();
  }
  function onkey(e, i) {
    if (disabled) return;
    const st = step > 0 ? step : span / 100;
    const cur = i === 0 ? from : to;
    let nv;
    switch (e.key) {
      case 'ArrowRight': case 'ArrowUp': nv = cur + st * (e.shiftKey ? 10 : 1); break;
      case 'ArrowLeft': case 'ArrowDown': nv = cur - st * (e.shiftKey ? 10 : 1); break;
      case 'Home': nv = min; break;
      case 'End': nv = max; break;
      default: return;
    }
    e.preventDefault();
    top = i;
    aim(i, posOf(snapV(nv)), false);
    ondone?.();
  }

  onMount(() => {
    reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(pend);
    };
  });

  // follow outside changes (typing a number, a reset, another min / max)
  $effect(() => {
    const vals = [clamp(from, min, max), clamp(to, min, max)];
    void step;
    untrack(() => {
      vals.forEach((val, i) => {
        if (down < 0 && valOf(T[i].tx) !== snapV(val)) {
          T[i].tx = posOf(val);
          if (reduce) { T[i].x = T[i].tx; T[i].v = 0; render(); } else kick();
        }
      });
    });
  });
</script>

<div class="slw">
  <div
    bind:this={el}
    class="sl"
    class:drag={pressed}
    class:dis={disabled}
    role="group"
    aria-label={label}
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    onpointercancel={onpointerup}
  >
    <div class="tk" style:height={ph(TK)} style:top={ph((CH - TK) / 2)} style:left={pw(LO)} style:right={pw(LO)}>
      <div class="fl" style:left={ptk(fillL - LO)} style:width={`${((clamp(fillR - LO, 0, TRAVEL) - clamp(fillL - LO, 0, TRAVEL)) / TRAVEL) * 100}%`}></div>
    </div>
    <div
      class="th"
      role="slider"
      tabindex={disabled ? -1 : 0}
      aria-label="{label} from"
      aria-valuemin={min}
      aria-valuemax={to}
      aria-valuenow={from}
      style:--q={g0.q}
      style:z-index={top === 0 ? 2 : 1}
      style:left={g0.left}
      style:top={g0.top}
      style:width={g0.w}
      style:height={g0.h}
      onkeydown={(e) => onkey(e, 0)}
    ></div>
    <div
      class="th"
      role="slider"
      tabindex={disabled ? -1 : 0}
      aria-label="{label} to"
      aria-valuemin={from}
      aria-valuemax={max}
      aria-valuenow={to}
      style:--q={g1.q}
      style:z-index={top === 1 ? 2 : 1}
      style:left={g1.left}
      style:top={g1.top}
      style:width={g1.w}
      style:height={g1.h}
      onkeydown={(e) => onkey(e, 1)}
    ></div>
  </div>
</div>

<style>
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
  .tk {
    position: absolute;
    border-radius: 999px;
    overflow: hidden;
    background: var(--sl-track, #e9e9ea);
  }
  .fl {
    position: absolute;
    top: 0;
    bottom: 0;
    background: var(--sl-fill, #0091ff);
  }
  /* the thumbs only draw: the track takes the pointer. The focus ring is what the keyboard needs. */
  .th {
    --q: 0;
    position: absolute;
    border-radius: 999px;
    /* held: a little see-through, like the pressed pill of the tab bars */
    background: rgba(255, 255, 255, calc(1 - var(--q) * 0.45));
    outline: none;
    pointer-events: none;
    will-change: left, width, height;
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, calc(0.1 + var(--q) * 0.1)),
      0 2px 0 rgba(0, 0, 0, 0.06);
  }
  .th:focus-visible {
    box-shadow:
      0 0 0 2px var(--sl-focus, #0a84ff),
      0 2px 0 rgba(0, 0, 0, 0.06);
  }
</style>
