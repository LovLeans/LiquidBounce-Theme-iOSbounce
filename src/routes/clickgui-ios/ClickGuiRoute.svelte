<!--
  Route entry: registered as "/clickgui" in App.svelte (see README.md).

  The GUI is rendered only after the module data has arrived. That {#if} block is created after the
  app is already mounted. In game the windows, the search bar and the tab bar then fly in (lib/menuSwipe.ts) and fly out again
  when the GUI is closed; the windows also do it when the tab is switched. Opened from the dock the GUI is just there (the app
  window growing is the intro) until the tab is switched.
-->
<script module>
  import { listenAlways } from '../../integration/ws';

  // Module toggled in the game (keybind, command, another GUI): mirrored into the open GUI.
  // Registered once, for good: the router wipes the per-route listeners (`cleanupListeners`) whenever the route changes, and
  // this route can be revived after that (the GUI is left, and opened again while it is still leaving), so a listener made
  // with `listen` in the component would be gone while the component is still on screen.
  /** @type {((e: { moduleName: string, enabled: boolean }) => void) | null} */
  let onModuleToggle = null;
  listenAlways('moduleToggle', (e) => onModuleToggle?.(e));
</script>

<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import ClickGui from './lib/ClickGui.svelte';
  import { MenuSwipe } from './lib/menuSwipe';
  import { closing } from './closing';
  import { loadCategories, setEnabled, setSetting, connected, loadError } from './bridge.js';
  import { confirmVirtualScreen, setTyping, setHudEditorSelected } from '../../integration/rest';
  import { persistentDataLoaded, setItem } from '../../integration/persistent_storage';
  import { isTextEntry } from '../../util/utils';
  import { fontsLoaded, loadGuiFonts } from './lib/fonts.js';
  import Stage from './lib/Stage.svelte';
  import TabBar from './tabs/TabBar.svelte';
  import HudEditor from './tabs/HudEditor.svelte';
  import GlobalSettings from './tabs/GlobalSettings.svelte';

  // Two controllers, because they are not always shown together: the windows and the search bar leave on a tab switch, the tab bar
  // (it is what switches the tab) stays. The tab bar's one measures its ripple against the windows' (`reach`), so both still play in
  // step when the GUI opens or closes. The tab bar exists before the modules have loaded, hence the floor.
  const guiSwipe = new MenuSwipe();
  const barSwipe = new MenuSwipe({ reach: guiSwipe, reachFloor: 0.7 });

  let categories = $state.raw(null);
  let error = $state(null); // set when the demo data is shown instead of the real modules
  let gui = null;           // handle from <ClickGui onready>
  let alive = true;         // false once this route is gone: a load that finishes after that must not touch anything
  // Inter (a web font) is loaded at startup (main.ts), so this is true from the first frame. If the GUI is opened before that has finished,
  // it is held back (400 ms at most) rather than drawn in a fallback font and then jumping to Inter (lib/fonts.js).
  let fontsReady = $state(fontsLoaded());

  // ---- tabs: ClickGUI (this GUI) / HUD Editor / Settings. Same names and storage key as the classic GUI, so the page you left is the one you get back.
  const TABS = ['ClickGUI', 'HUD Editor', 'Settings'];
  const TAB_KEY = 'clickgui.tab';
  let tab = $state(0);
  let tabRestored = false;
  $effect(() => { const title = TABS[tab]; if (tabRestored) setItem(TAB_KEY, title); });
  // The HUD editor and the Settings page stay mounted after their tab was left, with `leaving` set: they move out on a spring (lib/pageMorph.js)
  // instead of vanishing on the first frame, and they report `ongone` once they have settled away, which is when they are unmounted. Coming
  // back while one is still leaving turns it around from where it is (nothing is remounted, so nothing restarts or jumps).
  let hudMounted = $state(false);
  let settingsMounted = $state(false);
  $effect(() => { if (tab === 1) hudMounted = true; });
  $effect(() => { if (tab === 2) settingsMounted = true; });
  async function restoreTab() {
    await persistentDataLoaded;
    const i = TABS.indexOf(localStorage.getItem(TAB_KEY) ?? '');
    if (alive && i >= 0) tab = i;
    tabRestored = true;
  }

  // Keys typed into a text field of the HUD editor / settings must not also be game input (the search box
  // and key capture report themselves). Focus events bubble, so one listener on the window covers every field.
  function focusIn(e) { if (connected && isTextEntry(e.target)) setTyping(true).catch(() => {}); }
  function focusOut(e) { if (connected && isTextEntry(e.target)) setTyping(isTextEntry(e.relatedTarget)).catch(() => {}); }

  const mirror = (e) => gui?.setEnabled(e.moduleName, e.enabled);
  onModuleToggle = mirror;

  onMount(() => {
    if (!fontsReady) loadGuiFonts(400).then(() => { if (alive) fontsReady = true; });
    (async () => {
      setHudEditorSelected(false).catch(() => {}); // this screen is not the HUD editor
      restoreTab();
      const loaded = await loadCategories();
      // The modules are loaded one request each, so this can take a while. If the screen was closed in the meantime there
      // is nothing to show, and the client has dropped it: confirming it now would confirm a screen that no longer exists.
      if (!alive) return;
      categories = loaded;
      error = loadError;
      // Tell the client this virtual screen has loaded, like the other routes of the theme do
      if (connected && !get(closing)) confirmVirtualScreen('clickgui').catch(() => {});
    })();
    // cleanup must be returned synchronously (an async onMount would silently drop it)
    return () => {
      alive = false;
      guiSwipe.destroy();
      barSwipe.destroy();
      if (onModuleToggle === mirror) onModuleToggle = null;
      if (connected) setTyping(false).catch(() => {});
    };
  });

  async function onToggle(module) {
    // ClickGui has already flipped module.enabled; undo it if the request could not be sent
    if (!(await setEnabled(module))) module.enabled = !module.enabled;
  }

  // keep keybinds / Esc from firing in the game while the search box or key capture is active
  function onTyping(on) {
    if (connected) setTyping(on).catch(() => {});
  }
</script>

<svelte:window onfocusin={focusIn} onfocusout={focusOut} />

<!-- display: contents: no box of its own (nothing is covered or blocked), but the tokens, the font and the `.clickgui` rules
     (no backdrop blurs while a window carries the layer, button font, focus ring) reach the tabs -->
<div class="clickgui cgx">
  <!-- The app is laid out in a 1920x1080 design space and scaled to the window and the GUI scale, like the iOS menus (lib/Stage.svelte,
       lib/stageMetrics.svelte.ts). Three layers, because they stack differently: the windows and the Settings page (under the HUD editor), the
       HUD editor (its HUD components are NOT scaled: they follow Minecraft's GUI scale; only its own pieces are, see tabs/HudEditor.svelte),
       and the tab bar (over everything, and not covering the HUD editor under it). -->
  <Stage>
    <!-- Only the module windows need the module data. The tab bar and the HUD editor / settings pages do not, so they are NOT
         gated on `categories`: when the GUI is reopened on the HUD editor tab while the modules are still loading (or the load is slow
         because a previous, abandoned load is still being answered), the page is no longer blank. -->
    {#if categories && fontsReady}
      <ClickGui {categories}
                {onToggle}
                onSetting={setSetting}
                {onTyping}
                onready={(api) => (gui = api)}
                active={tab === 0}
                swipe={guiSwipe}
                storageKey="liquidbounce-ios-clickgui-s1" />
    {/if}

    <!-- These stay mounted while the GUI leaves and fade by state (`leaving`): unmounting them with a Svelte outro, and then
         reopening the GUI inside that outro, is what left the page blank. The whole route is removed at the end of the leave. -->
    {#if settingsMounted}<GlobalSettings leaving={$closing || tab !== 2} ongone={() => { if (tab !== 2) settingsMounted = false; }} />{/if}
  </Stage>

  {#if hudMounted}<HudEditor leaving={$closing || tab !== 1} ongone={() => { if (tab !== 1) hudMounted = false; }} />{/if}

  <Stage passthrough z={100001}>
    <TabBar tabs={TABS} bind:active={tab} shown={!$closing && fontsReady} swipe={barSwipe} />
  </Stage>
</div>

{#if error}
  <div class="demo-banner" role="alert">Demo data: could not load the modules from the client ({error})</div>
{/if}

<style>
  .cgx {
    --cg-glass: rgba(60, 60, 67, .42);
    --cg-hi: rgba(255, 255, 255, .14);
    --cg-stroke: rgba(255, 255, 255, .16);
    --cg-fill: rgba(120, 120, 128, .32);
    --cg-tx: #fff;
    --cg-tx2: rgba(235, 235, 245, .6);
    --cg-tx3: rgba(235, 235, 245, .32);
    --cg-accent: var(--accent-color, #0a84ff); /* the theme's accent color (set by App.svelte), iOS blue until it is known */
    --cg-font: 'Inter', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    /* theme of the shared spring switch / slider (src/components/Toggle.svelte, Slider.svelte) */
    --tg-on: var(--cg-accent); --tg-off: var(--cg-fill); --tg-focus: var(--cg-accent);
    --sl-fill: var(--cg-accent); --sl-track: var(--cg-fill); --sl-focus: var(--cg-accent);
    display: contents; color: var(--cg-tx); font-family: var(--cg-font); -webkit-font-smoothing: antialiased; color-scheme: dark;
  }
  /* While an item of the swipe is drawn smaller than 1x (lib/menuSwipe.ts `layer()`), NO layer inside it may keep a `will-change: transform` hint:
     such a layer is never rasterised below 1x, so its text is shrunk from a 1x bitmap (thin, soft) until the scale is above 1 again. */
  :global([data-dip] *) { will-change: auto !important; }
  .demo-banner {
    position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 99999;
    max-width: min(92vw, 720px); padding: 8px 14px; border-radius: 12px;
    font: 12px/1.35 'Inter', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #fff;
    background: rgba(160, 40, 40, .88); border: .5px solid rgba(255, 255, 255, .25);
    user-select: text; pointer-events: none; text-align: center; overflow-wrap: anywhere;
  }
</style>
