<!--
  CURVE setting: draggable points on a small graph. Click an empty spot to add a point, double-click / right-click a point to
  remove it. The two points on the edges of the x axis can only move up and down, like in the classic GUI.
  `s.value` = [{ x, y }], `s.xAxis` / `s.yAxis` = { label, range: { from, to } }, `s.tension` = 0..1 (how round the line is).
-->
<script>
  import { clamp } from './util.js';

  let { s, onchange = () => {} } = $props();

  const W = 264, H = 132, PAD = 10;
  const xr = $derived(s.xAxis.range), yr = $derived(s.yAxis.range);
  const sx = (x) => PAD + ((x - xr.from) / Math.max(1e-9, xr.to - xr.from)) * (W - 2 * PAD);
  const sy = (y) => H - PAD - ((y - yr.from) / Math.max(1e-9, yr.to - yr.from)) * (H - 2 * PAD);
  const EPS = 1e-9, EDGE = 1e-6;

  const pts = $derived([...s.value].map((p) => ({ x: p.x, y: p.y })).sort((a, b) => a.x - b.x));
  const edge = (p) => Math.abs(p.x - xr.from) <= EPS || Math.abs(p.x - xr.to) <= EPS;

  // the line: a cardinal spline through the points (tension 0 = straight segments)
  const path = $derived.by(() => {
    const P = pts.map((p) => [sx(p.x), sy(p.y)]);
    if (P.length < 2) return '';
    const k = clamp(s.tension ?? 0, 0, 1) / 3;
    let d = `M${P[0][0]},${P[0][1]}`;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[Math.max(0, i - 1)], b = P[i], c = P[i + 1], e = P[Math.min(P.length - 1, i + 2)];
      d += ` C${b[0] + (c[0] - a[0]) * k},${b[1] + (c[1] - a[1]) * k} ${c[0] - (e[0] - b[0]) * k},${c[1] - (e[1] - b[1]) * k} ${c[0]},${c[1]}`;
    }
    return d;
  });

  function save(list) {
    s.value = list.map((p) => ({ x: p.x, y: p.y }));
    onchange();
  }
  /** keep one point on each end of the x axis */
  function ends(list) {
    const has = (x) => list.some((p) => Math.abs(p.x - x) <= EPS);
    if (!has(xr.from)) list.push({ x: xr.from, y: yr.from });
    if (!has(xr.to)) list.push({ x: xr.to, y: yr.from });
    return list.sort((a, b) => a.x - b.x);
  }

  let svg = $state();
  let dragIdx = -1, moved = false;
  function local(e) {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W, py = ((e.clientY - r.top) / r.height) * H;
    return {
      x: xr.from + ((px - PAD) / (W - 2 * PAD)) * (xr.to - xr.from),
      y: yr.from + ((H - PAD - py) / (H - 2 * PAD)) * (yr.to - yr.from)
    };
  }
  function down(e, i) {
    if (e.button !== 0) return;
    e.stopPropagation();
    dragIdx = i; moved = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e) {
    if (dragIdx < 0) return;
    moved = true;
    const list = pts.map((p) => ({ ...p }));
    const p = list[dragIdx], q = local(e);
    p.y = clamp(q.y, yr.from, yr.to);
    if (!edge(p)) p.x = clamp(q.x, xr.from + EDGE, xr.to - EDGE);
    save(list);
    dragIdx = [...list].sort((a, b) => a.x - b.x).indexOf(p);   // it may have moved past a neighbour: follow it
  }
  function up() { dragIdx = -1; }
  function add(e) {
    if (e.button !== 0 || moved) { moved = false; return; }
    const q = local(e);
    save(ends([...pts, { x: clamp(q.x, xr.from + EDGE, xr.to - EDGE), y: clamp(q.y, yr.from, yr.to) }]));
  }
  function remove(e, i) {
    e.preventDefault(); e.stopPropagation();
    if (edge(pts[i])) return;
    save(ends(pts.filter((_, j) => j !== i)));
  }
</script>

<div class="curve">
  <svg bind:this={svg} viewBox="0 0 {W} {H}" onclick={add} role="presentation">
    {#each [0.25, 0.5, 0.75] as f}
      <line x1={PAD} x2={W - PAD} y1={PAD + f * (H - 2 * PAD)} y2={PAD + f * (H - 2 * PAD)} class="grid" />
      <line y1={PAD} y2={H - PAD} x1={PAD + f * (W - 2 * PAD)} x2={PAD + f * (W - 2 * PAD)} class="grid" />
    {/each}
    <rect x={PAD} y={PAD} width={W - 2 * PAD} height={H - 2 * PAD} class="frame" rx="6" />
    <path d={path} class="line" />
    {#each pts as p, i (i)}
      <circle cx={sx(p.x)} cy={sy(p.y)} r="6" class="pt" class:fixed={edge(p)}
              onpointerdown={(e) => down(e, i)} onpointermove={move} onpointerup={up} onpointercancel={up}
              oncontextmenu={(e) => remove(e, i)} ondblclick={(e) => remove(e, i)} onclick={(e) => e.stopPropagation()} role="presentation" />
    {/each}
  </svg>
  <div class="ax"><span>{s.xAxis.label}</span><span>{s.yAxis.label}</span></div>
</div>

<style>
  .curve { padding: 8px 10px 10px; }
  svg { display: block; width: 100%; height: auto; touch-action: none; user-select: none; }
  .grid { stroke: rgba(255, 255, 255, .07); stroke-width: 1; }
  .frame { fill: rgba(255, 255, 255, .03); stroke: rgba(255, 255, 255, .12); stroke-width: 1; }
  .line { fill: none; stroke: var(--cg-accent); stroke-width: 2.2; stroke-linecap: round; }
  .pt { fill: #fff; stroke: var(--cg-accent); stroke-width: 2; cursor: grab; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, .45)); }
  .pt.fixed { cursor: ns-resize; }
  .ax { display: flex; justify-content: space-between; margin-top: 4px; font-size: 11px; color: var(--cg-tx3); }
</style>
