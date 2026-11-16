<script>
  import { getContext } from 'svelte';
  import { fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { drawer } from './transitions.js';
  import { isTextEntry } from '../../../util/utils';

  let { items = [], onlocate = () => {}, shown = true } = $props(); // items: { module, cat }[]; shown: false while the GUI is hidden / leaving
  const gui = getContext('gui');
  // the swipe (ClickGui.svelte) flies the search bar in and out together with the windows
  const swipe = getContext('swipe');
  const item = swipe ? swipe.item : () => {};
  let q = $state(''), sel = $state(0), input = $state();

  const norm = (s) => s.toLowerCase().replace(/\s/g, '');
  const fuzzy = (s, v) => { let k = 0; for (const c of s) if (c === v[k]) k++; return k === v.length; };
  const v = $derived(norm(q));
  const hits = $derived(v
    ? items.map((h) => ({ ...h, n: norm(h.module.name) }))
        .filter((h) => h.n.includes(v) || fuzzy(h.n, v))
        .sort((a, b) => (b.n.startsWith(v) - a.n.startsWith(v)) || a.n.length - b.n.length)
        .slice(0, 5)
    : []);
  const active = $derived(Math.min(sel, Math.max(hits.length - 1, 0)));

  function key(e) {
    if (e.key === 'ArrowDown') { sel = Math.min(active + 1, hits.length - 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(active - 1, 0); e.preventDefault(); }
    else if (e.key === 'Enter' && hits[active]) { e.shiftKey ? onlocate(hits[active].module.name) : gui.toggle(hits[active].module); }
    else if (e.key === 'Escape') { q = ''; input.blur(); }
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === '/' && shown && document.activeElement !== input && !isTextEntry(document.activeElement)) { e.preventDefault(); input.focus(); } }} />

<!-- `.sw` is the item that flies (it only positions: the swipe writes a `transform` on it, so the centring cannot be a transform) -->
<div class="sw" inert={!shown} use:item>
<div class="search cg-glass">
  <label class="field">
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg>
    <input bind:this={input} bind:value={q} onkeydown={key} oninput={() => (sel = 0)}
           onfocus={() => gui.typing(true)} onblur={() => gui.typing(false)}
           placeholder="Search modules" autocomplete="off" spellcheck="false">
  </label>
  {#if hits.length}
    <!-- the results open like a module's drawer (morph springs; the hits are revealed by the moving edge). blur 0: this box sits INSIDE the glass bar,
         and a `filter` on something inside a backdrop-filter element makes the bar flicker (see README). depth 1: the hits are its own children. -->
    <div class="res" transition:drawer={{ blur: 0, depth: 1 }}>
      {#each hits as h, i (h.module.name)}
        <div class="hit" class:sel={i === active} role="button" tabindex="-1"
             animate:flip={{ duration: 250 }} in:fly={{ y: -6, duration: 250, delay: i * 30 }}
             onclick={() => gui.toggle(h.module)}
             oncontextmenu={(e) => { e.preventDefault(); onlocate(h.module.name); }}>
          <span class="n" class:on={h.module.enabled}>{h.module.name}<em>{h.cat}</em></span>
          <small>Right-click to locate</small>
        </div>
      {/each}
    </div>
  {/if}
</div>
</div>

<style>
  /* centred without a transform: left / right with auto margins and a max width */
  .sw { position: fixed; left: 12px; right: 12px; max-width: 600px; margin: 0 auto; top: 64px; z-index: 100000; }
  .search { position: relative; border-radius: 22px; padding: 10px 14px; box-sizing: border-box; }
  .field { display: flex; align-items: center; gap: 8px; background: var(--cg-fill); border-radius: 12px; padding: 0 10px; height: 40px; }
  svg { width: 16px; height: 16px; opacity: .6; flex: none; }
  input { flex: 1; min-width: 0; background: none; border: 0; outline: 0; color: inherit; font: inherit; font-size: 17px; }
  input::placeholder { color: var(--cg-tx3); }
  .res { display: flex; flex-direction: column; gap: 2px; margin-top: 6px; }
  .hit { display: flex; justify-content: space-between; align-items: center; padding: 9px 10px; border-radius: 10px; font-size: 15px; color: var(--cg-tx2); cursor: pointer; transition: background .2s, color .2s; }
  .hit.sel, .hit:hover { background: var(--cg-hi); color: var(--cg-tx); }
  .n.on { color: var(--cg-tx); font-weight: 600; }
  em { font-style: normal; font-size: 12px; color: var(--cg-tx3); margin-left: 8px; }
  small { font-size: 12px; color: var(--cg-tx3); }
</style>
