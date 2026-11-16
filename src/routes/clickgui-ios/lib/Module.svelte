<script>
  import { getContext } from 'svelte';
  import { drawer } from './transitions.js';
  import SettingRow from './SettingRow.svelte';
  import { flash, drawerWasOpen, rememberDrawer } from './stores.js';

  let { module } = $props();
  const gui = getContext('gui');
  let open = $state(drawerWasOpen(module.name));   // a drawer left open stays open the next time the GUI is opened
  $effect(() => rememberDrawer(module.name, open));
</script>

<div class="mod" class:on={module.enabled} class:open class:flash={$flash === module.name} data-mod={module.name}>
  <div class="head">
    <button class="top" aria-pressed={module.enabled}
            onclick={() => gui.toggle(module)}
            oncontextmenu={(e) => { e.preventDefault(); open = !open; }}>
      <span>{module.name}</span><i class="dot"></i>
    </button>
    <button class="more" aria-label="Toggle settings" aria-expanded={open} onclick={() => (open = !open)}>
      <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5 5 6.5 8 3.5"/></svg>
    </button>
  </div>

  {#if open}
    <div class="drawer" transition:drawer>
      <div class="group">
        {#each module.settings as s, i (s.path ? s.path.join('/') : s.name + '#' + i)}<SettingRow {s} mod={module} {i} />{/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .mod { border-radius: 14px; transition: background .35s; }
  .head { position: relative; }
  .top { width: 100%; border: 0; background: none; padding: 8px 26px; text-align: center; font-size: 14px;
    color: var(--cg-tx2); cursor: pointer; border-radius: 14px; position: relative;
    transition: color .25s, background .25s, transform .15s; }
  .top:hover { background: var(--cg-hi); }
  .top:active { transform: scale(.97); }
  .on .top { color: var(--cg-tx); font-weight: 600; }
  .dot { position: absolute; right: 12px; top: 50%; width: 6px; height: 6px; margin-top: -3px; border-radius: 50%;
    background: var(--cg-accent); box-shadow: 0 0 10px var(--cg-accent);
    transform: scale(0); opacity: 0; transition: transform .4s cubic-bezier(.3, 1.8, .5, 1), opacity .2s; }
  .on .dot { transform: scale(1); opacity: 1; }
  .more { position: absolute; left: 6px; top: 50%; margin-top: -11px; width: 22px; height: 22px; border: 0; border-radius: 50%;
    background: none; color: var(--cg-tx3); cursor: pointer; opacity: 0; display: grid; place-items: center;
    transition: opacity .2s, transform .45s cubic-bezier(.3, 1.4, .5, 1), color .2s; }
  .more svg { width: 10px; height: 10px; }
  .head:hover .more, .open .more, .more:focus-visible { opacity: 1; }
  .open .more { transform: rotate(180deg); color: var(--cg-tx); }
  @media (hover: none) { .more { opacity: 1; } }
  .flash .top { animation: flash 1.6s ease-out; }
  @keyframes flash { 0%, 55% { background: color-mix(in srgb, var(--cg-accent) 50%, transparent); } 100% { background: transparent; } }
  .drawer { box-sizing: border-box; padding: 2px 2px 6px; }
  /* no dark box: a frosted shape whose edges are blurred into the window */
  .group { position: relative; isolation: isolate; padding: 2px 0; }
  .group::before { content: ''; position: absolute; inset: 2px; z-index: -1; border-radius: 14px;
    background: rgba(255, 255, 255, .09); filter: blur(6px); pointer-events: none; }
</style>
