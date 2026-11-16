<script>
  import { getContext, onDestroy } from 'svelte';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { MORPH } from './morph.js';
  import { drawer } from './transitions.js';
  import SettingRow from './SettingRow.svelte'; // self-import for nested groups
  import NumberValue from './NumberValue.svelte';
  import Toggle from '../../../components/Toggle.svelte';
  import Slider from '../../../components/Slider.svelte';
  import Setting from '../tabs/settings/Setting.svelte'; // full renderer for everything without a compact row (ranges, colors, lists, choices with sub-settings, ...)

  let { s, mod, i = 0 } = $props(); // setting, owning module, index (no longer used)
  const gui = getContext('gui');

  let open = $state(s.open ?? false);
  let rec = $state(false);
  const change = () => gui.change(mod, s);
  const cycle = () => { const o = s.options; s.value = o[(o.indexOf(s.value) + 1) % o.length]; change(); };
  // lets long camelCase names wrap between words instead of pushing the control out of the row
  const soft = (n) => String(n).replace(/([a-z0-9])([A-Z])/g, '$1\u200b$2');
  const TG = 54; // drawn width of the switch in px

  // Key capture. The handler used to be removed only when a key arrived: a row that went away while recording (GUI closed, window
  // collapsed) left a global keydown handler behind and the page owning the keyboard (game keybinds dead), and a second click added a
  // second handler. Same shape as Setting.svelte (`startBind` / `stopBind`).
  let recHandler = null;
  function stopRec() {
    if (recHandler) { removeEventListener('keydown', recHandler, true); recHandler = null; }
    if (rec) { rec = false; gui.typing(false); }
  }
  function listen() {
    if (recHandler) return;
    rec = true; gui.typing(true);
    recHandler = (e) => {
      e.preventDefault(); e.stopPropagation(); stopRec();
      s.value = e.key === 'Escape' || e.key === 'Backspace' ? 'None' : e.key.length > 1 ? e.key : e.key.toUpperCase();
      change();
    };
    addEventListener('keydown', recHandler, true);
  }
  onDestroy(stopRec);
</script>

<!-- A row has no animation of its own: the drawer it sits in is one surface (`drawer` in transitions.js) and its moving edge reveals the rows. -->
<div class="row">
  {#if s.type === 'toggle'}
    <div class="line">
      <span class="lbl">{soft(s.name)}</span>
      <Toggle checked={s.value} size={TG} label={s.name} onchange={(v) => { s.value = v; change(); }} />
    </div>

  {:else if s.type === 'slider'}
    <div class="sl">
      <div class="line">
        <span class="lbl">{soft(s.name)}</span>
        <!-- the number is text until it is clicked, then a field to type in (whole numbers when the step is a whole number) -->
        <NumberValue value={s.value} min={s.min} max={s.max} step={s.step ?? 1} int={Number.isInteger(s.step ?? 1)}
                     suffix={s.suffix ?? ''} label={s.name} onchange={(v) => { s.value = v; change(); }} />
      </div>
      <div class="sld">
        <Slider value={s.value} min={s.min} max={s.max} step={s.step ?? 1} label={s.name}
                oninput={(v) => { s.value = v; change(); }} />
      </div>
    </div>

  {:else if s.type === 'choice'}
    <div class="line">
      <span class="lbl">{soft(s.name)}</span>
      <button class="pick" onclick={cycle}>
        <span class="val">{#key s.value}
          <span in:fly={{ y: 9, duration: 520, easing: MORPH.pop.easing }} out:fly={{ y: -9, duration: 160, easing: cubicOut }}>{s.value}</span>
        {/key}</span>
        <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 1.5 7 5 3.5 8.5"/></svg>
      </button>
    </div>

  {:else if s.type === 'bind'}
    <div class="line">
      <span class="lbl">{soft(s.name)}</span>
      <button class="bind" class:rec onclick={listen}>{rec ? 'Press key…' : s.value}</button>
    </div>

  {:else if s.type === 'raw'}
    <Setting s={s.raw} onchange={change} path={'module/' + mod.name} />

  {:else if s.type === 'group'}
    <button class="line head" aria-expanded={open} onclick={() => (open = !open)}>
      <span class="lbl">{soft(s.name)}</span>
      <svg class="chev" class:open viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5 5 6.5 8 3.5"/></svg>
    </button>
    {#if open}
      <div class="sub" transition:drawer>
        <div class="inner">
          {#each s.children as c, j (c.path ? c.path.join('/') : c.name + '#' + j)}<SettingRow s={c} {mod} i={j} />{/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .row + .row { border-top: .5px solid rgba(255, 255, 255, .07); }
  .line { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 10px; min-height: 34px; font-size: 13px; font-weight: 500; }
  /* the label may shrink and wrap; the control on the right never gets pushed out of the row */
  .lbl { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
  .line > :not(.lbl) { flex: none; }
  button.line { width: 100%; border: 0; background: none; cursor: pointer; text-align: left; }
  .chev { width: 10px; height: 10px; transition: transform .45s cubic-bezier(.3, 1.4, .5, 1); }
  .chev.open { transform: rotate(180deg); }
  .sub { box-sizing: border-box; padding: 0 6px 6px; }
  .inner { background: rgba(255, 255, 255, .05); border-radius: 12px; }

  .sl { padding-bottom: 9px; }
  .sl .line { padding-bottom: 4px; min-height: 0; }
  /* the spring slider takes the row's width, with the same side margin the old range input had */
  .sld { display: flex; margin: 2px 10px 0; }

  .pick { display: flex; align-items: center; gap: 5px; border: 0; border-radius: 9px; padding: 5px 8px; font-size: 12px; background: var(--cg-fill); cursor: pointer; transition: background .2s, transform .15s; }
  .pick:hover { background: rgba(120, 120, 128, .5); }
  .pick:active { transform: scale(.94); }
  .pick svg { width: 9px; height: 9px; }
  .val { display: inline-grid; } .val > span { grid-area: 1 / 1; }
  .bind { border: 0; border-radius: 8px; padding: 4px 10px; font-size: 12px; background: var(--cg-fill); color: var(--cg-tx2); cursor: pointer; transition: background .25s, color .25s; }
  .bind.rec { background: var(--cg-accent); color: #fff; }
</style>
