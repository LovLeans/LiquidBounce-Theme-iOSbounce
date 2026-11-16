<!--
  One setting of the client, drawn the iOS way. Used by the Settings tab and the HUD editor; it works directly on the tree the
  client sent (`valueType` decides what is drawn), changes the object in place and calls `onchange()`, and the owner sends the
  whole tree back (debounced). Groups nest by including this component again.

    BOOLEAN ........... switch                 INT / FLOAT ........ slider + number
    INT_RANGE / FLOAT_RANGE  two-thumb slider  CHOOSE / CHOICE ....... list of options (CHOICE also shows the settings of the active one)
    MULTI_CHOOSE ...... ticks                  TOGGLEABLE ......... switch + the settings under it
    CONFIGURABLE ...... group                  COLOR .............. swatch + picker
    TEXT .............. field                  BIND / KEY ......... key capture (BIND also has an action and modifiers)
    VECTOR3_I / VECTOR3_D / VECTOR2_F  number fields               FILE ............... choose / clear
    MUTABLE_LIST / ITEM_LIST / REGISTRY_LIST / REGISTRY_MUTABLE_LIST   lists          CURVE .............. graph
-->
<script>
  import { onDestroy } from 'svelte';
  import { drawer } from '../../lib/transitions.js';
  import { spaceSeperatedNames } from '../../../../theme/theme_config';
  import { intToRgba } from '../../../../integration/util';
  import { openFileDialog, getCrosshairData, getPlayerData } from '../../../../integration/rest';
  import { keyToUi, uiToKey } from '../../bridge.js';
  import { spaced, soft, floatStep, num, wasOpen, rememberOpen, typing, hex2, cssRgba } from './util.js';
  import Setting from './Setting.svelte'; // self-import for nested groups
  import ColorPicker from './ColorPicker.svelte';
  import PillSegment from './PillSegment.svelte';
  import RangeSlider from '../../../../components/RangeSlider.svelte';
  import Toggle from '../../../../components/Toggle.svelte';
  import Slider from '../../../../components/Slider.svelte';
  import NumberValue from '../../lib/NumberValue.svelte';
  import CurveEditor from './CurveEditor.svelte';
  import ItemList from './ItemList.svelte';

  // `onrelease`: a slider reports its change when it is let go, not on every step of the drag (the HUD editor's popover: the component
  // would otherwise be resized / re-laid out while the thumb is still moving). The value shown (s.value) still follows the thumb.
  let { s, onchange = () => {}, path = '', onrelease = false } = $props();
  let slid = false;   // a slider moved and has not been reported yet
  const slideChanged = () => { if (onrelease) slid = true; else onchange(); };
  const slideDone = () => { if (slid) { slid = false; onchange(); } };

  const t = String(s.valueType ?? '').trim().toUpperCase();
  const key = `${path}/${s.name}`;
  // Every drawer blurs open / closed the same way (the default of `drawer`), in the Settings tab and in the HUD editor's popover alike.
  // (The popover used to turn it off because its glass was an ancestor of the animated drawer; the glass is a separate layer now, see
  // ComponentSettings.svelte `.pop`.)
  const dr = { blur: 6 };
  const label = $derived($spaceSeperatedNames ? spaced(s.name) : soft(s.name));

  let open = $state(wasOpen(key));
  $effect(() => { rememberOpen(key, open); });
  const toggleOpen = () => (open = !open);

  // ---------------------------------------------------------------- nested settings
  const isNode = (x) => x && typeof x === 'object' && 'valueType' in x && 'name' in x;
  const nested = $derived.by(() => {
    if (t === 'CONFIGURABLE') return Array.isArray(s.value) ? s.value.filter(isNode) : [];
    if (t === 'TOGGLEABLE') return Array.isArray(s.value) ? s.value.slice(1).filter(isNode) : [];
    if (t === 'CHOICE') { const v = s.choices?.[s.active]?.value; return Array.isArray(v) ? v.filter(isNode) : []; }
    return [];
  });
  const enabled = $derived(t === 'TOGGLEABLE' && s.value?.[0] ? !!s.value[0].value : false);
  const flipEnabled = () => { if (s.value?.[0]) { s.value[0].value = !s.value[0].value; onchange(); } };

  // ---------------------------------------------------------------- numbers
  const isFloat = t === 'FLOAT' || t === 'FLOAT_RANGE';
  const lo = $derived(s.range ? Math.min(s.range.from, t.endsWith('RANGE') ? s.value.from : s.value) : 0);
  const hi = $derived(s.range ? Math.max(s.range.to, t.endsWith('RANGE') ? s.value.to : s.value) : 1);
  const step = $derived(!s.range ? 1 : !isFloat ? 1 : t === 'FLOAT' ? floatStep(s.range, s.value) : Math.min(floatStep(s.range, s.value.from), floatStep(s.range, s.value.to)));
  const TG = 54; // drawn width of the switch in px
  const enter = (e) => { if (e.key === 'Enter') e.currentTarget.blur(); };

  // ---------------------------------------------------------------- choose / choice / multi choose
  let shake = $state('');
  const optName = (o) => (o && typeof o === 'object' ? String(o.id ?? o.name ?? o.value ?? '') : String(o));
  // the same entry twice (a theme that shares its id with the built-in one) would be one row; objects are shown by their id / name
  const opts = $derived(t === 'CHOICE' ? Object.keys(s.choices ?? {}) : Array.isArray(s.choices) ? [...new Set(s.choices.map(optName))] : []);
  const current = $derived(t === 'CHOICE' ? s.active : s.value);
  const pill = $derived(t === 'MULTI_CHOOSE' ? `${s.value.length}/${opts.length}` : String(current ?? ''));
  const isOn = (o) => (t === 'MULTI_CHOOSE' ? s.value.includes(o) : current === o);
  function choose(o) {
    if (t === 'MULTI_CHOOSE') {
      if (s.value.includes(o)) {
        const rest = s.value.filter((v) => v !== o);
        if (!rest.length && !s.canBeNone) { shake = o; setTimeout(() => { if (shake === o) shake = ''; }, 350); return; } // would leave it empty
        s.value = rest;
      } else {
        s.value = [...s.value, o];
      }
    } else {
      if (t === 'CHOICE') s.active = o; else s.value = o;
      open = false;
    }
    onchange();
  }
  const wheel = (e) => e.stopPropagation(); // a list that scrolls by itself keeps the wheel (the page has its own scroller)

  // ---------------------------------------------------------------- color
  const rgba = $derived(t === 'COLOR' ? intToRgba(s.value) : [0, 0, 0, 255]);
  const hexText = $derived('#' + hex2(rgba[0]) + hex2(rgba[1]) + hex2(rgba[2]) + (rgba[3] === 255 ? '' : hex2(rgba[3])));

  // ---------------------------------------------------------------- key / bind
  const MODS = { Shift: 'Shift', Control: 'Control', Alt: 'Alt', Meta: 'Super' };
  let rec = $state(false), recMods = $state([]), recTimer = 0;
  const bound = $derived(t === 'BIND' ? s.value?.boundKey : s.value);
  const keyText = $derived(t === 'BIND' ? [...(s.value?.modifiers ?? []), keyToUi(bound)].join(' + ') : keyToUi(bound));
  const preview = $derived(recMods.length ? recMods.join(' + ') + ' + …' : 'Press key…');

  function finish(name, mods) {
    stopBind();
    if (t === 'BIND') { s.value.boundKey = uiToKey(name); s.value.modifiers = mods; } else { s.value = uiToKey(name); }
    onchange();
  }
  function onKey(e) {
    e.preventDefault(); e.stopPropagation();
    if (e.key === 'Escape' || e.key === 'Backspace') { finish('None', []); return; }
    const m = MODS[e.key];
    if (m) {
      // a modifier may be the first part of a combination: wait a moment for the key that goes with it
      if (!recMods.includes(m)) recMods = [...recMods, m];
      clearTimeout(recTimer);
      recTimer = setTimeout(() => finish(e.key, recMods.filter((x) => x !== m)), 1000);
      return;
    }
    clearTimeout(recTimer);
    finish(e.key.length > 1 ? e.key : e.key.toUpperCase(), recMods);
  }
  function startBind() {
    rec = true; recMods = [];
    typing(true);
    addEventListener('keydown', onKey, true);
  }
  function stopBind() {
    clearTimeout(recTimer);
    if (!rec) return;
    rec = false; recMods = [];
    removeEventListener('keydown', onKey, true);
    typing(false);
  }
  onDestroy(stopBind);

  // ---------------------------------------------------------------- vectors, file, plain lists
  const axes = $derived(t === 'VECTOR2_F' ? ['x', 'y'] : ['x', 'y', 'z']);
  const vstep = t === 'VECTOR3_I' ? 1 : 0.01;
  function typedAxis(e, a) {
    const n = parseFloat(String(e.currentTarget.value).replace(',', '.'));
    if (Number.isFinite(n)) { s.value[a] = t === 'VECTOR3_I' ? Math.round(n) : n; onchange(); }
    e.currentTarget.value = num(s.value[a]);
  }
  async function locate() {
    try {
      const hit = await getCrosshairData();
      s.value = hit.type === 'block' ? hit.blockPos : (await getPlayerData()).blockPosition;
      onchange();
    } catch { /* no client */ }
  }

  let picking = false;
  async function chooseFile() {
    if (picking) return;
    picking = true;
    try {
      const r = await openFileDialog({ mode: s.dialogMode, supportedExtensions: s.supportedExtensions });
      if (r.file !== undefined) { s.value = r.file; onchange(); }
    } catch { /* no client */ }
    picking = false;
  }
  const base = (p) => String(p).split(/[\\/]/).filter(Boolean).pop() ?? '';

  const listText = (i, v) => { s.value[i] = v; onchange(); };
</script>

<div class="row">
  {#if t === 'BOOLEAN'}
    <div class="line">
      <span class="lbl" title={s.description}>{label}</span>
      <Toggle checked={s.value} size={TG} label={s.name} onchange={(v) => { s.value = v; onchange(); }} />
    </div>

  {:else if t === 'INT' || t === 'FLOAT'}
    <div class="sl">
      <div class="line">
        <span class="lbl" title={s.description}>{label}</span>
        <NumberValue value={s.value} int={t === 'INT'} step={step} suffix={s.suffix ?? ''} label={s.name}
                     onchange={(v) => { s.value = v; onchange(); }} />
      </div>
      <div class="sld">
        <Slider value={s.value} min={lo} max={hi} {step} label={s.name}
                oninput={(v) => { s.value = t === 'INT' ? Math.round(v) : v; slideChanged(); }} ondone={slideDone} />
      </div>
    </div>

  {:else if t === 'INT_RANGE' || t === 'FLOAT_RANGE'}
    <div class="sl">
      <div class="line">
        <span class="lbl" title={s.description}>{label}</span>
        <!-- both ends are typeable; the start can not pass the end and the end can not go below the start -->
        <span class="rng">
          <NumberValue value={s.value.from} min={lo} max={s.value.to} int={!isFloat} step={step} label="{s.name} from"
                       onchange={(v) => { s.value = { from: v, to: s.value.to }; onchange(); }} />
          <i>–</i>
          <NumberValue value={s.value.to} min={s.value.from} max={hi} int={!isFloat} step={step} label="{s.name} to"
                       onchange={(v) => { s.value = { from: s.value.from, to: v }; onchange(); }} />
          {#if s.suffix}<em>{s.suffix}</em>{/if}
        </span>
      </div>
      <div class="sld">
        <RangeSlider min={lo} max={hi} {step} from={s.value.from} to={s.value.to} label={s.name}
                     onchange={(f, to) => { s.value = { from: isFloat ? num(f) : f, to: isFloat ? num(to) : to }; slideChanged(); }} ondone={slideDone} />
      </div>
    </div>

  {:else if t === 'CHOOSE' || t === 'CHOICE' || t === 'MULTI_CHOOSE'}
    <button class="line head" aria-expanded={open} onclick={toggleOpen}>
      <span class="lbl" title={s.description}>{label}</span>
      <span class="pill">{pill}<svg class="chev" class:open viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5 5 6.5 8 3.5"/></svg></span>
    </button>
    {#if open}
      <div class="sub" transition:drawer={dr}>
        <div class="inner opts" onwheel={wheel}>
          {#each opts as o (o)}
            <button class="opt" class:on={isOn(o)} class:shake={shake === o} onclick={() => choose(o)}>
              <span class="nm">{o}</span>
              <svg class="ck" viewBox="0 0 12 12"><path d="M2.5 6.5 5 9 9.5 3.5"/></svg>
            </button>
          {/each}
        </div>
      </div>
    {/if}
    {#if t === 'CHOICE' && nested.length}
      <div class="sub"><div class="inner">{#each nested as c, ci (c.name + '#' + ci)}<Setting s={c} {onchange} {onrelease} path={key} />{/each}</div></div>
    {/if}

  {:else if t === 'TOGGLEABLE'}
    <div class="line">
      {#if nested.length}
        <button class="lblbtn" aria-expanded={open} onclick={toggleOpen}>
          <span class="lbl" title={s.description}>{label}</span>
          <svg class="chev" class:open viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5 5 6.5 8 3.5"/></svg>
        </button>
      {:else}
        <span class="lbl" title={s.description}>{label}</span>
      {/if}
      <Toggle checked={enabled} size={TG} label={s.name} onchange={flipEnabled} />
    </div>
    {#if open && nested.length}
      <div class="sub" transition:drawer={dr}>
        <div class="inner">{#each nested as c, ci (c.name + '#' + ci)}<Setting s={c} {onchange} {onrelease} path={key} />{/each}</div>
      </div>
    {/if}

  {:else if t === 'CONFIGURABLE'}
    <button class="line head" aria-expanded={open} onclick={toggleOpen}>
      <span class="lbl" title={s.description}>{label}</span>
      <svg class="chev" class:open viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5 5 6.5 8 3.5"/></svg>
    </button>
    {#if open}
      <div class="sub" transition:drawer={dr}>
        <div class="inner">{#each nested as c, ci (c.name + '#' + ci)}<Setting s={c} {onchange} {onrelease} path={key} />{/each}</div>
      </div>
    {/if}

  {:else if t === 'COLOR'}
    <button class="line head" aria-expanded={open} onclick={toggleOpen}>
      <span class="lbl" title={s.description}>{label}</span>
      <span class="hexv">{hexText}</span>
      <span class="swatch"><i style="background:{cssRgba(rgba)}"></i></span>
    </button>
    {#if open}
      <div class="sub" transition:drawer={dr}>
        <div class="inner"><ColorPicker value={s.value} onchange={(v) => { s.value = v; onchange(); }} /></div>
      </div>
    {/if}

  {:else if t === 'TEXT'}
    <div class="tx">
      <div class="line"><span class="lbl" title={s.description}>{label}</span></div>
      <input class="field" type="text" spellcheck="false" autocomplete="off" placeholder={label} value={s.value} aria-label={s.name}
             oninput={(e) => { s.value = e.currentTarget.value; onchange(); }} onkeydown={enter}>
    </div>

  {:else if t === 'BIND' || t === 'KEY'}
    <div class="line">
      <span class="lbl" title={s.description}>{label}</span>
      <button class="bind" class:rec onclick={() => (rec ? stopBind() : startBind())}>{rec ? preview : keyText}</button>
    </div>
    {#if t === 'BIND' && s.value && s.value.boundKey && !s.value.boundKey.endsWith('.unknown')}
      <PillSegment options={['Toggle', 'Hold', 'Smart']} value={s.value.action} label="Bind action"
                   onpick={(a) => { s.value.action = a; onchange(); }} />
    {/if}

  {:else if t === 'VECTOR3_I' || t === 'VECTOR3_D' || t === 'VECTOR2_F'}
    <div class="tx">
      <div class="line">
        <span class="lbl" title={s.description}>{label}</span>
        {#if t === 'VECTOR3_I' && s.useLocateButton}<button class="pick" onclick={locate}>Locate</button>{/if}
      </div>
      <div class="vec">
        {#each axes as a (a)}
          <label><em>{a}</em><input class="vf" type="text" inputmode="decimal" spellcheck="false" value={num(s.value[a])} onchange={(e) => typedAxis(e, a)} onkeydown={enter} aria-label={a}></label>
        {/each}
      </div>
    </div>

  {:else if t === 'FILE'}
    <div class="line">
      <span class="lbl" title={s.description}>{label}</span>
      <span class="file">
        {#if s.value}<button class="pick" title={s.value} onclick={chooseFile}><span class="nm">{base(s.value)}</span></button>
          <button class="x" aria-label="Clear" onclick={() => { s.value = ''; onchange(); }}><svg viewBox="0 0 10 10"><path d="M2 2 8 8M8 2 2 8"/></svg></button>
        {:else}<button class="pick" onclick={chooseFile}>Choose…</button>{/if}
      </span>
    </div>

  {:else if t === 'MUTABLE_LIST'}
    <button class="line head" aria-expanded={open} onclick={toggleOpen}>
      <span class="lbl" title={s.description}>{label}</span>
      <span class="pill">{s.value.length}<svg class="chev" class:open viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5 5 6.5 8 3.5"/></svg></span>
    </button>
    {#if open}
      <div class="sub" transition:drawer={dr}>
        <div class="inner list">
          {#each s.value as v, i (i)}
            <div class="li">
              <input class="field" type="text" spellcheck="false" value={v} oninput={(e) => listText(i, e.currentTarget.value)} onkeydown={enter} aria-label="{s.name} {i + 1}">
              <button class="x" aria-label="Remove" onclick={() => { s.value = s.value.filter((_, j) => j !== i); onchange(); }}><svg viewBox="0 0 10 10"><path d="M2 2 8 8M8 2 2 8"/></svg></button>
            </div>
          {/each}
          <button class="addbtn" onclick={() => { s.value = ['', ...s.value]; onchange(); }}>Add</button>
        </div>
      </div>
    {/if}

  {:else if t === 'ITEM_LIST' || t === 'REGISTRY_LIST' || t === 'REGISTRY_MUTABLE_LIST'}
    <button class="line head" aria-expanded={open} onclick={toggleOpen}>
      <span class="lbl" title={s.description}>{label}</span>
      <span class="pill">{s.value.length}<svg class="chev" class:open viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5 5 6.5 8 3.5"/></svg></span>
    </button>
    {#if open}
      <div class="sub" transition:drawer={dr}>
        <div class="inner"><ItemList {s} mode={t === 'REGISTRY_MUTABLE_LIST' ? 'mutable' : 'toggle'} {onchange} /></div>
      </div>
    {/if}

  {:else if t === 'CURVE'}
    <button class="line head" aria-expanded={open} onclick={toggleOpen}>
      <span class="lbl" title={s.description}>{label}</span>
      <svg class="chev" class:open viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5 5 6.5 8 3.5"/></svg>
    </button>
    {#if open}
      <div class="sub" transition:drawer={dr}>
        <div class="inner"><CurveEditor {s} {onchange} /></div>
      </div>
    {/if}

  {:else}
    <div class="line dim"><span class="lbl">{label}</span><span>Not supported ({t})</span></div>
  {/if}
</div>

<style>
  .row + .row { border-top: .5px solid rgba(255, 255, 255, .07); }
  .line { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 10px; min-height: 34px; box-sizing: border-box; font-size: 13px; font-weight: 500; }
  .line.dim { color: var(--cg-tx3); font-size: 12px; }
  /* the label may shrink and wrap; the control on the right never gets pushed out of the row */
  .lbl { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; text-align: left; }
  .line > :not(.lbl):not(.lblbtn) { flex: none; }
  button.line { width: 100%; border: 0; background: none; cursor: pointer; text-align: left; transition: background .2s; }
  button.line:hover { background: rgba(255, 255, 255, .03); }
  .lblbtn { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 6px; border: 0; background: none; padding: 0; cursor: pointer; text-align: left; font: inherit; }
  .chev { width: 10px; height: 10px; flex: none; color: var(--cg-tx2); transition: transform .45s cubic-bezier(.3, 1.4, .5, 1); }
  .chev.open { transform: rotate(180deg); }
  .sub { box-sizing: border-box; padding: 0 6px 6px; }
  .inner { background: rgba(255, 255, 255, .05); border-radius: 12px; overflow: hidden; }

  .sl { padding-bottom: 9px; }
  .sl .line { padding-bottom: 4px; min-height: 0; }
  /* "from – to unit" of a range: the numbers are NumberValue (their padding is taken back by a negative margin, so the dash needs room) */
  .rng { display: inline-flex; align-items: baseline; color: var(--cg-tx2); }
  .rng i { font-style: normal; margin: 0 10px; color: var(--cg-tx3); }
  .rng em { font-style: normal; font-size: 12px; color: var(--cg-tx3); margin-left: 4px; }
  /* the spring slider takes the row's width, with the same side margin the old range input had */
  .sld { display: flex; margin: 2px 10px 0; }

  .pill, .pick { display: inline-flex; align-items: center; gap: 6px; max-width: 180px; border: 0; border-radius: 9px; padding: 5px 9px; font-size: 12px; font-weight: 500; background: var(--cg-fill); color: var(--cg-tx); cursor: pointer; transition: background .2s, transform .15s; }
  .pill { cursor: inherit; }
  button.head:hover .pill, .pick:hover { background: rgba(120, 120, 128, .5); }
  .pick:active { transform: scale(.95); }
  .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hexv { font: 12px Consolas, Menlo, 'DejaVu Sans Mono', 'Liberation Mono', monospace; color: var(--cg-tx2); text-transform: uppercase; }
  .swatch { width: 38px; height: 23px; flex: none; border-radius: 8px; overflow: hidden; border: .5px solid rgba(255, 255, 255, .25);
    background: repeating-conic-gradient(#8a8a8f 0 25%, #c7c7cc 0 50%) 0 0 / 8px 8px; }
  .swatch i { display: block; width: 100%; height: 100%; }

  .opts { max-height: 224px; overflow-y: auto; padding: 3px; scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, .25) transparent; overscroll-behavior: contain; }
  .opt { width: 100%; display: flex; align-items: center; gap: 8px; border: 0; border-radius: 9px; padding: 8px 10px; background: none; font-size: 13px; text-align: left; cursor: pointer; color: var(--cg-tx2); transition: background .15s, color .15s; }
  .opt:hover { background: var(--cg-hi); }
  .opt.on { color: var(--cg-tx); font-weight: 600; }
  .opt .nm { flex: 1 1 auto; }
  .ck { width: 12px; height: 12px; flex: none; fill: none; stroke: var(--cg-accent); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; opacity: 0; transform: scale(.6); transition: opacity .2s, transform .3s cubic-bezier(.3, 1.6, .5, 1); }
  .on .ck { opacity: 1; transform: none; }
  .shake { animation: shake .3s; }
  @keyframes shake { 20% { transform: translateX(-4px); } 50% { transform: translateX(4px); } 80% { transform: translateX(-2px); } }

  .tx { padding-bottom: 8px; }
  .tx .line { padding-bottom: 5px; min-height: 0; }
  .field, .vf { display: block; width: calc(100% - 20px); box-sizing: border-box; margin: 0 10px; border: 0; outline: 0; border-radius: 9px; padding: 7px 10px; background: var(--cg-fill); color: var(--cg-tx); font: inherit; font-size: 13px; transition: box-shadow .2s; }
  .field:focus, .vf:focus { box-shadow: 0 0 0 1.5px var(--cg-accent); }
  .field::placeholder { color: var(--cg-tx3); }
  .vec { display: flex; gap: 6px; padding: 0 10px; }
  .vec label { flex: 1 1 0; min-width: 0; display: flex; align-items: center; gap: 5px; }
  .vec em { font-style: normal; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--cg-tx3); }
  .vf { margin: 0; width: 100%; padding: 6px 8px; font-variant-numeric: tabular-nums; }

  .bind { border: 0; border-radius: 8px; padding: 4px 10px; font-size: 12px; background: var(--cg-fill); color: var(--cg-tx2); cursor: pointer; transition: background .25s, color .25s; }
  .bind.rec { background: var(--cg-accent); color: #fff; }

  .file { display: inline-flex; align-items: center; gap: 4px; min-width: 0; }
  .x { width: 22px; height: 22px; flex: none; display: grid; place-items: center; border: 0; border-radius: 50%; background: none; color: var(--cg-tx2); cursor: pointer; transition: background .15s, color .15s; }
  .x:hover { background: var(--cg-hi); color: #ff453a; }
  .x svg { width: 9px; height: 9px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; }
  .list { padding: 6px; }
  .li { display: flex; align-items: center; gap: 4px; margin-bottom: 5px; }
  .li .field { margin: 0; width: 100%; }
  .addbtn { display: block; width: 100%; border: 0; border-radius: 9px; padding: 6px 12px; background: var(--cg-fill); font-size: 12px; cursor: pointer; transition: background .2s, transform .15s; }
  .addbtn:hover { background: rgba(120, 120, 128, .5); }
  .addbtn:active { transform: scale(.97); }
</style>
