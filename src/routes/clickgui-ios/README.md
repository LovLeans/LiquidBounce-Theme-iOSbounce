# iOS ClickGUI as a LiquidBounce theme route (JelloBounce theme)

> Working on bugs / lag? Read `src/HANDOFF.md` first (work log, what was audited, what is still open).

```
src/routes/clickgui-ios/
  ClickGuiRoute.svelte   <- the route component
  bridge.js              <- all client-specific code (uses src/integration/rest.ts)
  lib/                   <- the iOS UI
    ClickGui / Panel / Module / SettingRow / Search .svelte
    scroller.js (scrolling: momentum, rubber band, edge blur), spring.js, transitions.js, stores.js, icons.js
    demo.js              <- demo data, used when the client API is not reachable
```

## Install

1. Put this folder at `src/routes/clickgui-ios/`. It is the only ClickGUI and the only HUD editor of the theme: the classic
   `src/routes/clickgui/` folder (and its HUD editor) was removed. The HUD keeps its own small pieces in `src/routes/hud/`
   (`constants.ts`, `store.ts`, `elements/BindDisplay.svelte`).
2. In `src/App.svelte` the client's `clickgui` screen is the iOS one:

   ```ts
   import ClickGuiRoute from "./routes/clickgui-ios/ClickGuiRoute.svelte";

   const routes = {
       "/clickgui": ClickGuiRoute,
       "/hud": Hud,
       ...
   };
   ```
3. Svelte 5 is required (your theme already uses it).

## What the bridge uses (all from `src/integration/rest.ts`)

| Purpose                      | Call                                                        |
| ---------------------------- | ----------------------------------------------------------- |
| load                         | `getModules()`, `getCategories()` (window order), `getModuleSettings(name)` per module |
| enable / disable             | `setModuleEnabled(name, enabled)`                           |
| save a setting               | `setModuleSettings(name, tree)`, debounced 120 ms           |
| screen is ready              | `confirmVirtualScreen("clickgui")`                          |
| search box / key capture     | `setTyping(true/false)` so keybinds and Esc don't fire in the game |

Setting types are recognised by shape (see `ModuleSetting` in `types.ts`):

| Client setting                                   | iOS row                          |
| ------------------------------------------------ | -------------------------------- |
| `BooleanSetting`                                 | switch                           |
| `IntSetting`, `FloatSetting`                     | slider with unit suffix          |
| `ChooseSetting`, `ChoiceSetting`                 | picker (`ChoiceSetting`: the mode switch only, not the sub-settings of each mode) |
| `BindSetting`, `KeySetting`                      | key bind (action and modifiers are preserved) |
| `ConfigurableSetting`, `TogglableSetting`        | collapsible group                |
| ranges, color, text, lists, blocks, vectors, files, curves | not shown, but saved back unchanged (listed in the console as `setting types not shown`) |

## Known limits

- `setModuleEnabled` does not look at the HTTP status, so a switch is only reverted if the request cannot be sent at all.
- A module toggled from inside the game while the GUI is open (keybind, auto-disable) is not pushed to the GUI.
- Opening the page outside the client (plain browser, `vite dev`) shows the demo data.
- Window positions are remembered in `localStorage` under `liquidbounce-ios-clickgui`.


## Opening and closing the GUI

There are two ways to get in and out, and each has exactly ONE owner of the animation:

| How it was opened | What carries it | What `ClickGui` does itself |
| ----------------- | --------------- | --------------------------- |
| From the dock (title screen) | the app window growing out of / shrinking into its icon (`overlayfx.ts` scales the whole screen layer onto the window) | the windows are simply there once it is loaded (**no opening animation**); **nothing on close** - the window takes the whole GUI with it. The swipe only plays when the tab is switched |
| In the game (keybind, command) | nothing | the windows, the search bar and the tab bar fly in with the swipe (`lib/menuSwipe.ts`), and fly out with it, then `App.svelte` unmounts the GUI |

The swipe is the "apps zoom in from the camera" animation: every window scales about the centre of the screen, the farther from the centre the later
it arrives and the deeper it dips, then it relaxes out. Closing plays the same animation backwards (a bit slower, no inward pull). `lib/menuSwipe.ts` is
framework-agnostic (it writes transforms straight to the DOM; constants in `DEFAULT_SWIPE_CONFIG`) and is used as a Svelte action
(`use:swipe.item`) on three kinds of item: each window's `.slot`, the search bar's `.sw` and the tab bar's `.sw`. Items must not carry a `transform` of
their own (the swipe writes it), which is why the search bar and the tab bar are centred with margins and not with `translateX(-50%)`. The windows fade
through `--in` (`fadeVar`), never through `opacity` (see below).

* `closing.ts` holds the `closing` flag. Only `App.svelte` sets it, and only when the GUI is left towards the game. A GUI that is
  left towards the title is **never** told to close (the title path keeps it mounted until the app window reports it is gone).
  Giving it a close animation of its own on top of the window's would make the windows flash up over the home screen.
* **A window that has carried the GUI away keeps it hidden.** When the window has finished shrinking, `overlayfx.ts` does not hand the screen
  layer back at full size (`fx.closed()` hides it, `fx.isGone()` says so); the layer only comes back on the next window frame or for a new
  screen. The client's "screen closed" message and the router can be a moment behind the window, and before this the GUI, still mounted,
  popped up over the home screen at that moment and then played its in-game leave (that was the ghost). `App.svelte` also removes a GUI that
  is already gone without any animation, whichever order the client's messages arrive in (route first, window first, or `close` then `open title`).
* **No backdrop blur while a window carries the GUI.** `overlayfx.ts` marks the screen layer with `data-fx-carry` from the first frame a window
  moves it until two frames after it is back to normal (also while it is hidden after a close). `ClickGui.svelte` then switches every
  `backdrop-filter` of the GUI off (windows' glass, their 10 edge-blur layers, the search bar) and its own CSS transitions too. Why: in the
  recording the search bar flashed saturated pink for single frames (frames 32 and 38), the category pills dipped at 32 / 35 / 38, and the
  first frame of a close drew the GUI unscaled next to the shrinking window. All of that is inside the window's settling tail or the first
  frame of a carry, i.e. while the layer is scaled, clipped and re-laid-out every frame with ~80 backdrop blurs inside it (the iOS menu screens had far fewer, which is why only the GUI
  glitched; they get the same treatment now, see below). The window already blurs the wallpaper under the GUI, so the glass is
  just its tint for those ~0.5 s; the blur comes back two frames after the window has settled (a small change in saturation is visible
  there: the glass uses `saturate(1.8)`). The glass and edge blurs of the GUI now also wait for `opening` (see below) and fade in, so that pop is gone; if the
  window's own blur still pops, lengthen the release in `overlayfx.ts` (`mark()`).

* **Tabs: ClickGUI / HUD Editor / Settings** (`tabs/`, storage key `clickgui.tab`).
  * `ClickGuiRoute.svelte` owns the tab (`tab`), shows `TabBar.svelte` (glass pill, sliding thumb) and the page of the chosen tab. Only the HUD editor
    and the settings page are mounted / unmounted; the ClickGUI itself stays alive and gets `active={tab === 0}`: when it is false `shown` is false, so the
    windows and the search bar leave with the swipe (and come back with it, `opening` included), **also when the GUI was opened from the dock**. The tab bar stays: it
    has its own controller (`barSwipe`, made in the route next to the windows' `guiSwipe`) that takes its ripple normalisation from the windows' one (`reach`), so
    both still play in step when the GUI opens or closes in game. The search bar moved to `top: 64px`, below the tab bar.
  * `tabs/HudEditor.svelte` is the classic HUD editor in iOS clothes. It still renders the shared `<Hud inEditor>`; `Hud.svelte` / `DraggableComponent.svelte` got an
    optional `settingsComponent` prop (the classic popover stays the default) and three CSS variables (`--clickgui-hud-editor-radius`, `-badge-radius`,
    `-badge-padding`, all 0 by default) so the selection / position badge can be rounded. Colors come from the `--clickgui-hud-editor-*` variables, set on
    `.hud-editor`. `tabs/ComponentSettings.svelte` is the popover over each component ([x] Name [v] + its settings), `tabs/AddComponent.svelte` the "Add Component" pill that morphs into a menu (see below).
  * `tabs/GlobalSettings.svelte`: `getGlobalSettings()` / `setGlobalSettings()`, each top-level group a section in a two-column glass window, saved debounced
    (the whole tree, like the classic GUI) and read back once it has been quiet.
  * `tabs/settings/Setting.svelte` draws **every** setting type of the client (`valueType`: BOOLEAN, INT, FLOAT, INT_RANGE, FLOAT_RANGE, CHOOSE, CHOICE,
    MULTI_CHOOSE, TOGGLEABLE, CONFIGURABLE, COLOR, TEXT, BIND, KEY, VECTOR3_I / VECTOR3_D / VECTOR2_F, FILE, MUTABLE_LIST, ITEM_LIST, REGISTRY_LIST,
    REGISTRY_MUTABLE_LIST, CURVE) straight from the tree the client sent (no conversion step like `bridge.js` does for modules). Pickers open inline (no floating
    menus), because the HUD popovers sit inside a `zoom`ed layer. The editors that need more than a row: `ColorPicker`, `CurveEditor`, `ItemList`. Switches and sliders (single and two-thumb) are the shared spring components in `src/components/` (`Toggle`, `Slider`, `RangeSlider`).
  * Key capture of BIND / KEY uses the page's `keydown` like the module bind rows do (`bridge.js` now exports `keyToUi` / `uiToKey`), and reports itself with
    `setTyping`. Text fields are reported by the window-level `focusin` / `focusout` handler of the route.
  * Not carried over from the classic GUI: the GUI scale (`ScaledClickGuiContent`) and the darkened background; the iOS GUI has neither.

* **Colors follow the theme's accent color.** The GUI no longer has its own iOS blue / green: `--cg-accent` (`ClickGui.svelte`, `ClickGuiRoute.svelte`) is
  `var(--accent-color)`, the color the client sends (the one the ArrayList line and the rest of the theme use), with iOS blue only as the fallback until it is
  known. Sliders, switches, the enabled-module dot, focus rings, the HUD editor's selection, anchor zones and guides all use it. The hue strip of the
  color picker keeps its fixed colors.

* **HUD editor: add / remove / save, and the Add Component button.**
  * The editor no longer depends on the client's `componentsUpdate` websocket event alone. After a component was added (`AddComponent.pick`) or
    removed (`ComponentSettings.remove`) it calls `reloadHud()` (`routes/hud/reload.ts`), and every mounted `<Hud>` reads its components again over REST.
    `Hud.svelte` also listens with `listenSticky` (`integration/ws.ts`): the router's `cleanupListeners()` wipes plain `listen` handlers on every route
    change, also while a screen that is still mounted (this GUI turning around) is on screen, and the HUD then silently stopped following the client.
  * `setComponentSettings` now throws on a non-2xx answer (it used to pass silently, the GUI showed a change the client never got). `ComponentSettings`
    sends one request at a time (a change made while one is out is sent right after it, so they cannot overtake each other), finds the component's
    "Enabled" switch by name (first setting as the fallback), and if the client refuses the remove it puts the switch back and the [x] turns red.
    If the settings could not be read when the popover opened, pressing [x] reads them again first.
  * "Add Component" (now the morphing pill, next bullet): a refused add shows its reason in the menu (red line, the browser console has the full error), a second click while a request is out
    is ignored, the click-outside test uses `composedPath()`, and the button / sheet sit above every component (`z-index`; the components take theirs from the
    client and it grows each time one is brought to the front). `.hud-editor` is its own stacking context (`z-index: 1000; isolation: isolate`).
  * Animation when switching tabs: the page no longer fades as one block (`opacity` on a parent of the glass button drops its blur until the end, that was the
    pop). The Add Component button has its own enter / leave like the search bar (opacity + `translate` on the glass element, `.add.hid`), and only the
    `.layer` (components, zones, guides) fades. `ClickGuiRoute` keeps the HUD editor and the Settings page mounted after their tab was left (`leaving` = true) until
    they report `ongone`. Both pages move on ONE spring whose target is flipped (`lib/pageMorph.js`), so switching tab while a page is still opening or
    leaving turns it around from where it is, with its speed (no keyframe intro / Svelte `out:` pair that could disagree about where the page is).

* **Add Component = the morphing pill** (`tabs/AddComponent.svelte`, ported from the standalone prototype; the spring engine is unchanged).
  The pill (150 x 40, `W` / `H` in the script) sits with its top edge at 64px (centre 84px, `--ac-top` / `--ac-left` move it), swells on touch-down, squeezes on release and morphs
  into a menu (search field + catalogue, max 532 x 474, capped to the room below the pill, follows window resizes). Added for the HUD editor:
  the real catalogue (read again every time the menu opens), `visible` (the menu closes and the pill slides up / fades like the search bar),
  `lib/scroller.js` on the list (momentum + rubber band) and the edge blur of the windows. The list fills the whole menu and runs under the
  search field (`.inner` has the top padding; `--hh` = 58px is where the field ends). `scroller.js` moves the FIRST child of its box, so the
  hover light (`.hl`, absolute) lives inside `.inner` and scrolls with the rows. `scroller` got an optional `{ onscroll }` hook (the hover
  light is re-targeted while the rows move under a still cursor; there is no native scroll event any more) and `scrollTo(node, y, true)`
  (instant; the menu starts at the top each time it opens). The 10 backdrop blurs are off while the menu grows / shrinks (`.quiet`, 650 ms)
  and fade in afterwards, and off under `data-fx-carry`, same as the windows. The edge blur has no tint on top; the pill, the panel and
  its glow follow the theme's accent (`readAccent()` reads `--cg-accent` when the pill is pressed: pill = accent x `PILL`, lighter
  while pressed, panel = accent x `PANEL`; the label turns dark on very light accents). The prototype's purple is only the fallback. `lib/rubber.js` is not used by it (scroller.js has the rubber band).
* **The theme owns the HUD layout** (`routes/hud/layout.ts` pure helpers, `routes/hud/positions.ts` storage). While the theme id is shared with the built-in
  theme the client has two component lists under it (the one it pushes, the one `getComponents` returns) that disagree about which components are on and
  where they are, and the HUD used to draw whichever came last. Now two things go through the theme's persistent storage and are put over any list the page
  gets: `hud-positions` (dragged positions) and `hud-layout` (on / off + position of every component). The editor takes a component into `hud-layout` the
  first time it sees it in a pushed list; after that only the user changes it (`ComponentSettings` [x] -> `onRemoved` -> `rememberRemoved`, "Add Component" ->
  `rememberAdded`), and no list from the client can switch it. Only the editor page writes `hud-layout` (two pages writing would overwrite each other).
  Until the client has pushed to a page, a component the theme has never seen in a push is not drawn (a read can be the other list), so the very first open
  on a fresh install shows nothing for a few seconds. To start over, clear the `hud-positions` and `hud-layout` items of the theme's persistent storage. The real fix for the two lists is a unique `id` in `metadata.json`.

* **The client is told what the layout says (`routes/hud/sync.ts`).** The client hides parts of the vanilla HUD by the on / off state IT has (an enabled
  Hotbar hides the vanilla hotbar, status bar and XP bar, Effects the effect icons, Scoreboard the scoreboard, see `tweaks` in `public/components/*.json`).
  A component that only the theme hid (the [x]) left its vanilla part hidden too, so nothing was drawn. Every list that comes in (the read one and the
  pushed one) is now compared with `hud-layout`, and a component whose state differs is sent to the client (`getComponentSettings` -> "Enabled" ->
  `setComponentSettings`, without the Alignment). It runs on both pages, again when the layout changes, and a failed request is repeated up to 3 times
  with a fresh read (the ids change). Switching a component on / off in the client's own settings is therefore undone: use the HUD editor.

* **No backdrop blur while the GUI opens (in game) or a window expands / collapses.** The dock path above has the window's own blur to lean on; in the
  game there is nothing behind the GUI but the live view, and every backdrop blur is redone each frame while its window moves and fades:
  7 windows x (glass + 10 masked edge-blur layers) was the lag while opening, heaviest with windows left expanded.
  * `ClickGui.svelte` keeps `opening` true from the moment the windows are shown until the swipe has fully settled (`swipe.settleMs`, ~1.4 s: switching ~100 blurs on while something still rings made windows lose their glass for a few frames), and a window that
    is not `shown` (leaving) is quiet too: a window flying at the camera is many times its size and blurring that is far too heavy **and** `fx.settled()` says no dock window is
    still moving the layer. When the GUI is simply there (dock) there is nothing to wait for. It is passed to every `Panel`.
  * `Panel.svelte`: while `opening` the glass blur (`.panel::after`, its own layer under the tint in `::before`) is off, so a window is just its
    tint, and it fades in afterwards (`glass-in`, 380 ms). The 10 edge-blur layers are off while `opening` **or** while that window expands /
    collapses (`.quiet`, 520 ms after `collapsed` changes), and fade in afterwards (`edge-in`). There is no scrim / tint layer any more (it made the edges grey): while the blurs are off the edge is a plain cut.
  * The glass stays blurred while a window expands / collapses on its own (taking it away from a visible window would look like a flicker).
  * Knobs: `OPEN_MS` (ClickGui.svelte), `MOVE_MS` (Panel.svelte), the two fade durations (`glass-in` / `edge-in` in Panel.svelte). If the blur
    coming in after the slide bothers you, lengthen `glass-in`; if it still stutters on a slow machine, also drop the glass blur during
    expand / collapse by using `opening || moving` for the `.opening` class.

* **Closing lag (Multiplayer, Singleplayer, Alts, Proxies, ClickGUI).** Two causes, both handled:
  * *The shrink started late.* The Cancel / Back buttons only asked the client to leave, and the window began to shrink once the answer had
    come back (REST -> client -> websocket `virtualScreen` -> router -> `MainMenu`). Now they call `LB.leaveScreen(screen, request)`
    (`bridge.ts`): `menuLink.closeNow` shrinks the window on the click, the request runs next to it, and the router follows when the answer
    arrives. If the answer is slower than the shrink, `App.svelte` drops the screen at once (`fx.isGone()`) instead of waiting for `LINGER_MAX`.
    Esc is still the client's: the page does not see it, so it keeps the round trip.
  * *Backdrop blurs inside the moving layer.* `IosStage.svelte` switches every `backdrop-filter` of the iOS screens off while
    `data-fx-carry` is set (list panels and their edge-blur layers, toast, settings sheet), same as the GUI. A GUI left in the game
    (nothing carries it) drops its 10 edge-blur layers per window while it leaves (`.clickgui.leaving`).

* **Blank screen after leaving the client's native settings / in game.** `None.svelte` reloads the page when `<main>` still holds a screen
  1.2 s after entering `/none`. `App.svelte` keeps its `.fx` wrapper in `<main>` on every route, so that check always fired: the page
  reloaded every ~1.2 s whenever the client showed no screen of the page (in game, in the native settings). A screen the client opened
  in the middle of a reload (slow with `npm run dev`) stayed blank on the default wallpaper, and `resume` (the return animation) was
  lost. The check now only counts what is inside `.fx`. The console line `[Router] Detected route desync. Reloading...` is what that
  looked like.
* **Back from a game (or Cancel on the connecting screen) to Singleplayer / Multiplayer / the title: a fade, not a pop.** When the client
  brings the page up with nothing carrying it, `App.svelte` fades the whole page in (`fadeIn` -> `main.fade-in`, 320 ms; not at startup and
  not while `resume` replays a native-screen return). If the screen is Singleplayer or Multiplayer with no menu under it
  (`cameFromGame()`: not from the title, another dock screen or the basic menu), the title is mounted under it and `MainMenu` shows that
  app's window as already open (`Launcher.show(id)`: no grow, the screen is not asked for again). Closing such a window (Cancel, Esc)
  does not shrink into the icon: the window and the screen on it fade out in place (`AppRt.fade`, the `op` channel; `onFrame` multiplies
  the layer's opacity by `f.op`) while the dock and the wallpaper come back, so the menu appears under it. Windows opened from the dock
  are untouched (grow / shrink).
* **`close` before `open title`.** If the client reports `close` of a screen (route `/none`) while that screen's window is already leaving
  (Cancel / Back / Esc), `App.svelte` holds the screen and the title (`holdTitle`, `menuLink.closing`) until the window is gone instead of
  unmounting everything at once, which made the closing animation vanish. Every route change logs `[Menu] a -> b (...)` with
  `console.debug`: enable the Verbose level in DevTools to see it.

* The GUI only waits for a dock window if there is one (`menuLink.expects('clickgui')` or the layer is moving). Left towards the title with
  no window, it plays its own leave instead of freezing until the safety timeout.
* Mounted while a window is still growing the layer (`fx.active()` at mount), the windows are simply there and grow with it (no swipe on top).
  When the modules arrive later, or in game, they fly in. After that every change of `shown` (tab switch, `closing`) plays the swipe, in the dock case too.
* The windows are not animated with Svelte transitions. They are mounted hidden (the swipe starts every item invisible) and shown two frames later;
  `closing` / a tab switch plays it backwards. `shown` is the only input of `swipe.setOpen()`, so closing while it is still appearing, or reopening while it
  is leaving, turns around from where it is (the playhead decelerates, turns and speeds up again). A Svelte outro could replay whenever a parent block is
  removed, that was the ghost. `setOpen` re-measures every time: windows are dragged, and nothing observes a move.
* **Never clear the transform of a swipe item, keep `will-change: transform` on it, and limit how far a big item zooms.** Three things that made the swipe
  glitch, all in `lib/menuSwipe.ts` (look there before touching it):
  * The demo's controller wrote `transform = ''` whenever the scale was within 1e-4 of 1, which flips every few frames while the spring rings out. With glass
    inside, Chromium can lose the item's own compositing layer. It writes an identity transform at rest once an item has animated.
  * A 224 x 660 px window zoomed 17x is 3800 x 11000 css px (22000 device px on a retina screen), past the GPU's texture limit: the window lost its glass, border
    and header while it flew (only its list stayed). `maxSize` (default 2) limits an item's zoom-in so that its larger side is at most 2 viewport heights:
    a pill still zooms ~8x, an expanded window ~3x.
  * Without `will-change: transform` the browser draws every item again at a new scale each frame (the text of a whole window, ~100 backdrop blurs); a frame that is
    not ready shows the glass without its content: blank purple slabs where the tab bar / search bar should be. With it the item is drawn once and the bitmap is scaled.
* The slots are styled with `style:` directives, not a `style="..."` string: Svelte would overwrite what the swipe writes (`transform`, `--in`) on every drag.
* Fade = the CSS variable `--in` (0..1, registered with `CSS.registerProperty` in `ClickGui.svelte`). The swipe writes it on every slot (`fadeVar`). The glass,
  border, content and edge-blur layers of a window each read it. **Do not put `opacity` on `.slot` / `.panel`**: Chromium stops the glass
  from blurring what is behind it as soon as a parent has opacity < 1, so the blur would pop in at the end. The drop shadow is on `.slot`
  for the same reason (it must follow `--in` without being caught in `.panel`'s own `box-shadow` transition). (The search bar and the tab bar are
  glass themselves, their `.sw` wrappers use a plain `opacity`, which is 1 after the first ~20 ms.)
* Timings: the swipe's are `DEFAULT_SWIPE_CONFIG` in `lib/menuSwipe.ts`. `LEAVE_MS` in `closing.ts` is how long `App.svelte` waits before it unmounts the
  GUI after `closing`: it must cover the fly-out (~0.48 s now). If you slow the swipe down (`speed`, `closeSpeed`), raise it.
* **Esc on the home screen** (`MainMenu.svelte`, `setTypingBaseline` in `rest.ts`): while the menu itself owns the keyboard (no real screen on
  top of it) the client is told to leave Esc / keybinds to the page, otherwise it closed its title screen and opened it again (blank
  wallpaper for a moment, mouse centred). Esc then only closes an app window. When a real screen is on top (singleplayer, the GUI, ...) it
  is switched off again, so Esc closes that screen as before. It is combined with `setTyping` (search box), so neither switches the other off.
* The route ignores a module load that finishes after the screen was closed (no screen confirmation for a dropped screen), and the
  in-game `moduleToggle` listener is registered once for good (`listenAlways` in `ClickGuiRoute.svelte`), because the router wipes per-route
  listeners on every route change.

## Windows (layout + header)

* Header: a **click without movement** or a **right-click** opens / collapses the window. A drag (more than 4 px) moves it and
  never toggles it (`Panel.svelte`: `DRAG_START`). Double-click no longer does anything special.
* Default layout (`grid()` in `ClickGui.svelte`): rows of windows with `GAP` (22 px) between them, each row centred. If the
  screen is too narrow for one row it wraps instead of overlapping, and windows never move by themselves (no re-flow, no clamping) when the window is resized (windowed mode).
* Once you drag a window the layout is yours: positions are stored as fractions of the screen, so they follow a resize. If the
  screen gets too small for that layout the clean grid is shown until there is room again. An old saved layout in which windows
  sit on top of each other is replaced by the grid.
* **The GUI reopens the way it was left**: which windows are open and which module settings drawers are open (`stores.js`, kept in memory
  and in `localStorage` under `liquidbounce-ios-clickgui:open`, separate from the layout). The first time everything is collapsed
  (`startCollapsed`). Clear that key to reset.
* Note: with many windows in several rows, an opened window can cover the one below it; collapse it or drag it away.

## Troubleshooting

* **A long setting name pushed its switch / value out of the window** - labels now wrap (camelCase names break between words,
  `SettingRow.svelte` `soft()` + `.lbl`) and the control on the right keeps its size.
* **Blue ring around a module after clicking it** - that was the keyboard focus ring staying on the button. Buttons now release
  focus after a mouse click / right-click (`letGo` in `ClickGui.svelte`); keyboard (Tab) focus still shows the ring.

* **Red "Demo data: could not load the modules from the client (...)" banner** - the GUI could not read the
  real modules and shows the demo ones instead. The text in the brackets is the reason; the browser console
  has the full error (`[ios-clickgui] could not load modules ...`). On success the console says
  `[ios-clickgui] loaded N modules from the client`.
* Opening the route in a plain browser (`vite dev`) only shows real modules if `REST_BASE` in
  `src/integration/host.ts` points at the running client.
* Closing a settings drawer: `lib/transitions.js` animates the vertical padding together with the height,
  otherwise a border-box element can't get shorter than its padding and snaps at the end.

## Motion (springs)

* `lib/menuSwipe.ts` - the window / search bar / tab bar entrance and exit (see above). Everything else below is for the content inside the windows.
* `lib/spring.js` - damped-spring physics. `BOUNCY` (appearing, ~3% overshoot, ~0.38 s), `SNAPPY` (setting rows), `SETTLE` (leaving,
  no overshoot). Change `stiffness` / `damping` there to make everything bouncier or tighter. The CSS curves in
  `Panel.svelte` (`linear(...)`) are samples of the same springs; regenerate them with `makeSpring(...).cssLinear()`.
* `lib/transitions.js` - settings drawer uses `BOUNCY` to open and `SETTLE` to close. the blur eases in/out with the same spring
  (`transition:drawer={{ blur: 0 }}` turns it off if it stutters on a slow machine; the HUD editor's popover uses the default blur like everything else, its glass is on layers behind the content, see `ComponentSettings.svelte`).
* `lib/scroller.js` - iOS scrolling for the window lists (ported from the iPadOS menu prototype). Native scrolling is off and
  the scroller owns the position (constants at the top of the file):
  * wheel / trackpad: each delta is an impulse slowed by friction; a delta of d px glides exactly d px (still 1:1, but smooth).
  * rubber band: momentum carries into the ends and a spring catches it. The spring stiffens the further the list is pulled
    (up to 150 px) and is critically damped, so it eases back without wobbling.
  * touch: the content follows the finger, rubber-bands, keeps its velocity on release; sliders / text fields keep their own
    touch drag, and the click that ends a drag is swallowed.
  * `scrollTo(node, y)` glides to a position (the search's "locate" uses it; native `scrollTo` no longer moves these lists).
  * `prefers-reduced-motion`: the browser's own scrolling is kept, no momentum / rubber band.
* Edge blur at the top / bottom of a list (`Panel.svelte`): five stacked backdrop blurs (no tint on top of them) (1, 2, 3, 5, 8 px), each with its own
  eased (smoothstep) mask, so the blur builds up gradually over the 48 px band instead of as a solid strip. At the **top** the list runs underneath the window header (`--hh`, 42 px): the band covers the
  header at full strength and then fades over `--fade` (34 px), so rows scrolling under the title are blurred instead of being cut
  off sharply below it. `.list` has `--hh` of top padding and `.body` is pulled up by `--hh`; if you change the header height,
  change `--hh` on `.panel` only. The scroller sets `--edge-top` / `--edge-bottom` (0..1) on `.body`: 0 within 4 px of an end,
  full strength 22 px later, so it grows and fades continuously while scrolling.
  Never fade it with the wrapper's `opacity`: a parent with opacity < 1 stops the backdrop blur from seeing the list, so the
  blur would only pop in at the end (the opacity is on each layer itself).
