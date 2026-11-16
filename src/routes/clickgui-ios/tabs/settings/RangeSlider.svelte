<!-- Two-thumb slider (INT_RANGE / FLOAT_RANGE). Pointer driven, so it works the same with mouse and touch. -->
<script>
  import { clamp } from './util.js';

  // from / to: the selected range; min / max: the track
  let { min, max, step = 1, from, to, onchange = () => {} } = $props();
  let track = $state();
  let drag = -1; // 0 = left thumb, 1 = right thumb

  const span = $derived(Math.max(1e-9, max - min));
  const pf = $derived(((from - min) / span) * 100);
  const pt = $derived(((to - min) / span) * 100);

  const snap = (v) => clamp(Math.round((v - min) / step) * step + min, min, max);
  function at(e) {
    const r = track.getBoundingClientRect();
    return snap(min + clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1) * span);
  }
  function down(e) {
    if (e.button !== 0) return;
    const v = at(e);
    // the thumb that is nearest wins; when both sit on the same spot the direction decides
    drag = Math.abs(v - from) < Math.abs(v - to) || (from === to && v < from) ? 0 : 1;
    track.setPointerCapture(e.pointerId);
    apply(v);
  }
  function move(e) { if (drag >= 0) apply(at(e)); }
  function up() { drag = -1; }
  function apply(v) {
    const nf = drag === 0 ? Math.min(v, to) : from;
    const nt = drag === 1 ? Math.max(v, from) : to;
    if (nf !== from || nt !== to) onchange(nf, nt);
  }
  function key(e, which) {
    const d = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step : 0;
    if (!d) return;
    e.preventDefault();
    drag = which; apply(snap((which === 0 ? from : to) + d)); drag = -1;
  }
</script>

<div class="rs" bind:this={track} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} role="group">
  <div class="fill" style="left:{pf}%; width:{Math.max(0, pt - pf)}%"></div>
  <button class="th" style="left:{pf}%" aria-label="From" onkeydown={(e) => key(e, 0)}></button>
  <button class="th" style="left:{pt}%" aria-label="To" onkeydown={(e) => key(e, 1)}></button>
</div>

<style>
  .rs { position: relative; height: 22px; margin: 4px 10px 0; cursor: pointer; touch-action: none; }
  .rs::before { content: ''; position: absolute; left: 0; right: 0; top: 9px; height: 4px; border-radius: 2px; background: var(--cg-fill); }
  .fill { position: absolute; top: 9px; height: 4px; border-radius: 2px; background: var(--cg-accent); }
  .th { position: absolute; top: 2px; width: 18px; height: 18px; margin: 0 0 0 -9px; padding: 0; border: 0; border-radius: 50%; background: #fff;
    box-shadow: 0 1px 4px rgba(0, 0, 0, .4); cursor: grab; transition: transform .2s cubic-bezier(.3, 1.6, .5, 1); }
  .rs:active .th { transform: scale(1.12); }
</style>
