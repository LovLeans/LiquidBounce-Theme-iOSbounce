<!--
  The little popover above (or below) a HUD component in the HUD editor: [x] Name [v], and the component's settings under it.
  The popover over each component (DraggableComponent's `settingsComponent`).
  The [x] removes the component: the theme hides it at once and remembers it (`onRemoved`, see hud/positions.ts), whatever the client
  does with the request that switches it off too. The popover sits above the component, or below it when the component is in the upper
  half of the screen, and is pushed back inside the screen at the sides.
-->
<script module>
  // The last settings of each component, kept across rebuilds of its popover. After a change the client swaps the component (new id) and the
  // HUD can rebuild the popover; the settings are read again, which may not work right away. Meanwhile the popover shows these instead of
  // going empty (no chevron, no settings) until the editor is reopened.
  const lastSettings = new Map();
</script>

<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { drawer } from '../lib/transitions.js';
  import { getComponentSettings, setComponentSettings } from '../../../integration/rest';
  import { spaceSeperatedNames } from '../../../theme/theme_config';
  import { spaced, wasOpen, rememberOpen } from './settings/util.js';
  import { reloadHud } from '../../hud/reload';
  import { rememberOptions, applyOptionsToTree } from '../../hud/options';
  import Setting from './settings/Setting.svelte';
  import { pressPhysics } from '../../menu/title/main-menu/pressPhysics';

  let { name, id, alignment, onRemoved = undefined, overlayOffset = 0 } = $props();

  const EDGE = 10; // keep this far from the screen edge

  let el = $state();
  let cfg = $state(lastSettings.has(name) ? structuredClone(lastSettings.get(name)) : null);
  let below = $state(false);
  let shiftX = $state(0);
  let open = $state(wasOpen('hud/' + name));
  $effect(() => { rememberOpen('hud/' + name, open); });

  const title = $derived($spaceSeperatedNames ? spaced(name) : name);
  // The options under the title: everything except the component's own "Enabled" switch and its Alignment. Found by NAME, not by position
  // (the old `slice(1)` dropped the first option whenever the client's list did not start with "Enabled", which left an empty popover).
  const isNode = (x) => x && typeof x === 'object' && x.name && x.valueType;
  const norm = (v) => String(v).toLowerCase().replace(/[^a-z0-9]/g, '');
  // Options the popover does not offer (still sent to the client unchanged, they are only not drawn): Block Counter's Icon Position.
  const HIDDEN = { blockcounter: ['iconposition'] };
  const isOption = (x) => isNode(x) && norm(x.name) !== 'enabled' && x.name !== 'Alignment'
    && !(HIDDEN[norm(name)] ?? []).includes(norm(x.name));
  const nested = $derived(cfg && Array.isArray(cfg.value) ? cfg.value.filter(isOption) : []);

  // Above or below the component, and pushed back inside the screen. Everything is measured against the editor's own area (it fills the
  // screen) instead of the window: while the GUI opens, the whole layer is being scaled / moved, so the window's size is the wrong
  // yardstick (components in the upper half came out "below the middle" and the popover sat in the wrong place until the animation was over).
  // Against the editor's area the result is the same during the animation as at rest, so the popover is simply right from the first frame.
  async function place() {
    await tick();
    if (!el) return;
    const area = el.closest('.hud-editor')?.getBoundingClientRect();
    const scr = area && area.width > 0 && area.height > 0
      ? area : { left: 0, top: 0, right: innerWidth, bottom: innerHeight, width: innerWidth, height: innerHeight };
    const k = scr.width / innerWidth || 1;   // how much the layer is scaled right now (1 at rest)
    const comp = el.parentElement;
    if (comp) {
      const r = comp.getBoundingClientRect();
      below = (r.top + r.height / 2 - scr.top) / scr.height < 0.5;
    }
    const b = el.getBoundingClientRect();
    shiftX = b.right > scr.right - EDGE * k ? (scr.right - EDGE * k - b.right) / k
      : b.left < scr.left + EDGE * k ? (scr.left + EDGE * k - b.left) / k : 0;
  }
  // the component moved (another alignment / offset): place the popover again
  $effect(() => { alignment.horizontalAlignment; alignment.horizontalOffset; alignment.verticalAlignment; alignment.verticalOffset; place(); });
  // opening / closing the settings changes the popover's size, which can push it over the edge
  $effect(() => { open; nested.length; place(); });

  // The component's own "Enabled" switch (the first setting; found by name first, in case the client's order differs).
  const enabledOf = (c) => (c && Array.isArray(c.value)
    ? c.value.find((x) => x && typeof x.name === 'string' && x.name.toLowerCase() === 'enabled' && 'value' in x) ?? c.value[0]
    : null);

  let timer = 0, dirty = false, alive = true;
  let sending = null, again = false;   // one request at a time, so they cannot overtake each other on their way to the client
  let removing = $state(false), failed = $state(false), failTimer = 0;
  /** Why the last save of a changed setting failed (shown in the popover, so it does not hide in the console); empty when it worked. */
  let saveError = $state('');

  /** sends the whole tree; resolves true when the client took it. A change made while a request is out is sent right after it. */
  function send() {
    clearTimeout(timer); timer = 0;
    if (!cfg) return Promise.resolve(false);
    if (sending) { again = true; return sending; }
    sending = (async () => {
      let ok = true;
      do {
        again = false; dirty = false;
        lastSettings.set(name, $state.snapshot(cfg));
        // right after a change the client swaps the component and hands out a new id (this prop follows it): a save that
        // hits the old id is tried again a moment later with whatever id the prop has by then
        for (let attempt = 1; attempt <= 3; attempt++) {
          try { await setComponentSettings(id, $state.snapshot(cfg)); ok = true; saveError = ''; break; }
          catch (e) {
            ok = false; saveError = e instanceof Error ? e.message : String(e);
            console.warn('[ios-clickgui] saving the component settings failed (try ' + attempt + ')', e);
            if (attempt < 3 && alive) await new Promise((r) => setTimeout(r, 400 * attempt));
          }
        }
      } while (again);
      sending = null;
      return ok;
    })();
    return sending;
  }
  // the HUD shows the choice at once (hud/options.ts); the client is told a moment later
  // `lastSettings` still holds the tree as it was before this change (it is set when the settings are read and when they are sent), so
  // only what changed is remembered, not every value the tree happened to hold.
  function changed() { dirty = true; rememberOptions(name, $state.snapshot(cfg), lastSettings.get(name)); clearTimeout(timer); timer = setTimeout(send, 150); }

  /** Why the settings could not be read (shown under the title while there is nothing else to show). */
  let loadNote = $state('');

  // The settings arrive after the popover is shown; if that read failed, the remove button tries it again when it is pressed.

  async function load(tries = 6) {
    for (let attempt = 1; alive && cfg === null && attempt <= tries; attempt++) {
      try {
        const s = await getComponentSettings(id);
        // an unknown / just replaced id gets an error object back instead of the settings; so does a tree with nothing to show
        if (!s || !Array.isArray(s.value)) throw new Error('the client answered: ' + JSON.stringify(s).slice(0, 160));
        s.value = s.value.filter((x) => x && x.name !== 'Alignment');
        if (!s.value.some(isNode)) throw new Error('no settings in the answer: ' + JSON.stringify(s).slice(0, 160));
        if (alive && cfg === null) {
          // what the user chose before (hud/options.ts) goes over what the client says: it keeps nothing for this theme and can answer with
          // the defaults. When they differ the client is told again, so it holds the choices too.
          const differs = applyOptionsToTree(name, s);
          cfg = s;
          loadNote = '';
          lastSettings.set(name, $state.snapshot(cfg));
          if (differs) { dirty = true; clearTimeout(timer); timer = setTimeout(send, 150); }
        }
        return;
      } catch (e) {
        loadNote = e instanceof Error ? e.message : String(e);
        console.warn('[ios-clickgui] could not load the component settings (try ' + attempt + ')', e);
        // the client may still be busy with the component: wait a little and ask again (the id prop may be new by then)
        if (attempt < tries) await new Promise((r) => setTimeout(r, 300 * attempt));
      }
    }
  }

  function flashFailed() {
    failed = true;
    clearTimeout(failTimer);
    failTimer = setTimeout(() => (failed = false), 2600);
  }

  async function remove() {
    if (removing) return;
    removing = true; failed = false;

    // A component of the theme: the theme hides it itself and does not wait for the client (it did not always show the change, so the
    // component stayed). The client is still told, as far as it takes it; this popover is gone with the component, the request goes on.
    if (onRemoved) {
      if (!cfg) await load(1);
      const sw = enabledOf(cfg);
      if (sw) { sw.value = false; send(); }
      onRemoved();
      removing = false;
      return;
    }

    if (!cfg) await load(1);
    const on = enabledOf(cfg);
    if (!on) { removing = false; flashFailed(); return; }
    on.value = false;
    const ok = await send();
    removing = false;
    if (ok) { reloadHud(); return; } // the client's update normally takes it away; the reload makes sure it does
    on.value = true;                 // the client did not take it: the component stays, and the button says so
    flashFailed();
  }

  // The client gave this component a new id (the box and this popover stay). The tree already held here is the one the client was given
  // (it IS the component's settings), so nothing is read again: a re-read of the new id could come back empty and used to wipe the popover
  // (no chevron, no options) until the page was reloaded. Only a popover that still has nothing reads (again) with the new id.
  let loadedFor = id;
  $effect(() => { if (id !== loadedFor) { loadedFor = id; if (cfg === null) load(); } });

  onMount(() => {
    const ro = new ResizeObserver(place);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    addEventListener('resize', place);
    load();
    // measure once more when the animations around it have settled
    Promise.allSettled(document.getAnimations().map((a) => a.finished)).then(place);
    return () => { ro.disconnect(); removeEventListener('resize', place); };
  });
  onDestroy(() => { alive = false; clearTimeout(timer); clearTimeout(failTimer); if (dirty) send(); });
</script>

<div class="wrap" class:below bind:this={el} style="--o:{overlayOffset}px">
  <div class="pop cg-glass" style="transform: translateX({shiftX}px)">
    <div class="head">
      <button class="rm" class:bad={failed} class:busy={removing} title={failed ? 'Could not remove the component (the client did not take it)' : 'Remove component'} aria-label="Remove {title}" use:pressPhysics onclick={remove} disabled={removing}>
        <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 2 8 8M8 2 2 8"/></svg>
      </button>
      {#if nested.length}
        <button class="ttl" aria-expanded={open} use:pressPhysics={{ strength: 0.35 }} onclick={() => (open = !open)}>
          <span class="tin" data-press-label>
            <span class="nm">{title}</span>
            <svg class="chev" class:open viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5 5 6.5 8 3.5"/></svg>
          </span>
        </button>
      {:else}
        <span class="ttl static"><span class="nm">{title}</span></span>
      {/if}
    </div>
    {#if cfg === null && loadNote}<p class="err">Settings could not be read: {loadNote}</p>{/if}
    {#if open && nested.length}
      <!-- same drawer as the windows' (blur eases in / out with the spring). The glass is its own layer behind the content (see .pop below),
           so the blurred, height-animating drawer is not a child of the element that has the backdrop blur. -->
      <div class="sub" transition:drawer>
        <div class="card" onwheel={(e) => e.stopPropagation()}>
          {#each nested as s (s.name)}<Setting {s} onchange={changed} onrelease path={'hud/' + name} />{/each}
        </div>
        {#if saveError}<p class="err">{saveError}</p>{/if}
      </div>
    {/if}
  </div>
  <i class="arrow"></i>
</div>

<style>
  /* above the component by default (its bottom edge 14px over the component's top), below it for components in the upper half of the screen.
     Anchored with bottom / top, NOT translateY(-100%): a percentage of the popover's own height changes on every frame of a drawer
     opening or closing, and with a transition on the transform the popover lagged behind and wobbled (the "glitch"). */
  .wrap { position: absolute; left: 50%; bottom: calc(100% + 14px + var(--o)); z-index: 2; transform: translateX(-50%);
    transition: bottom .28s cubic-bezier(.3, 1.1, .5, 1), top .28s cubic-bezier(.3, 1.1, .5, 1); }
  .wrap.below { bottom: auto; top: calc(100% + 14px + var(--o)); }
  /* The glass (tint + backdrop blur) is on two layers BEHIND the content, as in the windows (Panel.svelte), not on .pop itself. The drawers
     inside animate their height AND a `filter: blur()`; with the backdrop blur on their own ancestor that made the popover flicker, which
     is why the blur had been taken off the drawers here. As siblings of the content the two do not interact, so the drawers can blur
     open like everywhere else. The inset highlight moves to the tint layer (it would sit under it on .pop); the drop shadow stays on .pop. */
  .pop { position: relative; isolation: isolate; width: 224px; border-radius: 16px; font-family: var(--cg-font); color: var(--cg-tx); user-select: none;
    background: none; -webkit-backdrop-filter: none; backdrop-filter: none; box-shadow: 0 12px 40px rgba(0, 0, 0, .28); }
  .pop::before { content: ''; position: absolute; inset: 0; z-index: -1; border-radius: inherit; pointer-events: none;
    background: var(--cg-glass); box-shadow: inset 0 .5px 0 rgba(255, 255, 255, .28); }
  .pop::after { content: ''; position: absolute; inset: 0; z-index: -2; border-radius: inherit; pointer-events: none;
    -webkit-backdrop-filter: blur(28px) saturate(1.8); backdrop-filter: blur(28px) saturate(1.8); }
  /* While an app window carries the screen layer (the GUI opening out of / closing into its dock icon: overlayfx.ts marks the layer with
     data-fx-carry) there are no backdrop blurs, same rule as the ClickGUI windows and the Settings page (ClickGui.svelte, GlobalSettings.svelte).
     The popover's blur is a pseudo-element, which `.cg-glass` rule there does not reach. Over a layer that is scaled / clipped / re-laid-out
     every frame the ~10 popover blurs dropped out for single frames: the popovers went flat purple bars without their text for a few frames
     right after the editor opened. The glass is just its tint for that time (the window already blurs what is behind it). */
  :global([data-fx-carry] .clickgui .pop::after) { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
  .head { display: flex; align-items: center; gap: 4px; padding: 5px 8px 5px 5px; min-height: 34px; box-sizing: border-box; }
  .rm { width: 24px; height: 24px; flex: none; display: grid; place-items: center; border: 0; border-radius: 50%; background: var(--cg-fill); color: var(--cg-tx2); cursor: pointer;
    transition: background .2s, color .2s; will-change: scale; } /* swell / squeeze / brightness: the spring action (pressPhysics) */
  .rm:hover:not(:disabled) { background: #ff453a; color: #fff; }
  .rm:disabled { opacity: .4; cursor: default; }
  .rm.busy:disabled { opacity: .7; }
  .rm.bad { background: #ff453a; color: #fff; animation: rm-no .3s; }
  @keyframes rm-no { 20% { transform: translateX(-3px); } 50% { transform: translateX(3px); } 80% { transform: translateX(-1px); } }
  .rm svg { width: 9px; height: 9px; }
  .ttl { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 4px 6px; border: 0; border-radius: 9px; background: none; font-size: 13px; font-weight: 600; text-align: left; cursor: pointer; }
  .tin { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .ttl.static { cursor: default; }
  .ttl:not(.static):hover { background: var(--cg-hi); }
  .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chev { width: 10px; height: 10px; flex: none; color: var(--cg-tx2); transition: transform .45s cubic-bezier(.3, 1.4, .5, 1); }
  .chev.open { transform: rotate(180deg); }
  .sub { box-sizing: border-box; padding: 0 6px 6px; }
  .err { margin: 6px 4px 0; font-size: 11px; line-height: 1.3; color: #ff6a5f; word-break: break-word; }
  .pop > .err { margin: 0 12px 8px; }
  .card { max-height: 320px; overflow-y: auto; border-radius: 12px; background: rgba(255, 255, 255, .06); scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, .25) transparent; overscroll-behavior: contain; }
  /* the arrow points at the component: down when the popover is above it, up when it is below */
  .arrow { position: absolute; left: 50%; width: 20px; height: 9px; margin-left: -10px; background: var(--cg-glass); pointer-events: none; }
  .wrap:not(.below) .arrow { top: 100%; clip-path: polygon(0 0, 50% 100%, 100% 0); }
  .wrap.below .arrow { bottom: 100%; clip-path: polygon(0 100%, 50% 0, 100% 100%); }
  @media (prefers-reduced-motion: reduce) { .wrap { transition: none; } }
</style>
