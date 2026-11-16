<!--
  The tab switcher at the top: ClickGUI / HUD Editor / Settings. A glass pill like the search bar, with a pill that follows the
  pointer (springs, swell, stretch) and settles on the chosen tab. Flies in with the windows and out with them when the GUI is
  closed in game (`shown`, swipe animation: lib/menuSwipe.ts). It stays while the windows leave on a tab switch, so it has its own
  controller (made by ClickGuiRoute, which also hands the windows' one to it as `reach`) and does nothing when the GUI is carried
  by a dock window.
  The motion lives in components/pillTabs.ts (see the header there): `.tl` holds the real buttons, `.fg` a same-layout copy of the
  labels that is clipped to the pill (the text inside the pill).
-->
<script>
  import { onMount, untrack } from 'svelte';
  import { createPill } from '../../../components/pillTabs';
  import { fx } from '../../menu/title/main-menu/overlayfx';

  let { tabs, active = $bindable(0), shown = true, swipe } = $props();

  // same rules as the windows (ClickGui.svelte): carried by a dock window -> simply there; otherwise hidden for the first two
  // frames and then flying in, so the entrance always plays
  let appear = $state(fx.active());
  onMount(() => {
    if (appear) return;
    let a = requestAnimationFrame(() => { a = requestAnimationFrame(() => (appear = true)); });
    return () => cancelAnimationFrame(a);
  });
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let firstRun = true;
  $effect(() => {
    const on = appear && shown;
    untrack(() => {
      if (firstRun) { firstRun = false; if (on) swipe.snap(true); }
      else if (still) swipe.snap(on);
      else swipe.setOpen(on);
    });
  });

  let track = $state();
  let lens = $state();
  let tl = $state();
  let fg = $state();
  let ready = $state(false);
  let pill;

  onMount(() => {
    if (!track || !lens || !tl || !fg) return;
    const p = createPill({
      track,
      lens,
      base: tl,
      fg,
      index: () => active,
      pick: (i) => {
        active = i;
        // the parent may keep the old tab: follow what it really holds
        queueMicrotask(() => pill?.sync());
      },
      ready: (ok) => (ready = ok)
    });
    pill = p;
    p.layout();
    return () => {
      p.destroy();
      pill = undefined;
    };
  });

  // `active` was changed from outside (or the tabs changed): move the pill / re-measure
  $effect(() => {
    void active;
    untrack(() => pill?.sync());
  });
  $effect(() => {
    void tabs.join('\u0001');
    untrack(() => pill?.layout());
  });

  function key(e) {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    active = (active + d + tabs.length) % tabs.length;
    pill?.go(active, true);
    e.currentTarget.parentElement.querySelectorAll('button')[active]?.focus();
  }
</script>

<!-- `.sw` is the item that flies; it only positions (the swipe writes a `transform` on it) -->
<div class="sw" inert={!(appear && shown)} style:--n={tabs.length} use:swipe.item>
<nav class="tabs cg-glass" role="tablist" aria-label="ClickGUI pages" bind:this={track}>
  <i class="thumb" class:off={!ready} bind:this={lens}></i>
  <div class="tl" bind:this={tl}>
    {#each tabs as t, i (t)}
      <button role="tab" aria-selected={i === active} tabindex={i === active ? 0 : -1} class:on={!ready && i === active}
              onclick={(e) => {
                // a mouse / touch press is handled by the pill (pointerup); this is Enter / Space on a focused tab
                if (e.detail === 0) active = i;
              }} onkeydown={key}>{t}</button>
    {/each}
  </div>
  <div class="fg" class:rdy={ready} aria-hidden="true" bind:this={fg}>
    {#each tabs as t (t)}
      <button tabindex="-1">{t}</button>
    {/each}
  </div>
</nav>
</div>

<style>
  /* centred without a transform: left 50% and a negative margin of half the width */
  .sw { position: fixed; left: 50%; top: 14px; z-index: 100001; pointer-events: auto; /* its scaled layer (ClickGuiRoute) is passthrough */ width: calc(var(--n) * 96px + 8px); margin-left: calc(var(--n) * -48px - 4px); }
  .tabs { position: relative; width: 100%; padding: 4px; box-sizing: border-box; border-radius: 18px; user-select: none; touch-action: pan-y; }
  .tl, .fg { display: grid; grid-template-columns: repeat(var(--n), 1fr); }
  /* a copy of the labels with the same grid, clipped to the pill by the engine */
  .fg { position: absolute; inset: 0; padding: 4px; box-sizing: border-box; pointer-events: none; visibility: hidden; }
  .fg.rdy { visibility: visible; }
  /* the pill: left / top / width / height / radius are set by the engine every frame; until the bar is measured it is hidden */
  .thumb { position: absolute; top: 4px; left: 4px; width: 0; height: 0; border-radius: 14px;
    background: rgba(255, 255, 255, .17); box-shadow: inset 0 .5px 0 rgba(255, 255, 255, .3), 0 2px 8px rgba(0, 0, 0, .25); }
  .thumb.off { display: none; }
  /* the pressed pill lifts: a lighter wash and a ring (the engine sets --p on the pill) */
  .thumb::after { content: ''; position: absolute; inset: 0; border-radius: inherit;
    background: rgba(255, 255, 255, calc(var(--p, 0) * .1)); box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, calc(var(--p, 0) * .42)); }
  button { position: relative; height: 30px; border: 0; border-radius: 14px; background: none; padding: 0 8px; font-size: 13px; font-weight: 600; letter-spacing: -.1px;
    color: var(--cg-tx2); cursor: pointer; white-space: nowrap; transition: color .25s; }
  button:hover { color: var(--cg-tx); }
  button.on { color: var(--cg-tx); }
  .fg button { color: var(--cg-tx); }
</style>
