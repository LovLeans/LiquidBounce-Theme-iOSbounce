<!--
  iOS ClickGUI  (Svelte 5, runes)
  ================================================================
  SETUP
    npm install
    npm run dev            # demo with a fake backdrop (src/App.svelte)
    npm run build

  USAGE
    import ClickGui from './lib/ClickGui.svelte';

    <ClickGui categories={categories}
              onToggle={(module) => ...}
              onSetting={(module, setting) => ...}
              onTyping={(isTyping) => ...}       (optional: true while the search box / key capture is active)
              onready={(api) => ...}             (optional: api.setEnabled(name, bool) updates a module from outside)
              storageKey="my-theme-layout"      (optional)
              startCollapsed={true} />           (optional, default true)

  DATA SHAPE  (see src/lib/data.js for a full example)
    categories = [{ name, icon (inner SVG markup, 16x16 viewBox),
                    modules: [{ name, enabled, settings: [...] }] }]

    setting types:
      { type: 'toggle', name, value: boolean }
      { type: 'slider', name, value, min, max, step, suffix? }
      { type: 'choice', name, value, options: string[] }
      { type: 'bind',   name, value: 'None' | 'R' | ... }
      { type: 'group',  name, open?: boolean, children: setting[] }   (nestable)

    The array is wrapped in $state, so the objects are deeply reactive. The
    callbacks receive those live objects: send them to the client in
    onToggle / onSetting. To push changes from the client back into the UI,
    mutate the same objects (module.enabled = ..., setting.value = ...).
    Pass `categories` once at creation; to swap it later, re-mount with {#key}.

  LIQUIDBOUNCE THEME
    This folder is a route: ../ClickGuiRoute.svelte loads the modules through ../bridge.js,
    converts them into `categories` and renders this component. See ../README.md.
    The root is position: fixed; inset: 0, so it sits over the game view.
    Slider settings may carry an optional `suffix` (shown next to the value).

  CONTROLS
    Click module ........ toggle on/off
    Right-click module .. open/close settings (or use the chevron on hover/touch)
    Header drag ......... move a window ANYWHERE on screen (kept inside the viewport)
    Click a window ...... bring it to the front
    Header click (no movement) or right-click ... open / collapse window. Dragging never toggles it.
    Default layout: rows with a gap (only for windows without a saved position). Windows never move by themselves: resizing the screen / windowed mode leaves them where they are.
    Windows start COLLAPSED the first time (set startCollapsed={false} to start open); after that the GUI reopens the way it was left.
    Expanding/collapsing a window plays a blur + fade + slide, like the settings drawer.
    Window positions are saved to localStorage under `storageKey`; which windows / module drawers are open under `<storageKey>:open`,
    guarded so it silently skips if storage is unavailable. Clear that key to reset positions.
    /  .................. focus search      Enter .... toggle first match
    Arrow keys .......... move in results    Shift+Enter / right-click result .... locate

  THEMING   override these CSS variables on `.clickgui`:
    --cg-glass --cg-hi --cg-stroke --cg-fill --cg-tx --cg-tx2 --cg-tx3
    --cg-accent --cg-font

  SCROLLING   src/lib/scroller.js: momentum, rubber band and the edge blur of every window (constants at the top)
  ANIMATION   tweak src/lib/transitions.js (drawer: duration, easing, blur, scale)
              (the rows have no animation of their own: the drawer's moving edge reveals them). The windows themselves fly in / out with the swipe
              (src/lib/menuSwipe.ts, state: `shown`; its constants are DEFAULT_SWIPE_CONFIG), leave time in ../closing.ts.
-->
<script module>
  // `--in` (0..1) is how visible a window is. The glass, border, shadow and content of a window each read it, instead of
  // the window having an `opacity`: any opacity below 1 on a parent makes Chromium stop the glass from blurring what is
  // behind it, so the blur would only pop in at the very end. Registered, so that CSS transitions can animate it.
  try { CSS.registerProperty({ name: '--in', syntax: '<number>', inherits: true, initialValue: '1' }); } catch { /* already registered / unsupported */ }
</script>

<script>
  import { setContext, untrack } from 'svelte';
  import { closing } from '../closing';
  import { MenuSwipe } from './menuSwipe';
  import { fx } from '../../menu/title/main-menu/overlayfx';
  import { scrollTo } from './scroller.js';
  import Panel from './Panel.svelte';
  import Search from './Search.svelte';
  import { flash, useOpenMemory, rememberedWindows, rememberWindows } from './stores.js';

  let { categories = [], onToggle = () => {}, onSetting = () => {}, onTyping = () => {}, storageKey = 'ios-clickgui-layout', startCollapsed = true, onready = () => {}, active = true, swipe: swipeProp = null } = $props();   // active: false while another tab (HUD editor, settings) is shown: the windows leave like on closing

  const PW = 224, GAP = 22, HH = 42, MARGIN = 24;   // window width, space between windows, header height, space to the screen edge
  let root = $state();

  // ---- appearing / leaving: ONE state (`shown`), played by the swipe animation (lib/menuSwipe.ts) ----
  // Every window and the search bar fly in from the camera, staggered by their distance from the centre of the screen, and the same
  // animation plays backwards when they leave. `shown` is the only input, and a change in the middle of the animation (reopened while
  // leaving, closed while still appearing) turns around from where it is.
  // When it plays:  - in game: the GUI opens / closes with it (`closing` is set by App.svelte when the client closed the GUI)
  //                 - on every tab switch (`active`: the windows leave while the HUD editor / settings are shown, and come back)
  // When it does NOT: mounted while a dock window is still growing the layer (`carried`). The window growing IS the intro, so the
  //                 windows are simply there and grow with it, like the other screens do (nothing on top of that).
  // `swipe` is made by the route when the tab bar has to ripple in step with the windows (it needs the same normalisation, see
  // ClickGuiRoute.svelte); used on its own the GUI makes its own.
  const swipe = swipeProp ?? new MenuSwipe();
  $effect(() => () => { if (!swipeProp) swipe.destroy(); });
  setContext('swipe', swipe);

  const carried = fx.active();
  let ready = $state(carried);
  const shown = $derived(ready && !$closing && active);
  $effect(() => {
    if (ready) return;
    // mounted hidden, shown two frames later, so the animation always starts from a frame that was really drawn
    let id = requestAnimationFrame(() => { id = requestAnimationFrame(() => (ready = true)); });
    return () => cancelAnimationFrame(id);
  });
  // a focused search box / key capture must not keep the keyboard away from the game while the windows leave
  $effect(() => {
    if (shown || !ready) return;
    const a = document.activeElement;
    if (a instanceof HTMLElement && root?.contains(a)) a.blur();
  });

  // deeply reactive copy: module/setting mutations update the UI everywhere
  let cats = $state(categories);
  const names = categories.map((c) => c.name);

  // ---- opening phase: no backdrop blurs while the windows are still flying ----
  // Every backdrop blur has to be redone each frame while its window moves (the backdrop moves under it), and an open window has a
  // big glass plus 10 masked edge-blur layers, ~80 blurs in total: that was the lag while the GUI opened, worst with windows left
  // expanded. So until the windows are exactly in their place (`swipe.settleMs`, ~1.4 s: the swipe overshoots and rings out for a
  // while, and switching ~100 blurs on while something still moves made windows lose their glass for a few frames) they are drawn
  // as their tint only, and the blurs fade in (Panel.svelte: `opening` / `quiet`) once everything is in place. The same goes for
  // leaving: a window that is flying towards the camera is many times its size, and blurring that is far too heavy, so a window that is
  // not `shown` is quiet as well. Same idea as the dock path (data-fx-carry), which does it with the window's own
  // blur. fx.settled() also waits for a dock window that is still growing the layer.
  let opening = $state(true);
  let animated = false;   // false for the first showing when it is `carried`: nothing flies, so there is nothing to wait for
  let firstRun = true;
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;   // no flying: they just appear / go
  $effect(() => {
    const on = shown;
    // drive the animation
    untrack(() => {
      if (firstRun) {
        firstRun = false;
        if (on) swipe.snap(true);   // carried by a dock window (or the tab is already shown): simply there
        else animated = true;       // starts hidden; the first showing flies in
      } else if (still) {
        animated = false;
        swipe.snap(on);
      } else {
        animated = true;
        swipe.setOpen(on);
      }
    });
    if (!on) return;             // hidden / leaving: nothing is moving in
    opening = true;              // (re)shown, e.g. reopened while it was leaving
    let dead = false;
    const wait = animated ? untrack(() => swipe.settleMs) : 0;
    const t = setTimeout(() => { fx.settled().then(() => { if (!dead) opening = false; }); }, wait);
    return () => { dead = true; clearTimeout(t); };
  });

  const clampX = (x, w) => Math.max(4, Math.min(x, w - PW - 4));
  const clampY = (y, h) => Math.max(4, Math.min(y, h - 52));

  // ---- default layout: rows of windows with a gap between them. Too narrow for one row -> the row wraps (never overlaps) ----
  function grid(w, h) {
    const n = names.length;
    const cols = Math.max(1, Math.min(n, Math.floor((w - 2 * MARGIN + GAP) / (PW + GAP))));
    const rows = Math.ceil(n / cols);
    const rowH = (startCollapsed ? HH : Math.min(h * 0.72, 680)) + GAP;
    const top = Math.max(8, Math.min(h * 0.29, 260, h - rows * rowH - 12));
    return names.map((_, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const inRow = r === rows - 1 ? n - r * cols : cols;   // every row is centred on its own
      const x0 = (w - (inRow * PW + (inRow - 1) * GAP)) / 2;
      return { x: clampX(x0 + c * (PW + GAP), w), y: clampY(top + r * rowH, h) };
    });
  }
  // Positions are plain pixels and nothing moves a window except the user: no re-flow, no clamping, no overlap check when the screen / window
  // is resized or the GUI is opened at another size (windowed mode). The default grid above is only used for a window that has no saved position.

  // windows the user left open come back open (`startCollapsed` is only the default for the very first time)
  useOpenMemory(storageKey);
  const wasOpen = rememberedWindows();
  function initial() {
    const g = grid(innerWidth, innerHeight);
    const d = Object.fromEntries(names.map((k, i) => [k, { x: g[i].x, y: g[i].y, z: i + 1, collapsed: wasOpen ? !wasOpen.has(k) : startCollapsed }]));
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (saved) {
        names.forEach((k) => {
          const v = saved[k];
          if (!v) return;
          d[k].z = v.z ?? d[k].z;                                                   // collapsed is never restored
          if (Number.isFinite(v.x) && Number.isFinite(v.y)) { d[k].x = v.x; d[k].y = v.y; }   // exactly where the user left it, whatever the screen size is now
        });
      }
    } catch {}
    return d;
  }
  let layout = $state(initial());
  let zTop = Math.max(0, ...Object.values(layout).map((p) => p.z));

  const front = (name) => { if (layout[name].z !== zTop) layout[name].z = ++zTop; };
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify($state.snapshot(layout))); } catch {}
  }
  // a window was opened / collapsed: remember it (the first run only reads the state that was just restored)
  let openSeen = false;
  $effect(() => {
    const open = names.filter((k) => !layout[k].collapsed);
    untrack(() => { if (openSeen) rememberWindows(open); openSeen = true; });
  });
  // a window was dragged: remember it
  function moved() { save(); }

  // handle for the route: push changes made in the game into the (deeply reactive) module objects
  onready({
    setEnabled(name, enabled) {
      for (const c of cats) { const m = c.modules.find((x) => x.name === name); if (m) { m.enabled = enabled; return; } }
    }
  });

  // A button that was clicked / right-clicked with the mouse must not keep the keyboard focus ring (the blue outline that
  // showed up around a module as soon as any key was pressed afterwards). Keyboard use (Tab, Enter: detail 0) keeps it.
  function letGo(e) {
    if (e.type === 'click' && e.detail === 0) return;
    const b = e.target instanceof Element ? e.target.closest('button') : null;
    if (b && root?.contains(b)) b.blur();
  }

  const items = $derived(cats.flatMap((c) => c.modules.map((module) => ({ module, cat: c.name }))));

  setContext('gui', {
    toggle(m) { m.enabled = !m.enabled; onToggle(m); },
    change(m, s) { onSetting(m, s); },
    typing(on) { onTyping(on); }   // text field focused / key capture active
  });

  function locate(name) {
    const el = root.querySelector(`[data-mod="${CSS.escape(name)}"]`);
    if (!el) return;
    const cat = cats.find((c) => c.modules.some((m) => m.name === name)).name;
    const wasCollapsed = layout[cat].collapsed;
    layout[cat].collapsed = false;
    front(cat);
    const list = el.closest('.mods');
    // scrollTo() from lib/scroller.js: the list's scroll position is owned by the scroller, native scrollTo would not move it
    // the list now also runs underneath the window header, so the visible part starts below it: centre on that part
    const hh = el.closest('.panel')?.querySelector('header')?.offsetHeight ?? 0;
    setTimeout(() => scrollTo(list, el.offsetTop - (list.clientHeight + hh) / 2 + el.offsetHeight / 2), wasCollapsed ? 480 : 0);   // the window's spring (Panel.svelte) needs ~0.45 s to open
    flash.set('');
    requestAnimationFrame(() => { flash.set(name); setTimeout(() => flash.set(''), 1600); });
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="clickgui" class:leaving={ready && ($closing || !active)} bind:this={root} onclick={letGo} oncontextmenu={letGo}>
  <Search {items} onlocate={locate} {shown} />
  {#each cats as c, i (c.name)}
    {@const pos = layout[c.name]}
    <!-- style: directives, not a style="" string: Svelte would overwrite the transform / --in that the swipe writes every frame -->
    <div class="slot" inert={!shown} use:swipe.item={{ fadeVar: '--in' }}
         style:left="{pos.x}px" style:top="{pos.y}px" style:z-index={pos.z}>
      <Panel panel={c} {pos} opening={opening || !shown} onfront={() => front(c.name)} onmoved={moved} />
    </div>
  {/each}
</div>

<style>
  .clickgui {
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
    position: fixed; inset: 0; color: var(--cg-tx); font-family: var(--cg-font);
    -webkit-font-smoothing: antialiased; color-scheme: dark;
  }
  /* The swipe (lib/menuSwipe.ts) writes `transform` and `--in` of each slot itself, so there are no CSS transitions here. `--in` is the
     visibility (0..1) that the glass, border, shadow and content of a window each read, instead of the slot having an `opacity`.
     The drop shadow is on the slot, not on the window: a window clips its own content, and the shadow has to fade with `--in`. */
  .slot { position: absolute; width: 224px; border-radius: 22px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, calc(.28 * var(--in, 1))); }
  :global(.cg-glass) {
    background: var(--cg-glass);
    backdrop-filter: blur(28px) saturate(1.8); -webkit-backdrop-filter: blur(28px) saturate(1.8);
    border: .5px solid var(--cg-stroke);
    box-shadow: inset 0 .5px 0 rgba(255, 255, 255, .28), 0 12px 40px rgba(0, 0, 0, .28);
  }
  /* While an app window carries the screen layer (growing out of / shrinking into its dock icon: overlayfx.ts marks the layer with
     data-fx-carry) there are no backdrop blurs and no transitions of our own. The window already blurs the wallpaper under the GUI,
     and ~80 backdrop blurs (7 windows x (glass + 10 edge-blur layers) + search) inside a layer that is scaled, clipped and
     re-laid-out every frame dropped out for single frames: pink flash on the search bar, pills going dark, the GUI drawn unscaled
     for a frame at the start of the close. Without the blurs the glass is just its tint, which looks the same over the already
     blurred window. They are back two frames after the window has settled. !important: the scoped rules of the windows
     (Panel.svelte, Search.svelte) are more specific than these. */
  :global([data-fx-carry] .clickgui .cg-glass),
  :global([data-fx-carry] .clickgui .panel::before),
  :global([data-fx-carry] .clickgui .panel::after),
  :global([data-fx-carry] .clickgui .pb i) {
    -webkit-backdrop-filter: none !important; backdrop-filter: none !important;
  }
  /* Left in the game (nothing carries the GUI, so the rule above does not apply): the windows slide and fade out over the live game
     view. Keep the glass of each window, but drop the 10 small edge-blur layers per window (70 backdrop blurs for 7 windows) for the
     ~0.5 s of the leave: they only soften the scroll edges, which nobody looks at while the window is leaving. */
  :global(.clickgui.leaving .pb i) {
    -webkit-backdrop-filter: none !important; backdrop-filter: none !important;
  }
  :global(.clickgui button) { font-family: inherit; color: inherit; }
  :global(.clickgui :focus-visible) { outline: 2px solid var(--cg-accent); outline-offset: 1px; }
</style>
