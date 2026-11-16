<!--
  "Settings" tab: the global settings of the client (getGlobalSettings / setGlobalSettings), in one big glass window.
  Every top-level group of the tree is a section (title + a rounded card of rows), laid out in two columns. Changes are sent
  as the whole tree, debounced; the tree is read again after a quiet moment, in case the client adjusted something.
-->
<script module>
  // `--in` is the window's visibility (also registered by ClickGui.svelte: the same definition, whoever comes first). --mx / --my / --mt are
  // the morph: the window grows out of the tab bar (scale x, scale y, rise), each with its own spring, so they must be real numbers / lengths
  // for CSS to animate them smoothly (an unregistered custom property flips instead of interpolating).
  for (const [name, syntax, inherits, initialValue] of [['--in', '<number>', true, '1'], ['--mx', '<number>', false, '1'], ['--my', '<number>', false, '1'], ['--mt', '<length>', false, '0px']]) {
    try { CSS.registerProperty({ name, syntax, inherits, initialValue }); } catch { /* already registered / unsupported */ }
  }
</script>

<script>
  import { onMount, onDestroy, untrack } from 'svelte';
  import { getGlobalSettings, setGlobalSettings } from '../../../integration/rest';
  import { spaceSeperatedNames } from '../../../theme/theme_config';
  import { scroller } from '../lib/scroller.js';
  import { clamp01 } from '../lib/morph.js';
  import { createPageMorph } from '../lib/pageMorph.js';
  import { spaced, soft } from './settings/util.js';
  import Setting from './settings/Setting.svelte';

  // The window's visibility is the number `--in` (0..1), never an `opacity` on the window: a parent with opacity < 1 stops the glass and
  // the edge-blur layers from seeing the wallpaper behind them (same reason as in lib/Panel.svelte).
  // Opening AND leaving are one spring each for x / y (lib/pageMorph.js), painted here. The window grows out of the tab bar (origin: top
  // centre) and goes back into it the same way; the fade is quicker than the growth. Because it is one spring with a flipped target,
  // switching tab while it is still moving turns it around from where it is (no jump to "fully open" first, no second window).
  let { leaving = false, ongone = () => {} } = $props();
  let win = $state();
  let page = null;
  function paint(px, py) {
    if (!win) return;
    const st = win.style;
    st.setProperty('--in', clamp01((py - 0.05) / 0.4).toFixed(3));
    st.setProperty('--mx', (0.86 + 0.14 * px).toFixed(4));
    st.setProperty('--my', (0.78 + 0.22 * py).toFixed(4));
    st.setProperty('--mt', (-30 * (1 - py)).toFixed(2) + 'px');
  }

  let tree = $state(null);
  let error = $state('');
  let dirty = false, saving = false, timer = 0, alive = true;

  const sections = $derived(tree && Array.isArray(tree.value)
    ? tree.value.filter((s) => s && (s.valueType === 'CONFIGURABLE' || s.valueType === 'TOGGLEABLE')) : []);
  // two columns that are filled alternately, so the sections keep their order from left to right
  const columns = $derived([sections.filter((_, i) => i % 2 === 0), sections.filter((_, i) => i % 2 === 1)]);

  const kids = (sec) => (Array.isArray(sec.value) ? sec.value.filter((c) => c && c.name) : []);

  async function load() {
    try { tree = await getGlobalSettings(); error = ''; }
    catch (e) { error = e instanceof Error ? e.message : String(e); }
  }

  function changed() {
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(flush, 160);
  }
  async function flush() {
    if (saving || !tree || !alive) { if (dirty && alive) timer = setTimeout(flush, 160); return; }
    saving = true; dirty = false;
    try { await setGlobalSettings($state.snapshot(tree)); }
    catch (e) { console.warn('[ios-clickgui] saving the global settings failed', e); }
    saving = false;
    if (dirty || !alive) return;
    // read it back once things have been quiet for a moment; only replace what the client really changed
    setTimeout(async () => {
      if (dirty || saving || !alive) return;
      try {
        const fresh = await getGlobalSettings();
        if (!dirty && alive && JSON.stringify(fresh) !== JSON.stringify($state.snapshot(tree))) tree = fresh;
      } catch { /* keep what is shown */ }
    }, 500);
  }

  onMount(() => {
    load();
    page = createPageMorph({ apply: paint, onGone: () => ongone() });
    paint(0, 0);                       // hidden until the first frame of the spring (the CSS default is the hidden state too)
    page.set(!untrack(() => leaving));
    return () => { page?.destroy(); page = null; };
  });
  $effect(() => { const on = !leaving; untrack(() => page?.set(on)); });
  onDestroy(() => { alive = false; clearTimeout(timer); if (dirty && tree) setGlobalSettings($state.snapshot(tree)).catch(() => {}); });
</script>

<section class="win cg-glass" inert={leaving} bind:this={win}>
  <header>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>
    <h1>Global Settings</h1>
  </header>

  <div class="body">
    <div class="mods" use:scroller>
      <div class="list">
        {#if !tree}
          <p class="msg">{error ? `Could not load the settings: ${error}` : 'Loading…'}</p>
        {:else}
          <div class="cols">
            {#each columns as col, c (c)}
              <div class="col">
                {#each col as sec (sec.name)}
                  <h2>{$spaceSeperatedNames ? spaced(sec.name) : soft(sec.name)}</h2>
                  <div class="card">
                    {#each kids(sec) as child (child.name)}
                      <Setting s={child} onchange={changed} path={'global/' + sec.name} />
                    {/each}
                  </div>
                {/each}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
    <!-- edge blur (iPadOS look), same layers as lib/Panel.svelte: scroller.js sets --edge-top / --edge-bottom on .body -->
    <div class="pb top" aria-hidden="true"><i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b5"></i><i class="b8"></i></div>
    <div class="pb bottom" aria-hidden="true"><i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b5"></i><i class="b8"></i></div>
  </div>
</section>

<style>
  /* The glass (tint + backdrop blur) lives on ::before / ::after, BEHIND the content, like the ClickGUI windows (lib/Panel.svelte). If it
     stayed on .win itself, the edge-blur layers would blur the window's own tint a second time and show up as a grey band.
     Visibility is `--in` on each layer separately, never an opacity on the window (see the script). */
  .win { --hh: 52px; /* header height: the list runs underneath it */ --fade: 48px; /* length of the edge-blur fade */
    position: fixed; left: 50%; top: 66px; margin-left: calc(min(820px, 94vw) / -2); width: min(820px, 94vw); height: min(calc(100vh - 90px), 760px);
    border-radius: 26px; display: flex; flex-direction: column; overflow: hidden; z-index: 5; user-select: none; isolation: isolate;
    background: none; -webkit-backdrop-filter: none; backdrop-filter: none;
    border-color: color-mix(in srgb, var(--cg-stroke) calc(var(--in) * 100%), transparent);
    box-shadow: 0 12px 40px rgba(0, 0, 0, calc(.28 * var(--in)));
    /* the page opens like the morphing menu: it grows out of the tab bar (origin: top centre), width and height each on their own spring
       (lib/pageMorph.js writes --in / --mx / --my / --mt every frame). The defaults here are the HIDDEN state, so the page is never
       visible for a frame before the first paint of the spring. */
    --in: 0; --mx: .86; --my: .78; --mt: -30px; transform: translateY(var(--mt)) scale(var(--mx), var(--my)); transform-origin: 50% 0; }
  .win::before { content: ''; position: absolute; inset: 0; z-index: -1; border-radius: inherit; opacity: var(--in);
    box-shadow: inset 0 .5px 0 rgba(255, 255, 255, .28); background: var(--cg-glass); }
  .win::after { content: ''; position: absolute; inset: 0; z-index: -2; border-radius: inherit; pointer-events: none; opacity: var(--in);
    -webkit-backdrop-filter: blur(28px) saturate(1.8); backdrop-filter: blur(28px) saturate(1.8); }
  /* while an app window carries the screen layer there are no backdrop blurs (see ClickGui.svelte: the same rule for the panels) */
  :global([data-fx-carry] .clickgui .win::after) { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
  header { display: flex; align-items: center; gap: 10px; padding: 0 20px; height: var(--hh); box-sizing: border-box; flex: none; position: relative; z-index: 3; opacity: var(--in); }
  header svg { width: 22px; height: 22px; color: var(--cg-tx2); }
  h1 { margin: 0; font-size: 17px; font-weight: 700; letter-spacing: -.2px; }
  .body { position: relative; flex: 1 1 auto; min-height: 0; margin-top: calc(var(--hh) * -1); /* the list starts at the very top of the window, under the header */ }
  .mods { position: absolute; inset: 0; overflow: hidden; }
  .list { padding: calc(var(--hh) + 2px) 16px 22px; will-change: transform; opacity: var(--in); } /* top padding = header height: at rest nothing sits under the header */
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; align-items: start; }
  .col { min-width: 0; }
  h2 { margin: 14px 4px 6px; font-size: 12px; font-weight: 600; letter-spacing: .2px; text-transform: uppercase; color: var(--cg-tx2); }
  .card { background: rgba(255, 255, 255, .06); border-radius: 14px; overflow: hidden; }
  .msg { margin: 30px 0; text-align: center; font-size: 13px; color: var(--cg-tx3); }
  /* Edge blur (the iPadOS look), copied from lib/Panel.svelte: where content is hidden above / below, five stacked backdrop
     blurs (1, 2, 3, 5, 8 px), each with its own eased mask (--s = still full strength, --e = gone), so the blur builds up gradually. At the
     top the band covers the header (--o) and then fades over --fade below it, so rows scrolling under the title are blurred too. Each <i>
     is faded with its own opacity, never the .pb wrapper (a parent with opacity < 1 would stop the blur from seeing the list). */
  .pb { position: absolute; left: 0; right: 0; height: calc(var(--o) + var(--fade)); z-index: 2; pointer-events: none; }
  .pb.top { top: 0; --to: to bottom; --o: var(--hh); }
  .pb.bottom { bottom: 0; --to: to top; --o: 0px; }
  .pb i { position: absolute; inset: 0; }
  .pb.top i { opacity: calc(var(--edge-top, 0) * var(--in)); }
  .pb.bottom i { opacity: calc(var(--edge-bottom, 0) * var(--in)); }
  @media (prefers-reduced-motion: reduce) { .pb i { animation: none !important; } }
  .pb i {
    -webkit-mask-image: linear-gradient(var(--to), #000 var(--s),
      rgba(0, 0, 0, .84) calc(var(--s) + (var(--e) - var(--s)) * .25),
      rgba(0, 0, 0, .5) calc(var(--s) + (var(--e) - var(--s)) * .5),
      rgba(0, 0, 0, .16) calc(var(--s) + (var(--e) - var(--s)) * .75),
      transparent var(--e));
    mask-image: linear-gradient(var(--to), #000 var(--s),
      rgba(0, 0, 0, .84) calc(var(--s) + (var(--e) - var(--s)) * .25),
      rgba(0, 0, 0, .5) calc(var(--s) + (var(--e) - var(--s)) * .5),
      rgba(0, 0, 0, .16) calc(var(--s) + (var(--e) - var(--s)) * .75),
      transparent var(--e)); }
  .pb .b8 { --s: calc(var(--o) * .45); --e: calc(var(--o) + var(--fade) * .30); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
  .pb .b5 { --s: calc(var(--o) * .60); --e: calc(var(--o) + var(--fade) * .50); -webkit-backdrop-filter: blur(5px); backdrop-filter: blur(5px); }
  .pb .b3 { --s: calc(var(--o) * .75); --e: calc(var(--o) + var(--fade) * .72); -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); }
  .pb .b2 { --s: calc(var(--o) * .90); --e: calc(var(--o) + var(--fade) * .90); -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px); }
  .pb .b1 { --s: var(--o);             --e: calc(var(--o) + var(--fade));       -webkit-backdrop-filter: blur(1px); backdrop-filter: blur(1px); }
  @media (max-width: 760px) { .cols { grid-template-columns: 1fr; } }
</style>
