<!--
    A window that grows out of a button of an iOS-style screen and shrinks back into it: the same springs, blur, tilt, shadow and
    cross-fade as the app windows that grow out of the dock icons (title/main-menu/launcher.ts). The button hides while its window
    is alive, and the window starts as a copy of it.

    It opens as soon as it is mounted and is removed by its owner in `onclosed`:

        {#if mounted}
            <ExpandWindow bind:this={win} anchor={() => button} onclosed={() => (mounted = false)}>
                <TheScreen/>                    // drawn full size, scaled onto the window every frame
            </ExpandWindow>
        {/if}

    `close()` shrinks it into the button again. The animation can be interrupted with a press on the window: while it has only just
    started to grow (less than 80% of its way) a press on the button's own spot (its original size, where the button was) cancels it
    and it turns around into the button, and while it shrinks a press on that spot turns it around again and it grows back
    (`onreopening`). A press anywhere else on the window in those moments does nothing. Neither reaches the screen on the window,
    nor does the click that follows it. A window that shrinks because the screen under it closes (Esc, Cancel) cannot be turned around.
    It is also closed by itself when the app window of the screen it sits on is told to
    close (Esc, Cancel, ...): then it shrinks into its button while the whole screen shrinks into the dock icon, exactly like a window
    that was closed with its own button. Without children it is just the wallpaper plate (Create New World: the client's own screen
    takes over once it is open, see Singleplayer.svelte).

    `restore` starts it fully open and shrinks it into the button right away: the client's screen that was drawn instead of it has
    just been closed.

    `size` makes it a window instead of a full screen: it grows out of the button with the very same motion, but comes to rest as a
    centred window of that size (in the units of the iOS stage, like a button: 45 = the height of an IosButton) over a dimmed
    screen, and a tap outside it closes it. The size shrinks to fit when the window is too small for it. The children are laid out
    at exactly `size` and scaled with the window (see IosDialog.svelte, which is what the Add / Edit / Direct Connect / ViaFabricPlus
    dialogs are made of).

    `motion` picks how it moves. "app" (default) is the dock-app launch: a tilted, blurred flight (the account manager). "morph" is the
    motion of the lock-screen + menu (MorphingMenu.svelte): the button flows out of its press swell, grows with jelly overshoot and a
    little wobble, and on close narrows into a capsule and lands on the button with a bounce. Used by the dialogs (IosDialog.svelte).

    Place it inside an IosScreen: it moves itself to the unscaled viewport (like the settings sheet), so it is sized in real pixels and
    the GUI scale does not touch it. The button it grows out of is drawn at the stage scale (window size x GUI scale), so everything
    that stands in for the button (the face with the label) is laid out at the button's own size and scaled by that same factor,
    and the pixel constants of the animation (shadow, blur, perspective) shrink with a small window. Otherwise the label would be
    drawn at full size on a button that is much smaller in a small window.
-->
<script lang="ts">
    import type {Snippet} from "svelte";
    import {onMount, tick} from "svelte";
    import {aim, cl, lerp, sm, spring, type Spring} from "../title/main-menu/launcher";
    import {menuLink} from "../title/main-menu/bridge";
    import {bgv, crop, STY, wall} from "../title/main-menu/lockscreen.svelte";

    interface Props {
        /** The button the window grows out of. Asked for again whenever it is needed, so it may be bound later. */
        anchor: () => HTMLElement | undefined;
        /** What the button shows. Fades out while the window grows, fades back in while it shrinks. */
        label?: Snippet;
        /** The screen of the window. */
        children?: Snippet;
        /** Start fully open and shrink into the button right away. */
        restore?: boolean;
        /** Open as a centred window of this size (stage units) instead of a full screen. */
        size?: {width: number; height: number};
        /** Corner radius of the window, in stage units (only with `size`). */
        radius?: number;
        /** A tap on the dimmed screen around the window closes it (only with `size`). */
        dismissible?: boolean;
        /** "app": the dock-app launch (default). "morph": the jelly motion of the lock-screen + menu. */
        motion?: "app" | "morph";
        /** The window has finished growing. */
        onopened?: () => void;
        /** The window was told to close (by `close()` or because the screen under it closes). */
        onclosing?: () => void;
        /** A press turned the window around while it shrank: it grows again (undo what `onclosing` did). */
        onreopening?: () => void;
        /** The window is back in its button: remove it. */
        onclosed?: () => void;
    }

    let {
        anchor,
        label,
        children,
        restore = false,
        size,
        radius = 30,
        dismissible = true,
        motion = "app",
        onopened,
        onclosing,
        onreopening,
        onclosed
    }: Props = $props();

    const p = $derived(wall.p[wall.cur]);

    let root: HTMLDivElement;
    let win: HTMLDivElement;
    let plate: HTMLDivElement;
    let wallbox: HTMLDivElement;
    let content: HTMLDivElement;
    let face: HTMLDivElement;
    let faceFit: HTMLDivElement;
    let dim: HTMLDivElement;

    type Phase = "opening" | "open" | "closing";
    let phase: Phase = "opening";
    let ready = false;
    let destroyed = false;
    let anchorEl: HTMLElement | undefined;
    // The screen under the window is closing (Esc, Cancel): the window goes with it and cannot be turned around.
    let locked = false;
    // The click that follows a press that cancelled / turned the window around is not for the screen on it.
    let swallowUntil = 0;
    /** A press on the window cancels it only while it has grown less than this far. After that the screen on it has the press. */
    const CANCEL_BELOW = 0.8;

    // The layer and the button, in the layer's own pixels (so a parent that is scaled onto its app window changes nothing).
    let vw = 1366;
    let vh = 768;
    let bw = 45;
    let bh = 45;
    let bx = 0; // centre of the button
    let by = 0;
    // The button as it is laid out (before it is scaled onto the screen), and the scale it is drawn at: bw = fw * fk.
    let fw = 45;
    let fh = 45;
    let fk = 1;
    // 1 at the size the animation was tuned for (a 1366x768 stage or bigger), smaller in a small window: scales the pixel constants
    // of the animation (shadow, blur, perspective) so a small window does not get the same heavy halo as a full screen one.
    let q = 1;
    // The size the window comes to rest at, and the size its screen is laid out at (before it is scaled onto the window).
    // A full screen is laid out at the size of the layer, so both are the layer. A window is laid out at `size` and drawn
    // at `size * wk`, which is `size` at the scale of the stage, or less when the layer is too small for that.
    let tw = 1366;
    let th = 768;
    let cw = 1366;
    let ch = 768;
    let wk = 1;
    const windowed = $derived(!!size);

    // One spring per channel, like an app window (launcher.ts). `m` is the progress: 0 = the button, 1 = open.
    const c = {cx: spring(0.4, 4), cy: spring(0.4, 4), w: spring(0.4, 4), h: spring(0.4, 4), m: spring(0.002, 0.03)};
    const bg = spring(0.002, 0.03); // the dimming of the screen under the window
    const all: Spring[] = [bg, c.cx, c.cy, c.w, c.h, c.m];
    let raf = 0;
    let last = 0;
    let blurNow = "";
    // morph motion: the closing capsule has reached the button and now lands on it with a bounce
    let landed = false;
    // `restore`: the window stands in for a screen that was just closed, it only shrinks. There is nothing to cancel or to turn around.
    let restoring = false;

    /** Re-parents the node to the unscaled viewport of the IosStage (see IosSettings.svelte). */
    function portal(node: HTMLElement) {
        node.closest(".ios-viewport")?.appendChild(node);
        return {
            destroy() {
                node.remove();
            }
        };
    }

    /**
     * Reads the size of the layer and the place of the button. Both are measured on screen and divided by the scale the layer is
     * drawn at, so the numbers are right even while the screen under this window is itself being scaled onto its own window.
     */
    function measure() {
        vw = root.offsetWidth || 1366;
        vh = root.offsetHeight || 768;
        q = cl(Math.min(vw / 1366, vh / 768), 0.3, 1);
        const rr = root.getBoundingClientRect();
        const k = rr.width / vw || 1;
        const el = anchorEl ?? anchor();
        if (el) {
            const r = el.getBoundingClientRect();
            // The size is the layout size times the scale of the stage the button sits on, not its bounding box: a button that is
            // being pressed (or springing back from it, which is exactly when a click opens a window) is squished by a transform.
            // Its centre does not move with that, so the bounding box is still right for the place.
            const lw = el.offsetWidth || r.width / k;
            const lh = el.offsetHeight || r.height / k;
            const stage = el.closest<HTMLElement>(".ios-stage");
            const s = stage && stage.offsetWidth
                ? stage.getBoundingClientRect().width / stage.offsetWidth / k
                : r.width / Math.max(1, lw) / k;
            fw = lw;
            fh = lh;
            fk = s;
            bw = lw * s;
            bh = lh * s;
            if (motion === "morph") {
                // the drawn rect: a click opens the window while the button is still swollen by its press, and the window flows out of that
                bw = r.width / k;
                bh = r.height / k;
            }
            bx = (r.left - rr.left + r.width / 2) / k;
            by = (r.top - rr.top + r.height / 2) / k;
        } else {
            fw = fh = bw = bh = 45;
            fk = 1;
            bx = vw / 2;
            by = vh - 45;
        }

        if (size) {
            // `size` is in stage units, so the window follows the GUI scale like the buttons do. It never gets bigger than the layer.
            wk = Math.min(fk, (vw * 0.94) / size.width, (vh * 0.92) / size.height);
            cw = size.width;
            ch = size.height;
            tw = size.width * wk;
            th = size.height * wk;
            // the screen is laid out at `size`; the wallpaper plate is the layer's size (like in a full screen window), so the
            // window has the very same colours as the account manager
            content.style.width = cw + "px";
            content.style.height = ch + "px";
            wallbox.style.width = vw + "px";
            wallbox.style.height = vh + "px";
        } else {
            cw = tw = vw;
            ch = th = vh;
            for (const el of [content, wallbox]) {
                el.style.width = vw + "px";
                el.style.height = vh + "px";
            }
        }

        // the face is laid out like the button and scaled like it
        faceFit.style.width = fw + "px";
        faceFit.style.height = fh + "px";
        faceFit.style.scale = String(fk);
    }

    /** Aims a channel with explicit stiffness and damping (an underdamped spring overshoots and wobbles). */
    function jelly(s: Spring, t: number, k: number, damping: number) {
        s.t = t;
        s.k = k;
        s.c = damping;
    }

    function aimOpen() {
        if (motion === "morph") {
            // MorphingMenu's open(), a bit softer and slower: underdamped w / h (jelly overshoot, out of phase), a little wobble in the position
            jelly(c.w, tw, 150, 17.5);
            jelly(c.h, th, 170, 18.5);
            jelly(c.cx, vw / 2, 170, 19);
            jelly(c.cy, vh / 2, 160, 18);
            aim(c.m, 1, 330, 1);
            aim(bg, 1, 150, 1);
            return;
        }
        aim(c.cx, vw / 2, 210, 1);
        aim(c.cy, vh / 2, 210, 1);
        aim(c.w, tw, 300, 1);
        aim(c.h, th, 185, 1);
        aim(c.m, 1, 330, 1);
        aim(bg, 1, 150, 1);
    }

    function aimClosed() {
        if (motion === "morph") {
            // The close travels with the very same springs as aimOpen() (same stiffness and damping per channel), so it takes as long
            // as the opening: ~0.23 s to reach the button (the opening takes ~0.25 s to reach its size). frame() then hands over to
            // the landing bounce. It aims at 94% of the button so the capsule narrows a little before it lands.
            landed = false;
            jelly(c.cx, bx, 170, 19);
            jelly(c.cy, by, 160, 18);
            jelly(c.w, bw * 0.94, 150, 17.5);
            jelly(c.h, bh * 0.94, 170, 18.5);
            aim(c.m, 0, 330, 1);
            aim(bg, 0, 190, 1);
            return;
        }
        const K = 240;
        aim(c.cx, bx, K, 1);
        aim(c.cy, by, K, 1);
        aim(c.w, bw, K, 1);
        aim(c.h, bh, K, 1);
        aim(c.m, 0, K, 1);
        aim(bg, 0, 190, 1);
    }

    /** Every channel jumps to where it is aimed. */
    function snap() {
        for (const s of all) {
            s.x = s.t;
            s.v = 0;
        }
    }

    function carry(on: boolean) {
        root.toggleAttribute("data-fx-carry", on);
    }

    function render() {
        const w = c.w.x;
        const h = c.h.x;
        const m = cl(c.m.x, 0, 1);
        const S = win.style;
        S.width = w + "px";
        S.height = h + "px";
        S.translate = `${c.cx.x - w / 2}px ${c.cy.x - h / 2}px`;
        S.borderRadius = lerp(0.29 * Math.min(w, h), windowed ? radius * wk : 0, m) + "px";
        // No shadow at all while it still is the button (the real button has none, so it would pop in when the button comes back).
        S.boxShadow = `0 ${lerp(1, 16, m) * q}px ${lerp(3, 56, m) * q}px rgba(0,0,0,${0.42 * sm(0, 0.6, m)}),inset 0 0 0 1px rgba(255,255,255,.07)`;

        // in-flight blur peaks mid-flight and is gone by the time the window has settled (only the plate: the screen stays sharp)
        const bl = motion === "morph" ? 0 : 14 * q * 4 * m * (1 - m) * (1 - sm(0.7, 0.95, m));
        const blur = bl > 0.4 ? `blur(${bl.toFixed(1)}px)` : "";
        if (blur !== blurNow) {
            blurNow = blur;
            plate.style.filter = blur;
        }

        const fs = cl((w - bw) / Math.max(1, tw - bw), 0, 1);
        S.transform = motion === "morph" ? "" : `perspective(${1500 * q}px) rotateX(${-40 * fs * (1 - fs)}deg)`;

        // the screen is drawn full size and scaled onto the window
        const sx = w / cw;
        const sy = h / ch;
        // morph: the screen also rises into place while it fades in, like the rows of the + menu
        const rise = motion === "morph" ? (1 - sm(0.05, 0.6, m)) * 12 * wk : 0;
        content.style.transform =
            sx === 1 && sy === 1 && rise === 0 ? "" : `${rise ? `translateY(${rise.toFixed(2)}px) ` : ""}scale(${sx},${sy})`;
        content.style.opacity = String(sm(0.05, 0.45, m));
        wallbox.style.transform = `scale(${w / vw},${h / vh})`;
        wallbox.style.opacity = String(sm(0.1, 0.6, m));
        face.style.opacity = String(1 - sm(0, 0.4, m));
        dim.style.opacity = String(0.26 * cl(bg.x, 0, 1));
    }

    /** A tap on the dimmed screen around a window (not on the window itself) closes it. */
    function onShieldDown(e: PointerEvent) {
        if (windowed && dismissible && e.target === root) {
            close();
        }
    }

    function kick() {
        if (!raf && !destroyed) {
            last = performance.now();
            raf = requestAnimationFrame(frame);
        }
    }

    function frame(now: number) {
        raf = 0;
        if (destroyed) {
            return;
        }

        const dt = cl((now - last) / 1000, 0.001, 0.05);
        last = now;
        const n = Math.ceil(dt / 0.004);
        const hh = dt / n;

        let settled = true;
        for (const s of all) {
            for (let i = 0; i < n; i++) {
                s.v += (s.k * (s.t - s.x) - s.c * s.v) * hh;
                s.x += s.v * hh;
            }
            if (Math.abs(s.t - s.x) > s.e || Math.abs(s.v) > s.ve) {
                settled = false;
            }
        }

        if (motion === "morph" && phase === "closing" && !landed && c.w.x < bw * 1.15 && c.h.x < bh * 1.15) {
            // reached the button: land with a soft underdamped bounce (w and h out of phase), velocity kept
            landed = true;
            // underdamped (damping ratio ~0.3): squashes, then rebounds ~2% past the button; whole close ~0.7 s vs ~0.78 s to open
            jelly(c.w, bw, 200, 13);
            jelly(c.h, bh, 215, 14);
            jelly(c.cx, bx, 210, 24);
            jelly(c.cy, by, 210, 24);
            settled = false;
        } else if (motion === "morph" && phase === "closing" && landed) {
            // the landing bounce rings for a long time at tiny amplitudes: hand the button back as soon as the ring is under ~1.5px
            settled = all.every((s) => Math.abs(s.t - s.x) <= s.e * 4 && Math.abs(s.v) <= s.ve * 15);
        }

        if (!settled) {
            render();
            raf = requestAnimationFrame(frame);
            return;
        }

        snap();
        render();
        carry(false);
        if (phase === "closing") {
            onclosed?.();
        } else if (phase === "opening") {
            phase = "open";
            onopened?.();
        }
    }

    /**
     * Shrink the window back into its button. Safe to call at any time and any number of times: while it is still growing it turns
     * around from where it is.
     */
    export function close(forced = false) {
        if (destroyed || !ready) {
            return;
        }

        if (forced) {
            locked = true;
        }

        if (phase === "closing") {
            win.style.pointerEvents = locked ? "none" : "auto";
            return;
        }

        phase = "closing";
        root.style.pointerEvents = "none"; // the button is back under it, and the screen is no longer shielded
        // ... but a press on the shrinking window itself turns it around (onWinDown); a window that is carried off with its screen cannot
        win.style.pointerEvents = locked ? "none" : "auto";
        carry(true);
        measure(); // the button may have moved since the window opened
        aimClosed();
        kick();
        onclosing?.();
    }

    /** How far the window has grown on its way from the button to its size: 0 = the button, 1 = at its size. */
    function grown() {
        const kw = (c.w.x - bw) / Math.max(1, tw - bw);
        const kh = (c.h.x - bh) / Math.max(1, th - bh);
        return cl(Math.min(kw, kh), 0, 1);
    }

    /** Grow again from where the shrinking window is (a press on it, see onWinDown). */
    function reopen() {
        if (destroyed || !ready || phase !== "closing" || locked) {
            return;
        }

        phase = "opening";
        landed = false;
        root.style.pointerEvents = "";
        win.style.pointerEvents = "";
        carry(true);
        measure();
        aimOpen();
        kick();
        onreopening?.();
    }

    /** Is the press on the spot of the button (its own size, where it is drawn when it is not pressed)? */
    function onButton(e: PointerEvent): boolean {
        const rr = root.getBoundingClientRect();
        const k = rr.width / vw || 1;
        const x = (e.clientX - rr.left) / k;
        const y = (e.clientY - rr.top) / k;
        return Math.abs(x - bx) <= (fw * fk) / 2 && Math.abs(y - by) <= (fh * fk) / 2;
    }

    /**
     * A press on the window while it moves: while it has only just started to grow it is cancelled (it shrinks into the button), while
     * it shrinks it grows again, but only when the press is on the button's own spot. Anywhere else on the window it is ignored: the
     * screen on a window that is not grown yet (or is going away) must not get it. Captured either way, so the screen on the window
     * does not get the press (its click is swallowed in onWinClick).
     */
    function onWinDown(e: PointerEvent) {
        if (e.pointerType === "mouse" && e.button !== 0) {
            return;
        }

        const closing = phase === "closing";
        const young = phase === "opening" && !restoring && grown() < CANCEL_BELOW;
        if ((closing && locked) || (!closing && !young)) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        swallowUntil = performance.now() + 500;

        if (!onButton(e)) {
            return;
        }

        if (closing) {
            reopen();
        } else {
            close();
        }
    }

    function onWinClick(e: MouseEvent) {
        if (phase === "closing" || performance.now() < swallowUntil) {
            e.preventDefault();
            e.stopPropagation();
        }
    }

    function refit() {
        measure();
        if (phase === "closing") {
            aimClosed();
            kick();
            return;
        }

        aimOpen();
        if (phase === "open" && !raf) {
            snap();
            render();
        } else {
            kick();
        }
    }

    function start() {
        anchorEl = anchor();
        if (anchorEl) {
            anchorEl.style.visibility = "hidden"; // its window is its stand-in while it is alive
        }

        measure();
        win.style.display = "block";
        ready = true;
        carry(true);

        if (restore) {
            // the client's screen that stood in for this window was just closed: start open, then shrink into the button
            phase = "open";
            restoring = true;
            locked = true;
            aimOpen();
            snap();
            render();
            requestAnimationFrame(() => requestAnimationFrame(() => close()));
            return;
        }

        // the launch speeds are tuned for a 1366x768 stage: a window has less way to go, so it is launched in proportion
        const u = Math.min(tw / 1366, th / 768);
        const morph = motion === "morph";
        Object.assign(c.cx, {x: bx, v: 0});
        Object.assign(c.cy, {x: by, v: morph ? 0 : -500 * u});
        Object.assign(c.w, {x: bw, v: morph ? 0 : 2200 * u});
        Object.assign(c.h, {x: bh, v: morph ? 0 : 1900 * u});
        Object.assign(c.m, {x: 0, v: 0});
        Object.assign(bg, {x: 0, v: 0});
        render();
        aimOpen();
        kick();
    }

    onMount(() => {
        let off: (() => void) | undefined;

        // the button may be bound a moment after this window was mounted next to it
        (async () => {
            if (!anchor()) {
                await tick();
            }
            if (destroyed) {
                return;
            }
            start();
            // the screen under this window is closing: shrink into the button on the way out
            off = menuLink.onClosing(() => close(true));
        })();

        const ro = new ResizeObserver(() => {
            if (ready && !destroyed) {
                refit();
            }
        });
        ro.observe(root);

        return () => {
            destroyed = true;
            cancelAnimationFrame(raf);
            raf = 0;
            ro.disconnect();
            off?.();
            if (anchorEl) {
                anchorEl.style.visibility = "";
            }
        };
    });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="ew" bind:this={root} use:portal style:--vf={STY[p.v][1]} onpointerdown={onShieldDown}>
    <div class="dim" bind:this={dim}></div>
    <div class="win" class:windowed bind:this={win} onpointerdowncapture={onWinDown} onclickcapture={onWinClick}>
        <div class="plate" bind:this={plate}>
            <div class="wallbox" bind:this={wallbox}>
                <div class="wall" style:background={bgv(p)} style:transform={crop(p) || undefined}></div>
            </div>
        </div>
        <div class="content" bind:this={content}>
            {@render children?.()}
        </div>
        <div class="face" bind:this={face}>
            <div class="face-fit" bind:this={faceFit}>
                {@render label?.()}
            </div>
        </div>
    </div>
</div>

<style>
    /* Shields the screen under the window while it is open (a tap on it would act on a screen that is being covered). */
    .ew {
        position: absolute;
        inset: 0;
        z-index: 5;
        pointer-events: auto;
    }

    .dim {
        position: absolute;
        inset: 0;
        background: #000000;
        opacity: 0;
        pointer-events: none;
    }

    /* size, place, radius and shadow are driven per frame */
    .win {
        position: absolute;
        left: 0;
        top: 0;
        display: none;
        overflow: hidden;
        will-change: transform;
        contain: layout style;
        background: transparent;
    }

    .plate {
        position: absolute;
        inset: 0;
    }

    .wallbox,
    .content {
        position: absolute;
        left: 0;
        top: 0;
        transform-origin: 0 0;
    }

    /* the same blurred wallpaper as the plate of the app windows (MainMenu.svelte, .rw) */
    .wall {
        position: absolute;
        inset: -60px;
        filter: var(--vf, brightness(1)) blur(var(--wbl, 30px)) brightness(0.74);
    }

    /* the button, as it looks while it is a button */
    .face {
        position: absolute;
        inset: 0;
        overflow: hidden;
        border-radius: inherit;
        background: linear-gradient(var(--ios-tint), var(--ios-tint)), var(--ios-control);
        box-shadow: inset 0 0 0 1px var(--ios-hairline);
        pointer-events: none; /* it fades out but sits over the screen: it must not eat clicks */
    }

    /*
     * The label, laid out exactly like inside the button (IosButton.svelte): the button's own size, padding and font, so it breaks
     * and truncates the same way. Width, height and scale are set from the button every time it is measured: the button is
     * drawn at the stage scale, this layer is not. It stays that size while the window grows and is centred in it.
     */
    .face-fit {
        position: absolute;
        left: 50%;
        top: 50%;
        translate: -50% -50%;
        transform-origin: 50% 50%;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 12px;
        font-family: inherit;
        font-size: 14px;
        font-weight: 600;
        line-height: 1;
        white-space: nowrap;
        color: var(--ios-text, #ffffff);
    }
</style>
