<!--
  "Add Component": a pill under the tab bar that morphs into a menu with a search field and the catalogue of HUD components.

  The pill / menu motion (springs, swell on touch-down, squeeze on release, the light pill that glides over the rows) is the standalone
  "Add Component" prototype, unchanged. What was added to make it the HUD editor's button:
    - the real catalogue (getComponentCatalog / addComponent, same rules as before: a component the theme keeps off can be added again,
      a second click while a request is out is ignored, a refused add shows its reason in the menu, the editor re-reads its components);
    - `visible`: false while the HUD editor tab is not shown (or the GUI is leaving): the menu closes and the pill slides up and fades
      out by CSS state, like the search bar it takes the place of;
    - lib/scroller.js on the list (momentum + rubber band) and the edge blur of the ClickGUI windows (same layers as lib/Panel.svelte):
      the list runs under the search field, rows that scroll under it or past the bottom are blurred.
-->
<script lang="ts">
  import { onMount, tick as nextTick, untrack } from "svelte";
  import { scroller, scrollTo } from "../lib/scroller.js";
  import { stage } from "../lib/stageMetrics.svelte";
  import { getMetadata, getComponentCatalog, addComponent } from "../../../integration/rest";
  import type { HudComponentCatalogEntry } from "../../../integration/types";
  import { reloadHud } from "../../hud/reload";
  import { frozenLayout, namesKeptOff, rememberAdded } from "../../hud/positions";
  import { spaceSeperatedNames, convertToSpacedString } from "../../../theme/theme_config";

  // visible: false while the HUD editor tab is not shown (or the GUI is leaving). The menu then closes and the pill slides up and fades out.
  let { visible = true }: { visible?: boolean } = $props();

  // ---- the catalogue ----
  interface Entry {
    id: string;
    name: string;          // as shown (spaced if the theme wants that)
    description: string;
    disabled: boolean;     // already on the HUD (a singleton) and not kept off by the theme
    c: HudComponentCatalogEntry;
  }

  let components = $state.raw<HudComponentCatalogEntry[]>([]);
  let loaded = $state(false);     // the catalogue has been read at least once
  let failed = $state("");        // the catalogue could not be read
  let addError = $state("");      // the client refused the component that was picked
  let busy = $state(false);       // an add request is out: a second click must not add the component twice
  let metadata: Awaited<ReturnType<typeof getMetadata>> | null = null;

  const pretty = (n: string) => { if (!$spaceSeperatedNames) return n; try { return convertToSpacedString(n); } catch { return n; } };
  // components the theme keeps off (the user removed them in the editor): the client may still count them as there, so they can be added
  // again whatever it says
  const keptOff = $derived(namesKeptOff($frozenLayout));
  const entries = $derived<Entry[]>(components.map((c) => ({
    id: c.id, name: pretty(c.name), description: c.description, disabled: !(c.canAdd || keptOff.has(c.name)), c,
  })));

  // ---- reactive bits (only what the markup needs) ----
  let query = $state("");
  let isOpen = $state(false);
  let hitLocked = $state(false);
  let fullH = 460;                // the height the open menu grows to (= --eh): the bottom edge shadow is placed relative to it, see render()
  let pbBottom: HTMLElement | undefined;   // the bottom edge shadow / blur layers
  let quiet = $state(true);       // the menu is growing / shrinking: the backdrop blurs of the edge blur are left out (see the CSS)
  let appear = $state(false);     // hidden for the first two frames, so the entrance always plays (same as the tab bar and the windows)
  const away = $derived(!(appear && visible));
  const filtered = $derived.by(() => {
    const parts = query.toLowerCase().match(/\S+/g) ?? [];
    return parts.length ? entries.filter((e) => { const hay = (e.name + " " + e.c.name + " " + e.description).toLowerCase(); return parts.every((p) => hay.includes(p)); }) : entries;
  });
  const emptyText = $derived(failed ? `Could not load the components: ${failed}`
    : !loaded ? "Loading…"
    : query.trim() ? "No components match your search." : "No components found");

  const sameCatalog = (a: HudComponentCatalogEntry[], b: HudComponentCatalogEntry[]) =>
    a.length === b.length && a.every((x, i) => x.id === b[i].id && x.name === b[i].name && x.description === b[i].description && x.canAdd === b[i].canAdd && x.singleton === b[i].singleton);

  async function refresh() {
    try {
      metadata ??= await getMetadata();
      const catalog = await getComponentCatalog(metadata.id);
      if (!Array.isArray(catalog)) throw new Error("unexpected answer from the client");
      const next = [...catalog].sort((a, b) => a.name.localeCompare(b.name));
      if (!sameCatalog(components, next)) {
        components = next;
        // a row that went away under the light pill must not leave the pill behind
        nextTick().then(() => { if (hlItem && !hlItem.isConnected) { hlItem = null; ho.p = ho.t = ho.v = 0; render(); } });
      }
      failed = ""; loaded = true;
    } catch (e) { failed = e instanceof Error ? e.message : String(e); console.warn("[ios-clickgui] could not load the component catalogue", e); }
  }

  // ---- animation engine: plain variables, written straight to the DOM like the HTML version ----
  type Spring = { p: number; v: number; t: number; k: number; c: number };
  type Row = { el: HTMLElement; s: Spring; dim: number };

  // Same physics as the press buttons and the morphing menu: swell on touch-down, squeeze on release, springs everywhere.
  const W = 150, H = 40, R = 34, MAXW = 532, MAXH = 474, LEAD = 0.44 * H;   // W x H: the pill (the prototype's was 183 x 48)
  const SHADOW_ROOM = 28;   // space kept free under the open menu so its drop shadow is not cut off by the window edge
  const G = H * 0.43, SQ = H * 0.1;
  const PAD = 10;   // the menu's inner margin: the field and the rows are inset by this much
  // The pill's colour at rest (A) and while pressed (P) follow the theme's accent colour: readAccent() derives them from --cg-accent
  // (the prototype's purple is only the fallback). The menu's panel and its glow are the accent too, but much darker,
  // so that the white text stays readable whatever the accent is.
  const PILL = 0.8;     // the pill at rest: the accent at this brightness (0..1) ...
  const LIFT = 0.16;    // ... pressed it lightens by this much (towards white)
  const PANEL = 0.45;   // the open panel: the accent at this brightness
  let A = [58, 31, 93], P = [112, 78, 160];
  const RM = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
  const mix = (t: number) => "rgb(" + A.map((a, i) => Math.round(a + (P[i] - a) * clamp(t, 0, 1))).join(",") + ")";
  const S = (p: number, k: number, c: number): Spring => ({ p, v: 0, t: p, k, c });
  function set(s: Spring, t: number, k: number, c: number) {
    s.t = t;
    if (RM) { k = 1200; c = 69; }
    s.k = k; s.c = c;
    kick();
  }

  let morph: HTMLDivElement, bg: HTMLDivElement, closedEl: HTMLDivElement, openEl: HTMLDivElement;
  let hit: HTMLButtonElement, field: HTMLInputElement, list: HTMLDivElement, hlEl: HTMLDivElement;
  let stageEl: HTMLDivElement, probe: HTMLElement;

  const lerp3 = (a: number[], b: number[], t: number) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
  const triple = (c: number[]) => c.join(", ");
  /** read the theme's accent colour and tint the pill and the panel with it */
  function readAccent() {
    if (!stageEl || !probe) return;
    const css = getComputedStyle(probe).color;   // the browser resolves hex / hsl / color-mix to rgb(...) (or color(srgb ...) with 0..1 channels)
    const n = css.match(/-?\d*\.?\d+/g)?.map(Number);
    const acc = n && n.length >= 3 ? n.slice(0, 3).map((v) => clamp(Math.round(css.startsWith("color(") ? v * 255 : v), 0, 255)) : [10, 132, 255];
    A = acc.map((v) => Math.round(v * PILL));
    P = lerp3(A, [255, 255, 255], LIFT);
    const dark = acc.map((v) => Math.round(v * PANEL));
    const st = stageEl.style;
    st.setProperty("--tone1", triple(lerp3(dark, [0, 0, 0], 0.04)));   // the panel: a gradient from the dark accent towards the accent
    st.setProperty("--tone2", triple(lerp3(dark, acc, 0.12)));
    st.setProperty("--tone3", triple(lerp3(dark, acc, 0.26)));
    st.setProperty("--glow", triple(lerp3(dark, acc, 0.6)));
    // the label on the pill: white, unless the accent is so light that white would not read
    st.setProperty("--pill-fg", 0.299 * P[0] + 0.587 * P[1] + 0.114 * P[2] > 165 ? "#1c1c1e" : "#fff");
  }

  const w = S(W, 420, 26), h = S(H, 420, 26), pr = S(0, 520, 34), o = S(0, 420, 30), cen = S(1, 700, 42), ly = S(0, 900, 60);
  const fs = S(0, 340, 22);                                             // the search field comes in like the first row
  const hy = S(0, 700, 38), hh = S(0, 700, 38), ho = S(0, 800, 50);     // the light pill: position, height, opacity
  const ms = S(0, 320, 25), gx = S(50, 500, 40);                        // ms: the whole menu swells while a row is pressed; gx: where the light sits
  const core = [w, h, pr, o, cen, ly, fs, hy, hh, ho, ms, gx];

  let rows: Row[] = [];
  let hlItem: HTMLElement | null = null, pressedItem: HTMLElement | null = null;
  let laters: ReturnType<typeof setTimeout>[] = [];
  let phase: "closed" | "open" = "closed";
  let pressed = false, fresh = false, timer: ReturnType<typeof setTimeout> | undefined, raf = 0, last = 0;
  let mx = -1, my = -1;

  const later = (fn: () => void, t: number) => { laters.push(setTimeout(fn, t)); };
  const clearLater = () => { laters.forEach(clearTimeout); laters = []; };

  // each row registers itself here; it starts hidden while the menu opens and fully visible if it appears later (typing in the search)
  function row(node: HTMLElement, item: Entry) {
    const r: Row = { el: node, s: S(phase === "open" && !fresh ? 1 : 0, 248, 15.5), dim: item.disabled ? 0.36 : 1 };
    rows.push(r);
    render();
    return {
      update(next: Entry) { r.dim = next.disabled ? 0.36 : 1; render(); },
      destroy() { rows = rows.filter((x) => x !== r); },
    };
  }

  // the pill never moves: the menu height is capped to the room below it
  function size(): [number, number] {
    // everything here is in design pixels (lib/stageMetrics.svelte.ts): the window is stage.w x stage.h, the pill's top is a real-pixel measure
    const top = morph.parentElement!.getBoundingClientRect().top / stage.s;
    return [Math.round(Math.min(MAXW, stage.w - 24)), Math.round(Math.max(220, Math.min(MAXH, stage.h - top - SHADOW_ROOM)))];
  }

  function render() {
    if (!morph || !bg || !closedEl || !openEl || !field || !hlEl) return;   // rows can register before every element is bound
    const oc = clamp(o.p, 0, 1), cq = clamp(1 - oc * 3, 0, 1), kc = clamp(cen.p, 0, 1);
    morph.style.width = w.p + "px";
    morph.style.height = h.p + "px";
    morph.style.top = -H / 2 + ((H - h.p) / 2) * kc + ly.p + "px";   // pressed: swells around its centre; open: the top edge stays put and the bottom drops
    morph.style.borderRadius = Math.max(0, Math.min(R, w.p / 2, h.p / 2)) + "px";
    morph.style.background = mix(pr.p);
    morph.style.transform = `translateX(-50%) scale(${1 + (13 * ms.p) / w.p},${1 + (12 * ms.p) / h.p})`;
    const glowQ = Math.min(clamp(oc * 2, 0, 1), clamp((h.p - H) / (H * 0.7), 0, 1));
    bg.style.opacity = String(glowQ);   // no leftover glow on the closed pill
    morph.style.setProperty("--sh", String(glowQ));   // same for the drop shadow
    // .open always has its final size (the morph clips it while it grows), so the bottom edge shadow would sit at the final bottom, hidden
    // until the menu has arrived (and a band stranded at the final bottom while the menu overshoots). Shift it by how much the menu is short of /
    // past that height: it then rides on the moving bottom edge.
    if (pbBottom) { const dy = h.p - fullH; pbBottom.style.transform = Math.abs(dy) > 0.5 ? `translateY(${dy}px)` : "none"; }   // both ways: the menu overshoots its final height too
    closedEl.style.opacity = String(cq);
    closedEl.style.top = ((h.p - H) / 2) * kc + "px";
    closedEl.style.filter = cq < 1 ? `blur(${(1 - cq) * 5}px)` : "none";
    closedEl.style.transform = `scale(${clamp(w.p / W, 0.85, 1.43) * (1 - 0.1 * (1 - cq))})`;

    // gate: contents fade out as the capsule shrinks to the pill
    const fq = fs.p, gate = clamp((h.p - H * 1.6) / (H * 0.8), 0, 1);
    let vis = phase === "open" || fq > 0.01;
    field.style.opacity = String(clamp(fq, 0, 1) * gate);
    field.style.transform = `translateY(${(1 - fq) * -12}px) scale(${0.92 + 0.08 * fq})`;
    for (const r of rows) {
      const q = r.s.p;
      if (q > 0.01) vis = true;
      r.el.style.opacity = String(clamp(q, 0, 1) * r.dim * gate);
      r.el.style.transform = `translateY(${(1 - q) * -12}px) scale(${0.92 + 0.08 * q})`;
    }
    openEl.style.visibility = vis ? "visible" : "hidden";   // nothing inside can be focused or seen while the pill is at rest

    hlEl.style.setProperty("--px", clamp(gx.p, 0, 100) + "%");
    hlEl.style.opacity = String(clamp(ho.p, 0, 1));
    hlEl.style.height = Math.max(0, hh.p) + "px";
    hlEl.style.transform = `translateY(${hy.p}px)`;
  }

  function step(now: number) {
    const dt = Math.min(0.032, (now - last) / 1000 || 0.016);
    last = now;
    const n = Math.ceil(dt * 300), d = dt / n;
    let moving = false;
    if (phase === "closed" && cen.t === 0 && h.p < H * 1.2) { cen.t = 1; cen.k = 579; cen.c = 38; }   // landed: back to centred press physics
    for (const s of core.concat(rows.map((r) => r.s))) {
      for (let i = 0; i < n; i++) { s.v += (s.k * (s.t - s.p) - s.c * s.v) * d; s.p += s.v * d; }
      if (Math.abs(s.t - s.p) > 0.002 || Math.abs(s.v) > 0.01) moving = true;
    }
    render();
    raf = moving ? requestAnimationFrame(step) : 0;
  }
  function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); } }

  // ---- pill: press, open, close ----
  function down() {
    if (phase !== "closed") return;
    readAccent();                                      // the accent may have changed since the last time
    pressed = true; clearTimeout(timer);
    set(pr, 1, 248, 24.5); set(w, W + G, 281, 24.5); set(h, H + G, 281, 24.5);
  }
  function release() {
    if (phase !== "closed" || !pressed) return;
    pressed = false; clearTimeout(timer);
    set(pr, 0, 165, 25.5); set(w, W - SQ, 992, 54.5); set(h, H - SQ, 992, 54.5);
    timer = setTimeout(() => { if (phase === "closed") { set(w, W, 347, 13.6); set(h, H, 347, 13.6); } }, 165);
  }
  function open() {
    if (phase !== "closed" || !pressed) return;
    pressed = false; clearTimeout(timer); clearLater();
    fresh = true; query = ""; addError = ""; phase = "open"; isOpen = true; hitLocked = true; quiet = true;
    const s = size();
    fullH = s[1]; openEl.style.setProperty("--ew", s[0] + "px"); openEl.style.setProperty("--eh", s[1] + "px");
    openEl.style.visibility = "visible";
    scrollTo(list, 0, true);                           // the list was left wherever it was scrolled to: start at the top (the rows are still hidden)
    field.focus({ preventScroll: true });
    set(pr, 0, 165, 25.5);
    set(cen, 0, 744, 54.5);                            // stop centring: the top edge stays put
    set(w, s[0], 320, 24); set(h, s[1], 210, 19);      // widens from the centre, then the menu drops with a little jelly settle
    if (!RM) set(ly, LEAD, 430, 32.7);                 // soft drift down...
    later(() => set(ly, 0, 132, 13.6), 110);           // ...then back onto the top edge with a little wobble
    set(o, 1, 420, 30);
    later(() => { quiet = false; }, 650);              // the menu has settled: now the blurs of the edge blur may fade in
    refresh();                                         // a component added or removed since the last time changes what can be added
    // the list may have been filtered when it was last closed: wait for Svelte to restore the full list, then start every row hidden
    nextTick().then(() => {
      if (phase !== "open") return;
      fresh = false;
      rows.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      for (const r of rows) { r.s.p = r.s.t = r.s.v = 0; }
      hlItem = null; pressedItem = null; ho.p = ho.t = ho.v = 0;
      render();
      later(() => set(fs, 1, 248, 15.5), 55);          // field first, then the rows one after another
      rows.forEach((r, i) => later(() => set(r.s, 1, 248, 15.5), 55 + (Math.min(i, 8) + 1) * 50));
    });
  }
  function close(restoreFocus = false) {
    if (phase !== "open") return;
    phase = "closed"; isOpen = false; quiet = true; clearLater();
    set(ly, 0, 300, 26);                               // clearLater() also cancels the lead's return-to-zero, so settle it here or the pill stays offset
    endPress(); setHl(null);
    field.blur();
    if (restoreFocus) hit.focus({ preventScroll: true });
    const n = rows.length;                             // bottom row leaves first, the field last, all sliding back toward the pill
    rows.forEach((r, i) => later(() => set(r.s, 0, 600, 49), (n - 1 - i) * 16));
    later(() => set(fs, 0, 600, 49), n * 16);
    set(w, W, 300, 26); set(h, H, 300, 25); set(o, 0, 420, 30);
    clearTimeout(timer);
    timer = setTimeout(() => { hitLocked = false; }, 220);
  }

  // ---- the light pill ----
  function itemEl(t: EventTarget | null): HTMLElement | null {
    const el = (t as Element | null)?.closest?.(".item") as HTMLElement | null;
    return el && el.getAttribute("aria-disabled") !== "true" ? el : null;
  }
  function glow(e: PointerEvent) {
    const r = list.getBoundingClientRect(), k = stage.s;   // the pointer and the rect are real pixels, PAD is a design pixel
    const x = clamp(((e.clientX - r.left - PAD * k) / Math.max(1, r.width - 2 * PAD * k)) * 100, 0, 100);   // across the rows, not the margins
    if (ho.p < 0.05) { gx.p = gx.t = x; gx.v = 0; } else set(gx, x, 500, 40);
  }
  // `it.offsetTop` is measured in .inner (the box lib/scroller.js moves), so the pill scrolls with the rows by itself
  function setHl(it: HTMLElement | null, strength = 0, swell = false) {
    if (!it) { hlItem = null; set(ho, 0, 220, 26); if (!pressedItem) set(ms, 0, 190, 13); return; }
    const y = it.offsetTop, hg = it.offsetHeight;
    if (hlItem !== it) {
      if (ho.p < 0.05) { hy.p = hy.t = y; hy.v = 0; hh.p = hh.t = hg; hh.v = 0; }   // fresh: appear on the row, no slide-in
      else { set(hy, y, 700, 38); set(hh, hg, 700, 38); }                            // switching rows: glide over
    }
    hlItem = it;
    set(ho, strength, 800, 50); set(ms, swell ? 1 : 0, 320, 25);
  }
  function endPress() { if (pressedItem) { pressedItem = null; set(ms, 0, 190, 13); } }

  function onInput() {   // the rows are about to change
    hlItem = null; pressedItem = null; ho.p = ho.t = ho.v = 0;
    scrollTo(list, 0, true);                           // a new search starts at the top
  }

  let dx0 = 0, dy0 = 0;
  function onListDown(e: PointerEvent) {
    const it = itemEl(e.target); if (!it) return;
    dx0 = e.clientX; dy0 = e.clientY;
    pressedItem = it; glow(e); setHl(it, 1, true);
  }
  function onListMove(e: PointerEvent) {
    if (e.pointerType === "mouse") { mx = e.clientX; my = e.clientY; }
    if (e.pointerType !== "mouse" && !pressedItem) return;
    // a finger that moves is scrolling the list (the pointer stays captured by the pressed row, so "left the row" never happens)
    if (pressedItem && e.pointerType !== "mouse" && Math.hypot(e.clientX - dx0, e.clientY - dy0) > 8 * stage.s) { endPress(); setHl(null); return; }
    const it = itemEl(e.target);
    if (it) glow(e);
    if (pressedItem) { if (it !== pressedItem) { endPress(); setHl(null); } }   // dragged off the pressed row: let go of it
    else setHl(it, 0.7, false);                                                  // mouse hover: lighter pill, no swell
  }
  function onListUp(e: PointerEvent) {
    const it = itemEl(e.target); endPress();
    if (e.pointerType === "mouse" && it) setHl(it, 0.7, false); else setHl(null);
  }
  function onListLeave() { endPress(); setHl(null); mx = my = -1; }
  // Called by lib/scroller.js whenever the list moves (wheel, momentum, rubber band, scrollTo): the rows move under a still cursor,
  // so the hover pill is re-targeted. (The browser's own scroll event no longer exists: the scroller owns the position.)
  function onListScrolled() {
    if (mx < 0 || pressedItem || list.contains(document.activeElement)) return;
    const it = itemEl(document.elementFromPoint(mx, my));
    if (it !== hlItem) setHl(it, 0.7, false);
  }
  function onListFocusIn(e: FocusEvent) {
    const it = itemEl(e.target);
    if (it && it.matches(":focus-visible")) { gx.p = gx.t = 50; setHl(it, 0.8, false); }
  }
  function onListFocusOut() { if (!pressedItem) setHl(null); }

  async function pick(item: Entry, e: MouseEvent) {
    if (item.disabled || busy) return;
    const fromKeyboard = e.detail === 0;   // detail 0 = activated from the keyboard: give focus back to the pill
    busy = true; addError = "";
    try {
      // one the client still counts as there (it did not take the removal) has nothing to add on its side
      if (item.c.canAdd) await addComponent(item.c.id);
      await rememberAdded(item.c.name, item.c.singleton);
      reloadHud(true, item.c.name);           // do not wait for the client's update event: read the components again
      close(fromKeyboard);
    } catch (err) {
      addError = err instanceof Error ? err.message : String(err);   // stays open and says why
      console.warn("[ios-clickgui] could not add the component", err);
    }
    busy = false;
  }

  // ---- pill input ----
  function onHitDown(e: PointerEvent) { if (e.pointerType === "mouse" && e.button !== 0) return; down(); }
  function onHitKeyDown(e: KeyboardEvent) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!e.repeat) down(); } }
  function onHitKeyUp(e: KeyboardEvent) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }

  // ---- window ----
  function onWindowPointerDown(e: PointerEvent) { if (phase === "open" && !morph.contains(e.target as Node)) close(); }
  function onWindowKeyDown(e: KeyboardEvent) { if (e.key === "Escape" && phase === "open") { e.stopPropagation(); close(true); } }
  function onResize() {
    if (phase !== "open") return;
    const s = size();
    fullH = s[1]; openEl.style.setProperty("--ew", s[0] + "px"); openEl.style.setProperty("--eh", s[1] + "px");
    set(w, s[0], 420, 26); set(h, s[1], 420, 26);
  }

  // the HUD editor tab was left (or the GUI is closing): fold the menu back into the pill while the pill slides out
  $effect(() => { if (!visible) untrack(() => close()); });

  onMount(() => {
    readAccent();
    render();
    refresh();
    let a = requestAnimationFrame(() => { a = requestAnimationFrame(() => (appear = true)); });
    return () => { cancelAnimationFrame(a); clearTimeout(timer); clearLater(); cancelAnimationFrame(raf); };
  });
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={onWindowKeyDown} onresize={onResize} />

<!-- the stage is a zero-size point at the pill's centre: --ac-left / --ac-top place it (default: centred, with the pill's top edge at 64px like the search bar) -->
<!-- (.probe is only there to read the accent colour as rgb, see readAccent) -->
<div class="stage" class:hid={away} inert={away} bind:this={stageEl}>
  <i class="probe" bind:this={probe} aria-hidden="true"></i>
  <div class="morph" bind:this={morph}>
    <div class="panel-bg" bind:this={bg}></div>
    <div class="closed" bind:this={closedEl} style:width={W + "px"} style:height={H + "px"} style:margin-left={-W / 2 + "px"}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v11M2.5 8h11" /></svg>Add Component
    </div>
    <div class="open" class:live={isOpen} class:quiet bind:this={openEl}>
      <input
        class="field"
        bind:this={field}
        bind:value={query}
        oninput={onInput}
        type="text"
        placeholder="Search"
        aria-label="Search components"
        autocomplete="off"
        spellcheck="false"
        tabindex={isOpen ? 0 : -1}
      />
      <!-- the list runs under the search field. lib/scroller.js scrolls it (momentum, rubber band) and sets --edge-top / --edge-bottom
           on .body, which fade the edge-blur layers (.pb) below -->
      <div class="body">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="list"
          bind:this={list}
          use:scroller={{ onscroll: onListScrolled }}
          onwheel={(e) => e.stopPropagation()}
          onpointerdown={onListDown}
          onpointermove={onListMove}
          onpointerup={onListUp}
          onpointercancel={onListLeave}
          onpointerleave={onListLeave}
          onfocusin={onListFocusIn}
          onfocusout={onListFocusOut}
        >
          <div class="inner">
            <div class="hl" bind:this={hlEl}></div>
            {#if addError}<p class="err" role="alert">Could not add it: {addError}</p>{/if}
            {#each filtered as item (item.id)}
              <button
                class="item"
                type="button"
                use:row={item}
                aria-disabled={item.disabled ? "true" : undefined}
                tabindex={item.disabled ? -1 : 0}
                onclick={(e) => pick(item, e)}
              >
                <b>{item.name}</b>
                <span>{item.description}</span>
              </button>
            {:else}
              <div class="empty">{emptyText}</div>
            {/each}
          </div>
        </div>
        <div class="pb top" aria-hidden="true"><i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b5"></i><i class="b8"></i></div>
        <div class="pb bottom" aria-hidden="true" bind:this={pbBottom}><i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b5"></i><i class="b8"></i></div>
      </div>
    </div>
  </div>
  <button
    class="hit"
    bind:this={hit}
    aria-label="Add Component"
    aria-expanded={isOpen}
    style:width={W + 10 + "px"}
    style:height={H + 10 + "px"}
    style:pointer-events={hitLocked ? "none" : null}
    onpointerdown={onHitDown}
    onpointerup={open}
    onpointerleave={release}
    onpointercancel={release}
    onkeydown={onHitKeyDown}
    onkeyup={onHitKeyUp}
  ></button>
</div>

<style>
  /* Above every component of the editor (their z-index comes from the client and grows each time one is brought to the front;
     .hud-editor is its own stacking context). Absolute inside the scaled layer of .hud-editor (lib/Stage.svelte: design pixels, so 84px is 84px at any resolution): the pill's centre is 24px under the
     64px line where the search bar of the ClickGUI page starts, below the tab bar (centre = 64 + H / 2). */
  .stage {
    position: absolute;
    left: var(--ac-left, 50%);
    top: var(--ac-top, 84px);
    z-index: 100000;
    width: 0;
    height: 0;
    pointer-events: auto;   /* the layer around it (HudEditor.svelte, lib/Stage.svelte) is passthrough */
    box-sizing: border-box;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    color: #fff;
    font-family: var(--cg-font, "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
    /* Enter / leave: the same motion as the search bar it replaces (opacity + `translate`, entering waits 120 ms for the search bar to be
       gone). `translate` is a property of its own, so the pill's own `transform` springs are not touched. */
    transition: opacity 320ms cubic-bezier(.2, .7, .3, 1) 120ms, translate 420ms cubic-bezier(.2, .9, .3, 1.1) 120ms;
  }
  .stage.hid { opacity: 0; translate: 0 -14px; pointer-events: none;
    transition: opacity 240ms cubic-bezier(.4, 0, 1, 1), translate 300ms cubic-bezier(.4, 0, 1, 1); }
  @media (prefers-reduced-motion: reduce) { .stage, .stage.hid { transition: none; } }
  .stage *, .stage *::before, .stage *::after { box-sizing: inherit; }

  /* width always grows from the middle, while the bottom edge drops when it opens */
  .morph { position: absolute; left: 0; top: -20px; transform: translateX(-50%); width: 150px; height: 40px; border-radius: 20px; background: #3a1f5d; box-shadow: inset 0 0 0 1px rgba(255,255,255,.2), 0 8px 24px rgba(0,0,0,calc(.32 * var(--sh, 0))); overflow: hidden; will-change: width, height, top, transform; }
  .panel-bg { position: absolute; inset: 0; opacity: 0; pointer-events: none;
    background: radial-gradient(60% 40% at 50% 100%, rgba(var(--glow, 78, 62, 178), .5), transparent 70%),
      linear-gradient(135deg, rgb(var(--tone1, 59, 34, 87)) 0%, rgb(var(--tone2, 75, 42, 99)) 50%, rgb(var(--tone3, 94, 47, 104)) 100%); }
  .probe { display: none; color: var(--cg-accent, #0a84ff); }

  .closed { position: absolute; left: 50%; top: 0; width: 150px; height: 40px; margin: 0 0 0 -75px; display: flex; align-items: center; justify-content: center; gap: 7px; color: var(--pill-fg, #fff); font-size: 14px; font-weight: 500; letter-spacing: -.005em; white-space: nowrap; pointer-events: none; will-change: transform, opacity; }
  svg { width: 14px; height: 14px; flex: none; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; display: block; }

  /* everything inside the open menu is driven by springs from the script, like the rows of the morphing menu.
     --hh: where the search field ends (10px margin + 48px): the list runs underneath it. --fade: length of the edge-blur fade. */
  .open { --hh: 58px; --fade: 48px; position: absolute; left: 50%; top: 0; width: var(--ew, 500px); height: var(--eh, 460px); margin: 0 0 0 calc(var(--ew, 500px) / -2); visibility: hidden; pointer-events: none; color: #fff; }
  .open.live { pointer-events: auto; }
  .field { position: absolute; z-index: 3; top: 10px; left: 10px; width: calc(100% - 20px); height: 48px; margin: 0; padding: 0 18px; border: 0; border-radius: 24px; background: rgba(255,255,255,.1); color: #fff; caret-color: #fff; font-family: inherit; font-size: 17px; font-weight: 500; line-height: 1; outline: none; user-select: text; -webkit-user-select: text; opacity: 0; transition: background-color .2s ease; }
  .field:focus { background: rgba(255,255,255,.14); }
  .field::placeholder { color: rgba(255,255,255,.45); }

  /* The list is clipped here; lib/scroller.js moves its first child (.inner) and owns the scroll position. It fills the whole menu: the top
     padding of .inner is what keeps the rows clear of the search field at rest. */
  .body { position: absolute; inset: 0; }
  .list { position: absolute; inset: 0; overflow-y: hidden; overscroll-behavior: contain; scrollbar-width: none; touch-action: none; }
  .list::-webkit-scrollbar { display: none; }
  .inner { position: relative; padding: calc(var(--hh) + 6px) 10px 10px; will-change: transform; }
  /* the light pill glides between rows and the glow follows the pointer sideways (same as the morphing menu) */
  .hl { position: absolute; left: 10px; right: 10px; top: 0; height: 0; border-radius: 24px; background: radial-gradient(130% 160% at var(--px, 50%) 50%, rgba(255,255,255,.22), rgba(255,255,255,.07) 75%); opacity: 0; pointer-events: none; z-index: 0; will-change: transform, opacity; }
  .item { position: relative; z-index: 1; display: block; width: 100%; margin: 0; padding: 10px 18px; border: 0; border-radius: 24px; background: transparent; color: #fff; text-align: left; font-family: inherit; cursor: pointer; outline: none; touch-action: manipulation; opacity: 0; transform-origin: 50% 0; }
  .item b { display: block; font-size: 17px; font-weight: 500; line-height: 1.25; }
  .item span { display: block; margin-top: 2px; font-size: 14px; font-weight: 400; line-height: 1.3; color: rgba(255,255,255,.62); }
  .item[aria-disabled="true"] { pointer-events: none; }
  /* the global focus ring of the ClickGUI ( :focus-visible ) is not wanted here: the pill, the light and the field show the focus */
  .hit:focus-visible, .item:focus-visible, .field:focus-visible { outline: none; }
  .empty { padding: 22px 18px; font-size: 14px; color: rgba(255,255,255,.6); opacity: 0; transition: opacity .25s ease .1s; }
  .open.live .empty { opacity: 1; }
  .err { margin: 0 0 6px; padding: 8px 14px; border-radius: 18px; background: rgba(255, 69, 58, .22); font-size: 13px; line-height: 1.35; color: #ffd8d5; overflow-wrap: anywhere; }

  .hit { position: absolute; left: 0; top: 0; width: 160px; height: 50px; transform: translate(-50%, -50%); margin: 0; padding: 0; border: 0; background: none; outline: none; cursor: pointer; touch-action: manipulation; z-index: 2; }
  .stage:has(.hit:focus-visible) .morph { box-shadow: inset 0 0 0 1px rgba(255,255,255,.2), 0 8px 24px rgba(0,0,0,calc(.32 * var(--sh, 0))), 0 0 0 3px var(--ac-ring-gap, #0f0916), 0 0 0 5px var(--cg-accent, #0a84ff); }

  /* Edge blur (the iPadOS look), the same layers as lib/Panel.svelte: where content is hidden above / below, five stacked
     backdrop blurs (1, 2, 3, 5, 8 px), each with its own eased mask (--s = still full strength, --e = gone). At the top the band covers the
     search field (--o) and then fades over --fade below it, so rows that scroll under the field are blurred too; the field (z-index 3)
     stays crisp on top. lib/scroller.js sets --edge-top / --edge-bottom (0..1) on .body.
     Each <i> is faded with its own opacity, never the .pb wrapper: a parent with opacity < 1 would stop the blur from seeing the list.
     No tint on top of the blur. */
  .pb { position: absolute; left: 0; right: 0; height: calc(var(--o) + var(--fade)); z-index: 2; pointer-events: none; }
  .pb.top { top: 0; --to: to bottom; --o: var(--hh); }
  .pb.bottom { bottom: 0; --to: to top; --o: 0px; }
  .pb i { position: absolute; inset: 0; }
  .pb.top i { opacity: var(--edge-top, 0); }
  .pb.bottom i { opacity: var(--edge-bottom, 0); }
  /* Closing: the edge blur fades out with the list. Opening: the bottom blur builds up while the menu grows (an animation, not a
     transition; it only holds the START value, the end is the live --edge-bottom, so scrolling is never delayed). */
  .open:not(.live) .pb i { opacity: 0; transition: opacity .24s ease-in; }
  @keyframes edge-in { from { opacity: 0; } }
  /* The 10 backdrop blurs are the heavy part. While the menu grows / shrinks (`.quiet`) they are off, and when it has settled they fade in. */
  .open.quiet .pb.top i { -webkit-backdrop-filter: none; backdrop-filter: none; }
  .open.live:not(.quiet) .pb.top i { animation: edge-in .32s ease-out backwards; }
  /* The bottom edge is the exception: its blurs stay on while the menu grows / shrinks. The layer rides on the moving bottom edge (see render()),
     so the rows melt into the edge all the way down instead of being cut off crisp, and the blur does not pop in once the menu has settled. */
  .open.live .pb.bottom i { animation: edge-in .26s cubic-bezier(.25, 0, .4, 1) backwards; }
  @media (prefers-reduced-motion: reduce) { .pb i { animation: none !important; } }
  /* a window carries the screen layer (dock path, see README): no backdrop blurs at all, same as the windows of the GUI */
  :global([data-fx-carry] .clickgui .stage .pb i) { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
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
</style>
