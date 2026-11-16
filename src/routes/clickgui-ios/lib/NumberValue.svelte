<!--
  The number of a slider, as text you can click to type a new one.

  At rest it is just the value (like the plain text it replaces: nothing extra to look at). A click turns it into a small clean
  field with the number selected, so typing replaces it at once; the field is only there while it is being edited.

      Enter / click away ... apply        Esc ... cancel (and the GUI stays open)
      Up / Down ............ step it (Shift: x10), applied right away

  A typed value is rounded for whole numbers and kept inside [min, max]; what is not a number is ignored (the old value stays).
  While the field has focus the client is told that keys are for the page (the route's focusin / focusout handler does that for
  every text field), so letters typed here are not keybinds in the game and Esc does not close the GUI.

    <NumberValue value={s.value} min={s.min} max={s.max} step={s.step} int suffix="m" label={s.name} onchange={(v) => ...} />
-->
<script>
  import { onDestroy, tick } from 'svelte';
  import { num, parseNumber, fitNumber, typing } from '../tabs/settings/util.js';

  let { value, min = -Infinity, max = Infinity, step = 1, int = false, suffix = '', label = '', onchange = () => {} } = $props();

  const show = (n) => String(num(n));

  let editing = $state(false);
  let text = $state('');
  let input = $state();
  let done = true; // the edit that was just left (guards the blur that leaving it causes)

  async function begin() {
    if (editing) return;
    text = show(value);
    done = false;
    editing = true;
    await tick();
    input?.focus();
    input?.select();
  }

  /** Leaves the field. `apply`: take what was typed, otherwise throw it away. */
  function finish(apply) {
    if (!editing || done) return;
    done = true;
    const n = apply ? parseNumber(text) : null;
    // blur first: that is what reports "not typing" to the client (a focused field that is only removed does not)
    input?.blur();
    editing = false;
    if (n !== null) {
      const v = fitNumber(n, min, max, int);
      if (v !== num(value)) onchange(v);
    }
  }

  function onInput(e) {
    // only what a number is made of (a whole number has no point)
    const clean = e.currentTarget.value.replace(int ? /[^0-9+-]/g : /[^0-9.,+-]/g, '');
    if (clean !== e.currentTarget.value) e.currentTarget.value = clean;
    text = clean;
  }

  function onKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish(false);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
      const v = fitNumber((parseNumber(text) ?? value) + d, min, max, int);
      text = show(v);
      if (v !== num(value)) onchange(v);
    }
  }

  // a field that is still focused when its row goes away must not leave the keyboard with the page
  onDestroy(() => { if (editing) typing(false); });
</script>

{#if editing}
  <label class="nv bar">
    <input bind:this={input} class="in" type="text" inputmode={int ? 'numeric' : 'decimal'} maxlength="12"
           spellcheck="false" autocomplete="off" aria-label={label} value={text}
           style:width="{Math.min(9, Math.max(3, text.length + 0.5))}ch"
           oninput={onInput} onkeydown={onKey} onblur={() => finish(true)}>
    {#if suffix}<em>{suffix}</em>{/if}
  </label>
{:else}
  <button class="nv" type="button" title="Click to type a value" onclick={begin}
          aria-label="{label}: {show(value)}{suffix ? ' ' + suffix : ''}. Click to type a value">
    <span>{show(value)}</span>{#if suffix}<em>{suffix}</em>{/if}
  </button>
{/if}

<style>
  /* Both states have the same box (padding that the negative margin takes back), so the number does not move when it is clicked. */
  .nv {
    flex: none;
    display: inline-flex;
    align-items: baseline;
    gap: 3px;
    box-sizing: border-box;
    margin: -3px -6px;
    padding: 3px 6px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--cg-tx2);
    font: inherit;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  button.nv { cursor: text; transition: background .18s, color .18s, transform .15s; }
  button.nv:hover { background: var(--cg-hi); color: var(--cg-tx); }
  button.nv:active { transform: scale(.95); }
  em { font-style: normal; font-size: 12px; color: var(--cg-tx3); }

  .bar {
    cursor: text;
    background: var(--cg-fill);
    color: var(--cg-tx);
    box-shadow: 0 0 0 1.5px var(--cg-accent), 0 0 0 3px color-mix(in srgb, var(--cg-accent) 22%, transparent);
    animation: bar-in .2s cubic-bezier(.3, 1.5, .5, 1);
  }
  .in {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
    outline: 0;
    background: none;
    color: inherit;
    font: inherit;
    font-variant-numeric: tabular-nums;
    text-align: right;
    caret-color: var(--cg-accent);
    -webkit-user-select: text;
    user-select: text;
  }
  .bar em { color: var(--cg-tx2); }

  @keyframes bar-in {
    from { opacity: 0; transform: scale(.9); }
    to { opacity: 1; transform: none; }
  }
  @media (prefers-reduced-motion: reduce) { .bar { animation: none; } }
</style>
