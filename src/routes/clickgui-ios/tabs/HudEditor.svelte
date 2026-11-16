<!--
  "HUD Editor" tab. The only HUD editor of the theme (the shared <Hud inEditor> draws the components, they
  are dragged around, snap to the grid / to each other and to one of 9 anchor zones), dressed the iOS way: selection in the theme's accent color,
  rounded zones, glass popovers (ComponentSettings.svelte) and the "Add Component" pill that morphs into a menu (AddComponent.svelte).
-->
<script>
  import { onMount, untrack } from 'svelte';
  import Hud from '../../hud/Hud.svelte';
  import { getGameWindow, setHudEditorSelected } from '../../../integration/rest';
  import {listenSticky} from '../../../integration/ws';
  import { HORIZONTAL_ANCHOR_ZONES, VERTICAL_ANCHOR_ZONES, HUD_EDITOR_GRID_SIZE } from '../../hud/constants';
  import { clamp01 } from '../lib/morph.js';
  import { createPageMorph } from '../lib/pageMorph.js';
  import AddComponent from './AddComponent.svelte';
  import ComponentSettings from './ComponentSettings.svelte';

  // `leaving`: the GUI is being closed in the game, or another tab was picked. The page fades out by state instead of a Svelte outro, because
  // a Svelte outro that is cut short by the GUI being reopened leaves the half faded block behind (see ClickGui.svelte / App.svelte).
  // `ongone`: called once the page has left and is settled, so the route can unmount it.
  let { leaving = false, ongone = () => {} } = $props();

  // The layer swells in and shrinks out on ONE spring (lib/pageMorph.js) whose target is flipped, so switching tab while it is still moving
  // turns it around from where it is. (It used to be a keyframe animation for the intro plus a CSS transition for the leave: the keyframes
  // kept winning over the transition until they ended, and the layer then jumped.) `scale` is the individual property and only exists
  // while it moves: at rest it is `none`, so nothing under the layer gets a containing block of its own.
  let layerEl = $state();
  let page = null;
  function paint(px, py, settled) {
    if (!layerEl) return;
    const st = layerEl.style;
    st.opacity = clamp01((py - 0.05) / 0.4).toFixed(3);
    // no scale: the layer holds the HUD components at their real screen positions, and a scale (it was .965 -> 1 about the screen centre)
    // shifted all of them (up to ~30 px at the edges) until the page had settled
  }

  let dragState = $state(undefined);
  // hidden for the first two frames, so the Add Component button's entrance always plays (same as the tab bar and the windows)
  let appear = $state(false);
  // <Hud> asks the client for its native components as soon as it mounts, so it must not be drawn before the client has been told
  // that the editor is open. Children mount before their parent's onMount, so without this the request went out first.
  let selected = $state(false);
  let scale = $state(2);

  const onDrag = (state) => { dragState = state.dragging ? state : undefined; };
  // HUD coordinates are in "Minecraft pixels": 2 = one pixel per pixel
  const toClient = (v) => (v * scale) / 2;

  onMount(() => {
    page = createPageMorph({ apply: paint, onGone: () => ongone() });
    paint(0, 0, false);   // hidden until the first frame of the spring (the CSS default is the hidden state too)
    page.set(!untrack(() => leaving));
    let a = requestAnimationFrame(() => { a = requestAnimationFrame(() => (appear = true)); });
    getGameWindow().then((w) => { scale = w.scaleFactor; }).catch(() => {});
    setHudEditorSelected(true).catch(() => {}).finally(() => { selected = true; });
    return () => { cancelAnimationFrame(a); page?.destroy(); page = null; setHudEditorSelected(false).catch(() => {}); };
  });
  listenSticky('scaleFactorChange', (e) => { scale = e.scaleFactor; });

  // the editor stays mounted while the GUI leaves (so it can turn around if the GUI is reopened); the client is told about it
  let firstRun = true;
  $effect(() => {
    const open = !leaving;
    if (firstRun) { firstRun = false; return; }
    setHudEditorSelected(open).catch(() => {});
  });
  $effect(() => { const on = !leaving; untrack(() => page?.set(on)); });
</script>

<div class="hud-editor" class:grid={dragState !== undefined} style="background-size: {HUD_EDITOR_GRID_SIZE}px {HUD_EDITOR_GRID_SIZE}px" class:leaving={leaving}>
  <!-- Only this layer fades when the page is left (the components, the zones, the guides). It is NOT done with an opacity / animation on
       the page itself: the Add Component pill / menu must not sit under a parent with opacity < 1 while it is open (its edge-blur layers would stop seeing the
       list). It has its own enter / leave (AddComponent.svelte). -->
  <div class="layer" bind:this={layerEl}>
    {#if dragState}
      <div class="zones">
        {#each VERTICAL_ANCHOR_ZONES as v (v)}
          {#each HORIZONTAL_ANCHOR_ZONES as h (h)}
            <div class="zone" class:active={dragState.verticalZone === v && dragState.horizontalZone === h}>
              <i class="dot h-{h} v-{v}"></i>
            </div>
          {/each}
        {/each}
      </div>
      {#if dragState.verticalGuide !== undefined}<i class="guide vertical" style="left:{toClient(dragState.verticalGuide)}px"></i>{/if}
      {#if dragState.horizontalGuide !== undefined}<i class="guide horizontal" style="top:{toClient(dragState.horizontalGuide)}px"></i>{/if}
    {/if}

    {#if selected}
      <Hud inEditor onDragStateChange={onDrag} magneticTargetIds={dragState?.magneticTargetIds ?? []} settingsComponent={ComponentSettings} />
    {/if}
  </div>

  <!-- A crash inside the Add Component pill must never take the whole editor (components, zones, guides) down with it: the boundary
       keeps the rest alive and shows what went wrong (the same text is in the console). -->
  <svelte:boundary onerror={(e) => console.error('[ios-clickgui] the Add Component menu crashed', e)}>
    <AddComponent visible={appear && !leaving} />
    {#snippet failed(error)}
      <p class="add-failed" role="alert">Add Component crashed: {error instanceof Error ? error.message : String(error)}{error instanceof Error && error.stack ? ' | ' + error.stack.split('\n').slice(1, 4).map((l) => l.trim()).join(' | ') : ''}</p>
    {/snippet}
  </svelte:boundary>
</div>

<style>
  .hud-editor {
    /* its own stacking context above whatever the page keeps underneath: the components take their z-index from the client, and
       the Add Component button / the popovers must never end up behind something else */
    position: fixed; inset: 0; z-index: 1000; isolation: isolate;
    /* the shared HUD pieces (DraggableComponent) take their colors from these: the theme's accent color, the same one as the ArrayList line and the ClickGUI */
    --clickgui-hud-editor-grid-color: rgba(255, 255, 255, .055);
    --clickgui-hud-editor-draggable-element-outline-color: color-mix(in srgb, var(--accent-color) 95%, transparent);
    --clickgui-hud-editor-draggable-element-background-color: color-mix(in srgb, var(--accent-color) 15%, transparent);
    --clickgui-hud-editor-magnetic-reference-background-color: color-mix(in srgb, var(--accent-color) 40%, transparent);
    --clickgui-hud-editor-draggable-element-position-outline-color: transparent;
    --clickgui-hud-editor-draggable-element-position-background-color: color-mix(in srgb, var(--accent-color) 92%, transparent);
    --clickgui-text-dimmed-color: #fff;
    --clickgui-hud-editor-radius: 6px;
    --clickgui-hud-editor-badge-radius: 7px;
    --clickgui-hud-editor-badge-padding: 0 7px;
  }
  .hud-editor.leaving { pointer-events: none; }
  .add-failed { position: absolute; top: 64px; left: 50%; transform: translateX(-50%); z-index: 100000; max-width: min(92vw, 760px); margin: 0; padding: 8px 14px; border-radius: 14px;
    font: 12px/1.35 'Inter', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #fff; background: rgba(160, 40, 40, .9); text-align: center; overflow-wrap: anywhere; user-select: text; pointer-events: none; }
  /* The page opens and leaves like the morphing menu (the springs are in lib/pageMorph.js; it writes opacity / scale of the layer every frame).
     The defaults here are the HIDDEN state, so the layer is never visible for a frame before the first paint of the spring. */
  .layer { position: absolute; inset: 0; opacity: 0; }
  .grid {
    background-image: linear-gradient(to right, var(--clickgui-hud-editor-grid-color) 1px, transparent 1px),
                      linear-gradient(to bottom, var(--clickgui-hud-editor-grid-color) 1px, transparent 1px);
  }
  .zones { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); gap: 10px; padding: 10px; box-sizing: border-box; pointer-events: none; }
  .zone { position: relative; border-radius: 22px; border: 1.5px dashed rgba(255, 255, 255, .13); background: rgba(255, 255, 255, .02); transition: background .2s, border-color .2s; }
  .zone.active { border: 1.5px solid color-mix(in srgb, var(--accent-color) 80%, transparent); background: color-mix(in srgb, var(--accent-color) 10%, transparent); }
  .dot { position: absolute; width: 8px; height: 8px; border-radius: 50%; background: rgba(255, 255, 255, .4); transform: translate(var(--tx, -50%), var(--ty, -50%));
    transition: width .15s, height .15s, background .15s, box-shadow .15s; }
  .dot.h-left { left: 10px; --tx: 0; } .dot.h-center { left: 50%; } .dot.h-right { left: calc(100% - 10px); --tx: -100%; }
  .dot.v-upper { top: 10px; --ty: 0; } .dot.v-center { top: 50%; } .dot.v-lower { top: calc(100% - 10px); --ty: -100%; }
  .zone.active .dot { width: 14px; height: 14px; background: #fff; box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent-color) 55%, transparent), 0 0 14px color-mix(in srgb, var(--accent-color) 80%, transparent); }
  .guide { position: absolute; z-index: 1; pointer-events: none; background: var(--accent-color); box-shadow: 0 0 8px color-mix(in srgb, var(--accent-color) 80%, transparent); }
  .guide.vertical { top: 0; bottom: 0; width: 1px; transform: translateX(-50%); }
  .guide.horizontal { left: 0; right: 0; height: 1px; transform: translateY(-50%); }
</style>
