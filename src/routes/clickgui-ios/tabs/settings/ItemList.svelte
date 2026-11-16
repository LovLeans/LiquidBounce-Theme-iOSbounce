<!--
  List settings with a catalogue of items:
    ITEM_LIST, REGISTRY_LIST ........ the value is the set of ticked items (mode 'toggle')
    REGISTRY_MUTABLE_LIST ........... the value is an ordered list the user adds to / removes from / reorders (mode 'mutable')
  The catalogue of a registry (all blocks, all items, ...) can have thousands of entries, so it is only fetched when the list is
  opened and only the rows that are in view are drawn.
-->
<script>
  import { onMount, untrack } from 'svelte';
  import { getRegistryItems } from '../../../../integration/rest';

  let { s, mode = 'toggle', onchange = () => {} } = $props();

  let items = $state(untrack(() => (Array.isArray(s.items) ? s.items : [])));
  let loading = $state(false);
  let loaded = untrack(() => Array.isArray(s.items));
  let query = $state('');
  let adding = $state(false);

  /** loads the registry once, the first time something needs it */
  async function ensure() {
    if (loaded || !s.registry) return;
    loaded = true; loading = true;
    try {
      const reg = await getRegistryItems(s.registry);
      items = Object.entries(reg).map(([value, it]) => ({ value, name: it.name, icon: it.icon })).sort((a, b) => a.value.localeCompare(b.value));
    } catch (e) {
      loaded = false;
      console.warn('[ios-clickgui] could not load the registry', s.registry, e);
    }
    loading = false;
  }

  onMount(() => { ensure(); });

  const chosen = $derived(new Set(s.value));
  const byValue = $derived(new Map(items.map((i) => [i.value, i])));
  const shown = $derived.by(() => {
    const parts = query.toLowerCase().match(/\S+/g) ?? [];
    const pool = mode === 'mutable' ? items.filter((i) => !chosen.has(i.value)) : items;
    return parts.length ? pool.filter((i) => parts.every((p) => i.name.toLowerCase().includes(p))) : pool;
  });

  function flip(value) {
    s.value = chosen.has(value) ? s.value.filter((v) => v !== value) : [...s.value, value];
    onchange();
  }
  function add(value) { s.value = [...s.value, value]; adding = false; query = ''; onchange(); }
  function drop(i) { s.value = s.value.filter((_, j) => j !== i); onchange(); }
  function shift(i, d) {
    const j = i + d;
    if (j < 0 || j >= s.value.length) return;
    const a = [...s.value];
    [a[i], a[j]] = [a[j], a[i]];
    s.value = a; onchange();
  }

  // ---- a small virtual list: fixed row height, only the visible rows exist ----
  const ROW = 34, VIEW = 220;
  let top = $state(0);
  const first = $derived(Math.max(0, Math.floor(top / ROW) - 3));
  const visible = $derived(shown.slice(first, first + Math.ceil(VIEW / ROW) + 7));
  const label = (v) => byValue.get(v)?.name ?? v;
  // the page scrolls with its own momentum engine: the wheel belongs to this list while it can scroll
  const wheel = (e) => e.stopPropagation();
</script>

{#if mode === 'mutable'}
  <div class="sel">
    {#each s.value as v, i (v + ':' + i)}
      <div class="item">
        {#if byValue.get(v)?.icon}<img src={byValue.get(v).icon} alt="" />{/if}
        <span class="nm">{label(v)}</span>
        <button class="ic" aria-label="Move up" disabled={i === 0} onclick={() => shift(i, -1)}><svg viewBox="0 0 10 10"><path d="M2 6.5 5 3.5 8 6.5"/></svg></button>
        <button class="ic" aria-label="Move down" disabled={i === s.value.length - 1} onclick={() => shift(i, 1)}><svg viewBox="0 0 10 10"><path d="M2 3.5 5 6.5 8 3.5"/></svg></button>
        <button class="ic rm" aria-label="Remove" onclick={() => drop(i)}><svg viewBox="0 0 10 10"><path d="M2 2 8 8M8 2 2 8"/></svg></button>
      </div>
    {:else}
      <div class="empty">Nothing added</div>
    {/each}
    <button class="addbtn" onclick={() => (adding = !adding)}>{adding ? 'Done' : 'Add…'}</button>
  </div>
{/if}

{#if mode === 'toggle' || adding}
  <div class="pick">
    <input class="q" type="text" spellcheck="false" placeholder="Search" bind:value={query} oninput={() => (top = 0)}>
    {#if loading}
      <div class="empty">Loading…</div>
    {:else}
      <div class="vl" style="height:{Math.min(VIEW, Math.max(ROW, shown.length * ROW))}px" onscroll={(e) => (top = e.currentTarget.scrollTop)} onwheel={wheel}>
        <div style="height:{shown.length * ROW}px; position:relative">
          {#each visible as it, k (it.value)}
            <button class="opt" class:on={mode === 'toggle' && chosen.has(it.value)} style="top:{(first + k) * ROW}px"
                    onclick={() => (mode === 'toggle' ? flip(it.value) : add(it.value))}>
              {#if it.icon}<img src={it.icon} alt="" loading="lazy" />{/if}
              <span class="nm">{it.name}</span>
              {#if mode === 'toggle'}<svg class="ck" viewBox="0 0 12 12"><path d="M2.5 6.5 5 9 9.5 3.5"/></svg>{/if}
            </button>
          {/each}
          {#if !shown.length}<div class="empty">No results</div>{/if}
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .empty { padding: 10px; font-size: 12px; color: var(--cg-tx3); text-align: center; }
  .q { display: block; width: calc(100% - 20px); box-sizing: border-box; margin: 8px 10px 4px; border: 0; outline: 0; border-radius: 9px; padding: 7px 10px;
    background: var(--cg-fill); color: var(--cg-tx); font: inherit; font-size: 13px; }
  .q::placeholder { color: var(--cg-tx3); }
  .vl { overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, .25) transparent; overscroll-behavior: contain; margin: 0 4px 6px; }
  .opt { position: absolute; left: 0; right: 0; height: 34px; box-sizing: border-box; display: flex; align-items: center; gap: 8px; padding: 0 10px; border: 0;
    border-radius: 9px; background: none; font-size: 13px; text-align: left; cursor: pointer; color: var(--cg-tx2); transition: background .15s, color .15s; }
  .opt:hover { background: var(--cg-hi); }
  .opt.on { color: var(--cg-tx); font-weight: 600; }
  .opt img, .item img { width: 20px; height: 20px; object-fit: contain; image-rendering: pixelated; flex: none; }
  .nm { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ck { width: 12px; height: 12px; flex: none; fill: none; stroke: var(--cg-accent); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; opacity: 0; transform: scale(.6); transition: opacity .2s, transform .3s cubic-bezier(.3, 1.6, .5, 1); }
  .on .ck { opacity: 1; transform: none; }
  .sel { padding: 4px 6px 6px; }
  .item { display: flex; align-items: center; gap: 6px; padding: 4px 4px 4px 8px; min-height: 32px; font-size: 13px; border-radius: 9px; }
  .ic { width: 24px; height: 24px; flex: none; display: grid; place-items: center; border: 0; border-radius: 50%; background: none; color: var(--cg-tx2); cursor: pointer; transition: background .15s, color .15s; }
  .ic:hover:not(:disabled) { background: var(--cg-hi); color: var(--cg-tx); }
  .ic:disabled { opacity: .25; cursor: default; }
  .ic svg { width: 10px; height: 10px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
  .rm:hover:not(:disabled) { color: #ff453a; }
  .addbtn { display: block; margin: 4px 4px 0; padding: 6px 12px; border: 0; border-radius: 9px; background: var(--cg-fill); font-size: 12px; cursor: pointer; transition: background .2s, transform .15s; }
  .addbtn:hover { background: rgba(120, 120, 128, .5); }
  .addbtn:active { transform: scale(.96); }
</style>
