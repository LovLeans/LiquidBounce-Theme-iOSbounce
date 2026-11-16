/*
 * Shared engine for the pill tab bars (Segmented.svelte, IosSegmented.svelte, clickgui-ios/tabs/TabBar.svelte).
 *
 * A bar is three layers inside one positioned `track`:
 *
 *   track
 *     lens   the selection pill (this file sets its left/top/width/height/radius)
 *     base   wrapper holding the REAL labels (they are the layout, the hit targets and the dim text)
 *     fg     absolute copy of the labels in the highlighted colour, laid out exactly like `base`
 *
 * Every frame the pill is drawn, the base layer is clipped so its labels disappear underneath the pill, and the fg layer is clipped
 * to the pill, so the text that is inside the pill is the highlighted copy (and is magnified a little while pressed).
 *
 * The pill follows the finger / mouse with springs, swells and squashes while pressed and stretches with speed. Releasing snaps to
 * the nearest label. Nothing here is reactive state: the animation writes straight to element styles, and the component only hears
 * about a change through `pick` (and about "measured / not measured" through `ready`).
 *
 * Geometry is read from the real labels (`offsetLeft/Top/Width/Height` inside `track`), so any layout works (flex with a gap,
 * grid) as long as `base` and `fg` are not positioned themselves (so the labels' offsetParent is `track`) and `fg` fills `track`.
 */

export interface PillOptions {
    track: HTMLElement;
    lens: HTMLElement;
    /** Holds the real labels as its direct children, in order. */
    base: HTMLElement;
    /** Holds one copy per label as its direct children, in the same order. */
    fg: HTMLElement;
    /** Selected index, -1 for none. Read on layout and on `sync()`. */
    index: () => number;
    /** The user chose label `i` (only called when it differs from the previous choice). */
    pick: (i: number) => void;
    /** Called when the bar has (true) / has not (false, e.g. display:none) a measurable size. */
    ready?: (ok: boolean) => void;
}

export interface Pill {
    /** Re-measure and put the pill on the selected label without animation (not while dragging). */
    layout(): void;
    /** Follow `index()` with the spring if it no longer matches (call after the parent changed the value). */
    sync(): void;
    /** Move to label `i` (the keyboard path); `pulse` plays the little press swell. */
    go(i: number, pulse?: boolean): void;
    destroy(): void;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/* rounded rectangle as an SVG path (the original pill is the case r = H / 2) */
function rrect(L: number, T: number, W: number, H: number, r: number): string {
    r = Math.max(0, Math.min(r, W / 2, H / 2));
    return (
        "M" + (L + r) + " " + T +
        "H" + (L + W - r) +
        "A" + r + " " + r + " 0 0 1 " + (L + W) + " " + (T + r) +
        "V" + (T + H - r) +
        "A" + r + " " + r + " 0 0 1 " + (L + W - r) + " " + (T + H) +
        "H" + (L + r) +
        "A" + r + " " + r + " 0 0 1 " + L + " " + (T + H - r) +
        "V" + (T + r) +
        "A" + r + " " + r + " 0 0 1 " + (L + r) + " " + T + "Z"
    );
}

export function createPill(o: PillOptions): Pill {
    const {track, lens, base, fg} = o;

    /* measured layout (px, relative to track's padding box) */
    let slots: HTMLElement[] = [];
    let copies: HTMLElement[] = [];
    let SL: number[] = []; // label left edges
    let SW: number[] = []; // label widths
    let ST = 0; // label top
    let SH = 0; // label height
    let wAvg = 0;
    let R0 = 0; // the pill's corner radius from the stylesheet
    let BX = 0, BY = 0, BW = 0, BH = 0; // base layer box
    let FW = 0, FH = 0; // fg layer box
    let n = 0;
    let ok = false;
    let lastReady: boolean | undefined;

    /* animation state: x = pill left edge, tx = its target, p = press amount (springs, may overshoot) */
    let x = 0, v = 0, tx = 0;
    let p = 0, pv = 0, pt = 0;
    let idx = -1;
    let hidden = true; // no selection
    let dragging = false;
    let dead = false;
    let raf = 0, last = 0, downAt = 0;
    let pend: ReturnType<typeof setTimeout> | undefined;
    let rel: ReturnType<typeof setTimeout> | undefined;

    const norm = (i: number) => (Number.isInteger(i) && i >= 0 && i < n ? i : -1);

    function measure() {
        slots = Array.from(base.children) as HTMLElement[];
        copies = Array.from(fg.children) as HTMLElement[];
        n = Math.min(slots.length, copies.length);
        SL = slots.slice(0, n).map((s) => s.offsetLeft);
        SW = slots.slice(0, n).map((s) => s.offsetWidth);
        ST = n ? slots[0].offsetTop : 0;
        SH = n ? slots[0].offsetHeight : 0;
        wAvg = n ? SW.reduce((a, b) => a + b, 0) / n : 0;
        BX = base.offsetLeft;
        BY = base.offsetTop;
        BW = base.offsetWidth;
        BH = base.offsetHeight;
        FW = fg.offsetWidth;
        FH = fg.offsetHeight;
        // our own inline radius would be read back otherwise
        lens.style.borderRadius = "";
        R0 = parseFloat(getComputedStyle(lens).borderTopLeftRadius) || 0;
        ok = n > 0 && SH > 0 && wAvg > 0;
    }

    function setReady(r: boolean) {
        if (r === lastReady) return;
        lastReady = r;
        o.ready?.(r);
    }

    /* width of the pill at left edge xx (labels may differ in width) */
    function widthAt(xx: number): number {
        if (n === 1 || xx <= SL[0]) return SW[0];
        if (xx >= SL[n - 1]) return SW[n - 1];
        let i = 0;
        while (i < n - 2 && xx >= SL[i + 1]) i++;
        const f = (xx - SL[i]) / (SL[i + 1] - SL[i]);
        return SW[i] + (SW[i + 1] - SW[i]) * f;
    }

    /* no room at the ends: the pill stops, with only a tiny give */
    function rb(raw: number): number {
        const mn = SL[0];
        const mx = SL[n - 1];
        const g = wAvg * 0.09;
        const lim = (d: number) => g * (1 - Math.exp(-d / (wAvg * 0.45)));
        return raw < mn ? mn - lim(mn - raw) : raw > mx ? mx + lim(raw - mx) : raw;
    }

    function nearest(xx: number): number {
        const c = xx + wAvg / 2;
        let best = 0;
        let bd = Infinity;
        for (let i = 0; i < n; i++) {
            const d = Math.abs(SL[i] + SW[i] / 2 - c);
            if (d < bd) {
                bd = d;
                best = i;
            }
        }
        return best;
    }

    function render() {
        if (!ok) return;

        if (hidden) {
            lens.style.display = "none";
            base.style.clipPath = "";
            fg.style.clipPath = "inset(50%)";
            return;
        }

        const s = Math.min(Math.abs(v) / (wAvg * 13), 0.42); // speed -> stretch
        const sx = 1 + p * 0.38 + s * 0.63; // squash & stretch
        const sy = 1 + p * 0.22 - s * 0.25;
        const w0 = widthAt(x);
        const W = w0 * sx;
        const H = SH * sy;
        const cx = x + w0 / 2;
        const cy = ST + SH / 2;
        const L = cx - W / 2;
        const T = cy - H / 2;
        const r = Math.min(H / 2, R0 * sy);

        const st = lens.style;
        st.display = "";
        st.left = L + "px";
        st.top = T + "px";
        st.width = W + "px";
        st.height = H + "px";
        st.bottom = "auto";
        st.borderRadius = r + "px";
        st.transform = "none"; // the stylesheet's own translate / transition would fight the spring
        st.transition = "none";
        st.setProperty("--p", clamp01(p).toFixed(3));

        // real labels vanish under the pill, the highlighted copies show inside it
        base.style.clipPath =
            'path(evenodd,"M-60 -60H' + (BW + 60) + "V" + (BH + 60) + "H-60Z " + rrect(L - BX, T - BY, W, H, r) + '")';
        fg.style.clipPath =
            "inset(" + T + "px " + (FW - (L + W)) + "px " + (FH - (T + H)) + "px " + L + "px round " + r + "px)";

        const sc = "scale(" + (1 + p * 0.3 + s * 0.05).toFixed(3) + ")";
        for (let i = 0; i < n; i++) {
            const c = copies[i].style;
            c.transformOrigin = cx - SL[i] + "px " + (cy - ST) + "px";
            c.transform = sc;
        }
    }

    function reduced(): boolean {
        return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    function step(t: number) {
        raf = 0;
        if (dead) return;
        const dt = Math.min(0.033, (t - last) / 1000 || 0.016);
        last = t;
        const k = Math.ceil(dt / 0.0042);
        const h = dt / k;
        for (let i = 0; i < k; i++) {
            v += ((tx - x) * 290 - v * 19) * h;
            x += v * h;
            pv += ((pt - p) * 185 - pv * 14.5) * h;
            p += pv * h;
        }
        render();
        if (Math.abs(tx - x) > 0.04 || Math.abs(v) > 0.4 || Math.abs(pt - p) > 0.002 || Math.abs(pv) > 0.01) {
            raf = requestAnimationFrame(step);
        }
    }

    function kick() {
        if (!ok || dead) return;
        if (reduced()) {
            // no spring, no swell: jump
            x = tx;
            v = 0;
            p = pt = pv = 0;
            render();
            return;
        }
        if (raf) return;
        last = performance.now();
        raf = requestAnimationFrame(step);
    }

    /* tiny beat before the pill swells */
    function squeeze() {
        clearTimeout(pend);
        pend = setTimeout(() => {
            pt = 1;
            kick();
        }, 60);
    }

    function release() {
        clearTimeout(rel);
        const wait = Math.max(0, 210 - (performance.now() - downAt));
        rel = setTimeout(() => {
            if (!dragging) {
                pt = 0;
                kick();
            }
        }, wait);
    }

    function go(i: number, pulse = false) {
        const to = norm(i);
        if (!ok) {
            idx = to;
            hidden = to < 0;
            return;
        }
        if (to < 0) {
            idx = -1;
            hidden = true;
            render();
            return;
        }
        const wasHidden = hidden;
        idx = to;
        hidden = false;
        tx = SL[to];
        if (wasHidden) {
            x = tx;
            v = 0;
        }
        if (pulse) {
            downAt = performance.now();
            pt = 1;
            release();
        }
        kick();
    }

    function layout() {
        if (dead) return;
        measure();
        if (!ok) {
            lens.style.display = "none";
            base.style.clipPath = "";
            fg.style.clipPath = "";
            setReady(false);
            return;
        }
        if (!dragging) {
            idx = norm(o.index());
            hidden = idx < 0;
            if (!hidden) x = tx = SL[idx];
            v = 0;
        }
        setReady(true);
        render();
    }

    function sync() {
        if (dead || dragging || !ok) return;
        const want = norm(o.index());
        if (want !== idx) go(want, false);
    }

    /* pointer x inside the track, undoing any scale a parent applies (popovers / the 1366x768 editor are scaled) */
    function localX(e: PointerEvent): number {
        const r = track.getBoundingClientRect();
        const k = r.width / track.offsetWidth || 1;
        return (e.clientX - r.left) / k - track.clientLeft;
    }

    function onDown(e: PointerEvent) {
        if (!ok || dead) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        dragging = true;
        downAt = performance.now();
        clearTimeout(rel);
        try {
            track.setPointerCapture(e.pointerId);
        } catch {
            /* the pointer is already gone: the up / cancel event still ends the drag */
        }
        tx = rb(localX(e) - wAvg / 2);
        if (hidden) {
            hidden = false;
            x = tx;
            v = 0;
        }
        squeeze();
        kick();
    }

    function onMove(e: PointerEvent) {
        if (!dragging) return;
        tx = rb(localX(e) - wAvg / 2);
        kick();
    }

    function onUp() {
        if (!dragging) return;
        dragging = false;
        const i = nearest(tx);
        const changed = i !== idx;
        idx = i;
        hidden = false;
        tx = SL[i];
        release();
        kick();
        if (changed) o.pick(i);
    }

    track.addEventListener("pointerdown", onDown);
    track.addEventListener("pointermove", onMove);
    track.addEventListener("pointerup", onUp);
    track.addEventListener("pointercancel", onUp);

    // the bar can be mounted while hidden or scaled; follow its size
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => layout()) : undefined;
    ro?.observe(track);
    ro?.observe(base);

    // a webfont arriving changes the label widths
    const onFonts = () => layout();
    document.fonts?.addEventListener?.("loadingdone", onFonts);

    return {
        layout,
        sync,
        go,
        destroy() {
            dead = true;
            cancelAnimationFrame(raf);
            raf = 0;
            clearTimeout(pend);
            clearTimeout(rel);
            ro?.disconnect();
            document.fonts?.removeEventListener?.("loadingdone", onFonts);
            track.removeEventListener("pointerdown", onDown);
            track.removeEventListener("pointermove", onMove);
            track.removeEventListener("pointerup", onUp);
            track.removeEventListener("pointercancel", onUp);
        }
    };
}
