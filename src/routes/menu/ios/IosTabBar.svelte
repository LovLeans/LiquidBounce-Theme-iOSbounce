<!--
    The tab bar with icons (the "Flat tab bars" prototype, bars 1 and 2) for the iOS-style dialogs: a glass capsule, an icon above
    each label, and a pill that follows the pointer with springs, swells and stretches with speed, then settles on a tab. The labels
    under the pill are drawn again in the accent colour inside it (`.fg`, clipped to the pill and magnified a little while pressed).
    The physics are the prototype's, unchanged; what is new is only the theme (iOS tokens) and
      - `tabs` carry their own icon (see tabIcons.ts),
      - the bar is as tall for 2 tabs as for 3 / 4 (a 2-tab bar is narrower, not squatter),
      - it re-measures when it becomes visible: it is mounted inside an ExpandWindow that is still display:none.

        <IosTabBar tabs={[{label: "Cracked", icon: "cracked"}, {label: "Session", icon: "session"}]} bind:value={tab}/>

    `width` is the width a 3 / 4-tab bar gets (any CSS length); a 2-tab bar is two thirds of it. Everything inside is sized from the
    bar's own height, so the whole bar scales with it.
-->
<script lang="ts">
    import {untrack} from "svelte";
    import {TAB_ICONS, type TabIcon} from "./tabIcons";

    interface Tab {
        label: string;
        icon?: TabIcon;
    }

    interface Props {
        tabs: Tab[];
        /** Selected tab index (bindable). */
        value?: number;
        /** Width of a 3 / 4-tab bar. */
        width?: string;
        /** The whole bar swells while it is pressed. */
        swell?: boolean;
        label?: string;
        /** The user picked a tab (pointer or keys), not called when the parent changes `value`. */
        onchange?: (index: number) => void;
    }

    let {tabs, value = $bindable(0), width = "100%", swell = true, label, onchange}: Props = $props();

    const n = $derived(tabs.length);
    // 3 and 4 tabs: 5.3 : 1. Fewer tabs keep the height (a cell of 1.77 : 1) and get narrower.
    const aspect = $derived(n >= 3 ? 5.3 : n * 1.77);
    const share = $derived(n >= 3 ? 1 : n / 3);

    const PAD = 4;
    const OV = 40;

    let bar: HTMLDivElement;
    let btns: HTMLButtonElement[] = $state([]);

    /* Rendered output of the spring simulation (replaced wholesale every frame). */
    let view = $state.raw({
        L: 0, T: 0, W: 0, H: 0, r: 0,
        q: 0, scale: 1, u: 0,
        tabsClip: '', fgClip: '', origin: '', fgScale: 1
    });
    let shown = $state(-1);

    /* Simulation state: x = pill position, p = press amount (springs, may overshoot). Not reactive on purpose. */
    let BW = 0, BH = 0, w = 0, H0 = 0;
    let x = 0, v = 0, tx = 0;
    let p = 0, pv = 0, pt = 0;
    let raf = 0, last = 0, drag = $state(false), downAt = 0, pend = 0, relT = 0;
    let idx = untrack(() => value);
    let dead = false;

    const clamp = (a: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, a));
    const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    function measure() {
        BW = bar.clientWidth;
        BH = bar.clientHeight;
        w = (BW - PAD * 2) / n;
        H0 = BH - PAD * 2;
    }

    /* No room at the ends: the pill stops, with only a tiny give. */
    function rb(raw: number) {
        const mx = (n - 1) * w, g = w * 0.09;
        const lim = (d: number) => g * (1 - Math.exp(-d / (w * 0.45)));
        return raw < 0 ? -lim(-raw) : raw > mx ? mx + lim(raw - mx) : raw;
    }

    function pill(L: number, T: number, W: number, H: number) {
        const r = H / 2;
        return `M${L + r} ${T}H${L + W - r}A${r} ${r} 0 0 1 ${L + W - r} ${T + H}H${L + r}A${r} ${r} 0 0 1 ${L + r} ${T}Z`;
    }

    function render() {
        const s = Math.min(Math.abs(v) / (w * 13), 0.42);   /* speed -> stretch */
        const sx = 1 + p * 0.38 + s * 0.63;                  /* squash & stretch */
        const sy = 1 + p * 0.22 - s * 0.25;
        const W = w * sx, H = H0 * sy;
        const cx = PAD + x + w / 2, cy = BH / 2;
        const L = cx - W / 2, T = cy - H / 2, r = H / 2;

        view = {
            L, T, W, H, r,
            q: clamp(p, 0, 1),
            scale: 1 + p * 0.048,
            // one unit = 1/100 of the width of a 3 / 4-tab bar (the prototype's `--u`), taken from the height so a 2-tab bar matches
            u: BH * 5.3 / 100,
            /* labels hidden under the pill, the accent copy shown inside it (magnified) */
            tabsClip: `path(evenodd,"M-60 -60H${BW + 60}V${BH + 60}H-60Z ${pill(L, T, W, H)}")`,
            fgClip: `inset(${T + OV}px ${BW + OV - L - W}px ${BH + OV - T - H}px ${L + OV}px round ${r}px)`,
            origin: `${cx}px ${cy}px`,
            fgScale: 1 + p * 0.3 + s * 0.05
        };
        shown = clamp(Math.round(x / w), 0, n - 1);
    }

    function step(t: number) {
        raf = 0;
        if (dead) return;
        const dt = Math.min(0.033, (t - last) / 1000 || 0.016);
        last = t;
        const k = Math.ceil(dt / 0.0042), h = dt / k;
        for (let i = 0; i < k; i++) {
            v += ((tx - x) * 290 - v * 19) * h; x += v * h;
            pv += ((pt - p) * 185 - pv * 14.5) * h; p += pv * h;
        }
        render();
        if (Math.abs(tx - x) > 0.04 || Math.abs(v) > 0.4 || Math.abs(pt - p) > 0.002 || Math.abs(pv) > 0.01) {
            raf = requestAnimationFrame(step);
        }
    }

    function kick() {
        if (dead || !BW) return;
        if (reduced()) {
            x = tx; v = 0; p = pt = pv = 0;
            render();
            return;
        }
        if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); }
    }

    /* tiny beat before the pill swells */
    function squeeze() {
        clearTimeout(pend);
        pend = window.setTimeout(() => { pt = 1; kick(); }, 60);
    }

    function release() {
        const wait = Math.max(0, 210 - (performance.now() - downAt));
        clearTimeout(relT);
        relT = window.setTimeout(() => { if (!drag) { pt = 0; kick(); } }, wait);
    }

    function go(i: number, pulse: boolean) {
        idx = clamp(i, 0, n - 1);
        tx = idx * w;
        value = idx;
        if (pulse) { downAt = performance.now(); pt = 1; release(); onchange?.(idx); }
        kick();
    }

    function rawFromPointer(e: PointerEvent) {
        const r = bar.getBoundingClientRect(), k = r.width / BW;
        return (e.clientX - (r.left + r.width / 2)) / k + BW / 2 - PAD - w / 2;
    }

    function onpointerdown(e: PointerEvent) {
        if (!BW || (e.pointerType === 'mouse' && e.button !== 0)) return;
        drag = true;
        downAt = performance.now();
        clearTimeout(relT);
        try { bar.setPointerCapture(e.pointerId); } catch { /* the pointer is gone: up / cancel still ends the drag */ }
        tx = rb(rawFromPointer(e));
        squeeze();
        kick();
    }

    function onpointermove(e: PointerEvent) {
        if (drag) { tx = rb(rawFromPointer(e)); kick(); }
    }

    function up() {
        if (!drag) return;
        drag = false;
        const i = clamp(Math.round(tx / w), 0, n - 1);
        const changed = i !== idx;
        idx = i;
        tx = idx * w;
        if (changed) { value = idx; onchange?.(idx); }
        release();
        kick();
    }

    function onkeydown(e: KeyboardEvent) {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        go(idx + d, true);
        btns[idx]?.focus();
    }

    function layout() {
        if (!bar || drag) return;
        measure();
        if (!BW || !BH) return; // display:none (the window it sits in is not open yet): the observer calls again
        idx = clamp(idx, 0, n - 1);
        x = tx = idx * w;
        v = 0;
        render();
    }

    /* initial layout + re-layout when the tab count changes */
    $effect(() => {
        n;
        untrack(layout);
    });

    /* external changes to `value` move the pill */
    $effect(() => {
        const val = value;
        untrack(() => { if (val !== idx && BW) go(val, false); else if (val !== idx) idx = clamp(val, 0, n - 1); });
    });

    /* the bar is mounted while its window is still hidden / being scaled: follow its size */
    $effect(() => {
        if (typeof ResizeObserver !== 'function') return;
        const ro = new ResizeObserver(() => layout());
        ro.observe(bar);
        return () => ro.disconnect();
    });

    /* cleanup */
    $effect(() => () => {
        dead = true;
        cancelAnimationFrame(raf);
        clearTimeout(pend);
        clearTimeout(relT);
    });
</script>

{#snippet inner(i: number)}
    {#if tabs[i].icon}
        <svg viewBox="0 0 24 24" aria-hidden="true">{@html TAB_ICONS[tabs[i].icon!]}</svg>
    {/if}
    <span>{tabs[i].label}</span>
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
    bind:this={bar}
    class="bar"
    class:drag
    role="tablist"
    aria-label={label}
    style:--W={width}
    style:--share={share}
    style:aspect-ratio={aspect}
    style:--u={view.u ? `${view.u}px` : null}
    style:--p={view.q.toFixed(3)}
    style:scale={swell ? view.scale.toFixed(4) : null}
    {onpointerdown}
    {onpointermove}
    onpointerup={up}
    onpointercancel={up}
    {onkeydown}
>
    <div class="gw"></div>

    <div
        class="lens"
        style:left="{view.L}px"
        style:top="{view.T}px"
        style:width="{view.W}px"
        style:height="{view.H}px"
        style:border-radius="{view.r}px"
    ></div>

    <div class="tabs" style:clip-path={view.tabsClip || null}>
        {#each tabs as _, i}
            <button
                bind:this={btns[i]}
                type="button"
                class="t"
                role="tab"
                aria-selected={shown === i}
                tabindex={shown === i ? 0 : -1}
                onclick={(e) => { if (e.detail === 0) go(i, true); }}
            >
                {@render inner(i)}
            </button>
        {/each}
    </div>

    <div class="fg" aria-hidden="true" style:clip-path={view.fgClip || null}>
        <div
            class="fgin"
            style:transform-origin={view.origin}
            style:transform="scale({view.fgScale.toFixed(3)})"
        >
            {#each tabs as _, i}
                <div class="t">{@render inner(i)}</div>
            {/each}
        </div>
    </div>
</div>

<style>
    .bar {
        position: relative;
        flex: none;
        align-self: center;
        box-sizing: border-box;
        width: calc(var(--W) * var(--share));
        --u: 6px;
        touch-action: pan-y;
        user-select: none;
        -webkit-user-select: none;
        cursor: grab;
        font-size: calc(var(--u) * 3.9);
        font-weight: 600;
        /* labels under the pill: dim; the copy inside the pill: the accent, lifted a little so it reads on the glass */
        color: var(--ios-text-dim);
        --sel: color-mix(in srgb, var(--ios-accent) 62%, #ffffff);
    }

    .bar.drag {
        cursor: grabbing;
    }

    .gw {
        position: absolute;
        inset: 0;
        border-radius: 999px;
        background: var(--ios-field);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
    }

    .tabs {
        position: absolute;
        inset: 0;
        display: flex;
        padding: 4px;
        box-sizing: border-box;
    }

    .t {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: calc(var(--u) * 1.65);
        line-height: 1;
        white-space: nowrap;
    }

    .t svg {
        width: calc(var(--u) * 7.2);
        height: calc(var(--u) * 7.2);
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
    }

    button.t {
        border: 0;
        background: none;
        color: inherit;
        font: inherit;
        padding: 0;
        margin: 0;
        cursor: inherit;
        -webkit-tap-highlight-color: transparent;
    }

    button.t:focus-visible {
        outline: 3px solid #ffffff;
        outline-offset: -4px;
        border-radius: 999px;
    }

    /* faint lighter pill at rest, brighter, outlined and lifted while pressed */
    .lens {
        position: absolute;
        pointer-events: none;
        background: rgba(255, 255, 255, calc(0.16 + var(--p) * 0.2));
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, calc(0.12 + var(--p) * 0.3)), 0 2px 8px rgba(0, 0, 0, 0.25);
    }

    .fg {
        position: absolute;
        inset: -40px;
        pointer-events: none;
        color: var(--sel);
    }

    .fgin {
        position: absolute;
        inset: 40px;
        display: flex;
        padding: 4px;
        box-sizing: border-box;
    }
</style>
