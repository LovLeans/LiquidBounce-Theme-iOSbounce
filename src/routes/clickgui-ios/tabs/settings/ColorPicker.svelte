<!--
  Inline color picker (COLOR settings): saturation / value square, hue and alpha sliders, hex field.
  `value` is the ARGB int of the client; `onchange(int)` is called while dragging (the owner debounces the saving).
-->
<script>
  import { untrack } from 'svelte';
  import { intToRgba, rgbaToInt } from '../../../../integration/util';
  import { clamp, hex2, hsvToRgb, rgbToHsv, parseHex, cssRgba } from './util.js';

  let { value, onchange = () => {} } = $props();

  const start = untrack(() => intToRgba(value));
  let [h, sat, val] = rgbToHsv(start[0], start[1], start[2]);
  let hue = $state(h), sa = $state(sat), va = $state(val), alpha = $state(start[3]);
  let hexText = $state('');
  let editing = false;

  const rgb = $derived(hsvToRgb(hue, sa, va).map(Math.round));
  const hexOf = (c, a) => '#' + hex2(c[0]) + hex2(c[1]) + hex2(c[2]) + (a === 255 ? '' : hex2(a));
  $effect(() => { const t = hexOf(rgb, Math.round(alpha)); if (!editing) hexText = t; });

  const push = () => onchange(rgbaToInt([...rgb, Math.round(alpha)]));

  let sv = $state(), hs = $state(), al = $state();
  let which = '';
  function pos(e, el) { const r = el.getBoundingClientRect(); return [clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1), clamp((e.clientY - r.top) / Math.max(1, r.height), 0, 1)]; }
  function drag(e) {
    if (which === 'sv') { const [x, y] = pos(e, sv); sa = x; va = 1 - y; }
    else if (which === 'h') { hue = pos(e, hs)[0] * 360; if (hue >= 360) hue = 359.99; }
    else if (which === 'a') { alpha = pos(e, al)[0] * 255; }
    else return;
    push();
  }
  const down = (w, el) => (e) => { if (e.button !== 0) return; which = w; el.setPointerCapture(e.pointerId); drag(e); };
  const up = () => { which = ''; };

  function typed(e) {
    const c = parseHex(e.currentTarget.value);
    editing = false;
    if (!c) { hexText = hexOf(rgb, Math.round(alpha)); return; }
    [hue, sa, va] = rgbToHsv(c[0], c[1], c[2]);
    alpha = c[3];
    push();
  }
</script>

<div class="cp">
  <div class="sv" bind:this={sv} style="--hue:{hue}" onpointerdown={(e) => down('sv', sv)(e)} onpointermove={drag} onpointerup={up} onpointercancel={up} role="presentation">
    <i style="left:{sa * 100}%; top:{(1 - va) * 100}%; background:{cssRgba([...rgb, 255])}"></i>
  </div>
  <div class="bar hue" bind:this={hs} onpointerdown={(e) => down('h', hs)(e)} onpointermove={drag} onpointerup={up} onpointercancel={up} role="presentation">
    <i style="left:{(hue / 360) * 100}%"></i>
  </div>
  <div class="bar alpha" bind:this={al} style="--c:{rgb.join(',')}" onpointerdown={(e) => down('a', al)(e)} onpointermove={drag} onpointerup={up} onpointercancel={up} role="presentation">
    <i style="left:{(alpha / 255) * 100}%"></i>
  </div>
  <input class="hex" type="text" spellcheck="false" bind:value={hexText} onfocus={() => (editing = true)} onchange={typed} onblur={typed} aria-label="Hex color">
</div>

<style>
  .cp { display: flex; flex-direction: column; gap: 10px; padding: 10px; }
  .sv { position: relative; height: 112px; border-radius: 10px; cursor: crosshair; touch-action: none;
    background: linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(var(--hue), 100%, 50%)); }
  .sv i, .bar i { position: absolute; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%; border: 2px solid #fff; box-sizing: border-box;
    box-shadow: 0 1px 4px rgba(0, 0, 0, .5); pointer-events: none; }
  .bar { position: relative; height: 14px; border-radius: 7px; cursor: pointer; touch-action: none; }
  .bar i { top: 50%; background: transparent; }
  .hue { background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00); }
  .alpha { background: linear-gradient(to right, rgba(var(--c), 0), rgb(var(--c))), repeating-conic-gradient(#8a8a8f 0 25%, #c7c7cc 0 50%) 0 0 / 10px 10px; }
  .hex { width: 100%; box-sizing: border-box; border: 0; outline: 0; border-radius: 9px; padding: 7px 10px; background: var(--cg-fill); color: var(--cg-tx);
    font: 12px Consolas, Menlo, 'DejaVu Sans Mono', 'Liberation Mono', monospace; text-transform: uppercase; }
</style>
