<!--
  A small segmented control with the same pill as the tab bar (ClickGUI / HUD Editor / Settings): the pill follows the pointer
  (springs, swell, stretch) and settles on the chosen option. Used for the bind action (Toggle / Hold / Smart).
  The motion lives in components/pillTabs.ts (see the header there): `.opts` holds the real buttons, `.fg` a same-layout copy of the
  labels that is clipped to the pill (the text inside the pill). Arrow keys move the choice.
    options  list of labels          value  the chosen label          onpick(label)  the user chose one
-->
<script>
  import { onMount, untrack } from 'svelte';
  import { createPill } from '../../../../components/pillTabs';

  let { options, value = '', onpick = () => {}, label = '' } = $props();

  const index = $derived(options.indexOf(value));

  let track = $state();
  let lens = $state();
  let opts = $state();
  let fg = $state();
  let ready = $state(false);
  let pill;

  onMount(() => {
    if (!track || !lens || !opts || !fg) return;
    const p = createPill({
      track,
      lens,
      base: opts,
      fg,
      index: () => index,
      pick: (i) => {
        onpick(options[i]);
        // the owner may keep the old value: follow what it really holds
        queueMicrotask(() => pill?.sync());
      },
      ready: (ok) => (ready = ok)
    });
    pill = p;
    p.layout();
    return () => { p.destroy(); pill = undefined; };
  });

  // `value` was changed from outside (or the options changed): move the pill / re-measure
  $effect(() => { void index; untrack(() => pill?.sync()); });
  $effect(() => { void options.join('\u0001'); untrack(() => pill?.layout()); });

  function key(e) {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    const to = Math.max(0, Math.min(options.length - 1, (index < 0 ? 0 : index) + d));
    onpick(options[to]);
    pill?.go(to, true);
    e.currentTarget.parentElement.querySelectorAll('button')[to]?.focus();
  }
</script>

<div class="track" role="radiogroup" aria-label={label} style:--n={options.length} bind:this={track}>
  <i class="thumb" class:off={!ready} aria-hidden="true" bind:this={lens}></i>
  <div class="opts" bind:this={opts}>
    {#each options as o (o)}
      <button type="button" role="radio" aria-checked={o === value} tabindex={o === value || (index < 0 && o === options[0]) ? 0 : -1}
              class:on={!ready && o === value}
              onclick={(e) => {
                // a mouse / touch press is handled by the pill (pointerup); this is Enter / Space on a focused option
                if (e.detail === 0) onpick(o);
              }} onkeydown={key}>{o}</button>
    {/each}
  </div>
  <div class="fg" class:rdy={ready} aria-hidden="true" bind:this={fg}>
    {#each options as o (o)}<button type="button" tabindex="-1">{o}</button>{/each}
  </div>
</div>

<style>
  .track { position: relative; box-sizing: border-box; margin: 0 10px 8px; padding: 3px; border-radius: 10px; background: var(--cg-fill);
    user-select: none; touch-action: pan-y; }
  .opts, .fg { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); }
  /* a copy of the labels with the same grid, clipped to the pill by the engine */
  .fg { position: absolute; inset: 0; padding: 3px; box-sizing: border-box; pointer-events: none; visibility: hidden; }
  .fg.rdy { visibility: visible; }
  /* the pill: left / top / width / height / radius are set by the engine every frame; until the bar is measured it is hidden */
  .thumb { position: absolute; top: 3px; left: 3px; width: 0; height: 0; border-radius: 8px;
    background: rgba(255, 255, 255, .17); box-shadow: inset 0 .5px 0 rgba(255, 255, 255, .3), 0 2px 8px rgba(0, 0, 0, .25); }
  .thumb.off { display: none; }
  /* the pressed pill lifts: a lighter wash and a ring (the engine sets --p on the pill) */
  .thumb::after { content: ''; position: absolute; inset: 0; border-radius: inherit;
    background: rgba(255, 255, 255, calc(var(--p, 0) * .1)); box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, calc(var(--p, 0) * .42)); }
  button { position: relative; min-width: 0; height: 26px; border: 0; border-radius: 8px; background: none; padding: 0 6px; font: inherit; font-size: 12px; font-weight: 600;
    color: var(--cg-tx2); cursor: pointer; white-space: nowrap; transition: color .25s; }
  button:hover { color: var(--cg-tx); }
  button.on { color: var(--cg-tx); }
  .fg button { color: var(--cg-tx); }
</style>
