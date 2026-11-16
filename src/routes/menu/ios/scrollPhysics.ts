/**
 * Inertial scrolling with iOS-style rubber banding.
 *
 * Native scrolling is switched off on the viewport and this class owns the scroll position instead, so that:
 *  - a fling keeps its momentum when it reaches the top/bottom and carries into the overscroll,
 *  - the edge then spring-pulls the content back (no hard stop),
 *  - wheel / trackpad / touch / scroll bar all feed the same physics.
 *
 * All motion is written straight to the DOM (transform / opacity / height), never through Svelte state,
 * so a scroll never triggers a re-render.
 *
 * DOM contract (see IosScrollList.svelte):
 *   viewport  - fixed-height clip box, `overflow: hidden`, `touch-action: none`
 *   content   - single child of the viewport, `position: relative; display: flow-root`
 *   track     - scroll bar hit area (gets the classes `visible`, `hover`, `dragging`)
 *   thumb     - child of the track, positioned with `top: 0`
 */

export interface SmoothScrollOptions {
    viewport: HTMLElement;
    content: HTMLElement;
    track: HTMLElement;
    thumb: HTMLElement;
    /** Elements whose opacity follows the distance from the top edge (0 at the top, 1 after `fadeDistance`). */
    fadeTop?: ArrayLike<HTMLElement>;
    /** Elements whose opacity follows the distance from the bottom edge. */
    fadeBottom?: ArrayLike<HTMLElement>;
    /** Scroll distance in px over which the edge fades reach full strength. */
    fadeDistance?: number;
    /** Glide friction in 1/s. Higher = stops sooner. A wheel delta of `d` px glides exactly `d` px. */
    friction?: number;
    /** Edge spring stiffness. */
    stiffness?: number;
    /** Edge spring damping. ~2 * sqrt(stiffness) is critically damped (no wobble). */
    damping?: number;
}

const MAX_OVERSCROLL = 150;
const MIN_THUMB = 36;
const MAX_SPEED = 7000;
const FADE_DEAD_ZONE = 4;
/** How long the edge fades take to come in the first time they are needed (see `startFadeGate`). */
const FADE_IN_MS = 320;

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/** Distance past the nearest end (negative above the top, positive below the bottom, 0 inside). */
const overscrollOf = (pos: number, max: number): number => (pos < 0 ? pos : pos > max ? pos - max : 0);

export class SmoothScroll {
    private pos = 0;
    private vel = 0;
    private raf = 0;
    private lastFrame = 0;

    private touching = false;
    private barDragging = false;
    private barHover = false;
    private suppressClick = false;
    private locked = false;

    private paddingTop = 0;
    private paddingBottom = 0;
    private nominalThumb = MIN_THUMB;
    private lastFadeTop = -1;
    private lastFadeBottom = -1;
    /** 0 -> 1 once, the first time an edge fade is needed. Scales the fades so they ease in instead of popping in. */
    private fadeGate = 0;
    private gateRaf = 0;

    private hideTimer = 0;
    private suppressTimer = 0;

    private resizeObserver?: ResizeObserver;
    private readonly cleanups: Array<() => void> = [];

    private readonly friction: number;
    private readonly stiffness: number;
    private readonly damping: number;
    private readonly fadeDistance: number;

    constructor(private readonly o: SmoothScrollOptions) {
        this.friction = o.friction ?? 7;
        this.stiffness = o.stiffness ?? 140;
        this.damping = o.damping ?? 24;
        this.fadeDistance = o.fadeDistance ?? 22;
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------------------------------------------------------

    attach(): void {
        const {viewport, content, track} = this.o;
        this.measure();

        this.listen(viewport, "wheel", this.onWheel, {passive: false});
        this.listen(track, "wheel", this.onWheel, {passive: false});
        this.listen(viewport, "touchstart", this.onTouchStart, {passive: true});
        this.listen(viewport, "touchmove", this.onTouchMove, {passive: false});
        this.listen(viewport, "touchend", this.onTouchEnd);
        this.listen(viewport, "touchcancel", this.onTouchEnd);
        this.listen(viewport, "scroll", this.onNativeScroll);
        this.listen(viewport, "click", this.onClickCapture, {capture: true});
        this.listen(track, "pointerdown", this.onBarDown);
        this.listen(track, "pointermove", this.onBarMove);
        this.listen(track, "pointerup", this.onBarUp);
        this.listen(track, "pointercancel", this.onBarUp);
        this.listen(track, "pointerenter", this.onBarEnter);
        this.listen(track, "pointerleave", this.onBarLeave);

        if (typeof ResizeObserver !== "undefined") {
            this.resizeObserver = new ResizeObserver(() => this.refresh());
            this.resizeObserver.observe(viewport);
            this.resizeObserver.observe(content);
        }

        this.paint();
        this.showBar();
    }

    destroy(): void {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
        cancelAnimationFrame(this.gateRaf);
        this.gateRaf = 0;
        clearTimeout(this.hideTimer);
        clearTimeout(this.suppressTimer);
        this.resizeObserver?.disconnect();
        for (const cleanup of this.cleanups.splice(0)) {
            cleanup();
        }
    }

    /** Re-measure after the content or viewport changed size. Called automatically by a ResizeObserver. */
    refresh(): void {
        this.measure();
        const max = this.maxScroll();
        if (this.raf === 0 && !this.touching && !this.barDragging) {
            this.pos = clamp(this.pos, 0, max);
        }
        this.paint();
    }

    /** Smoothly glides so that `el` (a descendant of the content element) is fully visible. */
    scrollIntoView(el: HTMLElement, margin = 8): void {
        const max = this.maxScroll();
        if (max <= 0) {
            return;
        }

        let top = 0;
        let node: HTMLElement | null = el;
        while (node && node !== this.o.content) {
            top += node.offsetTop;
            node = node.offsetParent as HTMLElement | null;
        }

        const bottom = top + el.offsetHeight;
        const viewHeight = this.o.viewport.clientHeight;
        const p = this.paddingTop;

        let target = this.pos;
        if (p + top - this.pos < margin) {
            target = p + top - margin;
        } else if (p + bottom - this.pos > viewHeight - margin) {
            target = p + bottom - viewHeight + margin;
        }

        target = clamp(target, 0, max);
        if (Math.abs(target - this.pos) < 0.5) {
            return;
        }

        // A glide of v / friction px: this lands exactly on `target`.
        this.vel = (target - this.pos) * this.friction;
        this.kick();
    }

    /** The scrolling clip box. */
    get viewportElement(): HTMLElement {
        return this.o.viewport;
    }

    /** Current scroll position in layout px (0 = top). */
    get position(): number {
        return this.pos;
    }

    /** On-screen px per layout px (the stage is scaled with a CSS transform). */
    get screenScale(): number {
        return this.scale;
    }

    /** While locked, wheel and touch no longer scroll (used while a row is being dragged). */
    lock(on: boolean): void {
        this.locked = on;
        if (on) {
            this.vel = 0;
        }
    }

    /** Moves the content by `delta` layout px, clamped to the ends, without any animation. */
    nudge(delta: number): void {
        this.pos = clamp(this.pos + delta, 0, this.maxScroll());
        this.paint();
        this.showBar();
    }

    scrollToTop(): void {
        this.vel = 0;
        this.pos = 0;
        this.paint();
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Geometry
    // ---------------------------------------------------------------------------------------------------------------

    private measure(): void {
        const style = getComputedStyle(this.o.viewport);
        this.paddingTop = parseFloat(style.paddingTop) || 0;
        this.paddingBottom = parseFloat(style.paddingBottom) || 0;
    }

    private maxScroll(): number {
        const {viewport, content} = this.o;
        return Math.max(0, content.offsetHeight + this.paddingTop + this.paddingBottom - viewport.clientHeight);
    }

    /** On-screen px per layout px (the stage is scaled with a CSS transform). */
    private get scale(): number {
        const {viewport} = this.o;
        const height = viewport.clientHeight;
        if (height <= 0) {
            return 1;
        }
        const ratio = viewport.getBoundingClientRect().height / height;
        return ratio > 0 ? ratio : 1;
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Physics loop
    // ---------------------------------------------------------------------------------------------------------------

    private kick(): void {
        if (this.raf !== 0) {
            return;
        }
        this.lastFrame = performance.now();
        this.raf = requestAnimationFrame(this.tick);
    }

    private stopLoop(): void {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
    }

    private readonly tick = (now: number): void => {
        this.raf = 0;

        let dt = (now - this.lastFrame) / 1000;
        this.lastFrame = now;
        if (!(dt > 0)) {
            dt = 1 / 60;
        }
        dt = Math.min(dt, 0.05);

        if (this.touching || this.barDragging) {
            return;
        }

        const max = this.maxScroll();
        let pos = this.pos;
        let vel = this.vel;

        if (max <= 0) {
            pos = 0;
            vel = 0;
        } else {
            const h = dt / 2;
            for (let i = 0; i < 2; i++) {
                const over = overscrollOf(pos, max);
                if (over !== 0) {
                    // Past an end: a spring (stiffening the further out) plus damping. Whatever speed we arrived
                    // with is what drives the overshoot, so a harder fling bounces further.
                    vel += (-this.stiffness * over * (1 + Math.abs(over) / 75) - this.damping * vel) * h;
                    pos += vel * h;
                } else {
                    // Free glide, integrated exactly: a wheel delta of d px travels d px, whatever the frame rate.
                    const decay = Math.exp(-this.friction * h);
                    pos += (vel * (1 - decay)) / this.friction;
                    vel *= decay;
                }
            }

            if (pos < -MAX_OVERSCROLL) {
                pos = -MAX_OVERSCROLL;
                vel = Math.max(vel, 0);
            } else if (pos > max + MAX_OVERSCROLL) {
                pos = max + MAX_OVERSCROLL;
                vel = Math.min(vel, 0);
            }
        }

        let settled = false;
        if (Math.abs(vel) < 6 && Math.abs(max <= 0 ? 0 : overscrollOf(pos, max)) < 0.25) {
            // Finish the last sub-pixel of the glide instead of stopping short of the target.
            pos = clamp(pos + vel / this.friction, 0, max);
            vel = 0;
            settled = true;
        }

        this.pos = pos;
        this.vel = vel;
        this.paint();
        this.showBar();

        if (!settled) {
            this.raf = requestAnimationFrame(this.tick);
        }
    };

    // ---------------------------------------------------------------------------------------------------------------
    // Rendering
    // ---------------------------------------------------------------------------------------------------------------

    private paint(): void {
        const {content, thumb, track, viewport} = this.o;
        const max = this.maxScroll();
        const pos = this.pos;

        content.style.transform = `translate3d(0, ${(-pos).toFixed(2)}px, 0)`;

        const trackHeight = track.offsetHeight;
        if (max <= 0 || trackHeight <= 0) {
            thumb.style.display = "none";
        } else {
            const viewHeight = viewport.clientHeight;
            const nominal = clamp((trackHeight * viewHeight) / (viewHeight + max), MIN_THUMB, trackHeight);
            // Like iOS, the thumb shrinks while the content is stretched past an end.
            const length = Math.max(12, nominal - Math.abs(overscrollOf(pos, max)) * 0.9);
            const y = pos <= 0 ? 0 : pos >= max ? trackHeight - length : (pos / max) * (trackHeight - nominal);

            this.nominalThumb = nominal;
            thumb.style.display = "block";
            thumb.style.height = `${length.toFixed(1)}px`;
            thumb.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
        }

        // A few px of dead zone at each end, so a list resting at (or a hair next to) an edge never shows its fade.
        const wantTop = max <= 0 ? 0 : clamp((pos - FADE_DEAD_ZONE) / this.fadeDistance, 0, 1);
        const wantBottom = max <= 0 ? 0 : clamp((max - pos - FADE_DEAD_ZONE) / this.fadeDistance, 0, 1);

        // The list usually fills up after the screen has opened (servers / worlds are loaded asynchronously), and
        // the bottom fade is then needed in one frame: a dark, blurred band that pops in. Ease the first
        // appearance in instead. After that the fades follow the scroll position directly.
        if (this.fadeGate < 1 && this.gateRaf === 0 && (wantTop > 0 || wantBottom > 0)) {
            this.startFadeGate();
        }
        const fadeTop = wantTop * this.fadeGate;
        const fadeBottom = wantBottom * this.fadeGate;

        if (fadeTop !== this.lastFadeTop) {
            this.lastFadeTop = fadeTop;
            this.setOpacity(this.o.fadeTop, fadeTop);
        }
        if (fadeBottom !== this.lastFadeBottom) {
            this.lastFadeBottom = fadeBottom;
            this.setOpacity(this.o.fadeBottom, fadeBottom);
        }
    }

    private startFadeGate(): void {
        const begin = performance.now();
        const step = (now: number): void => {
            const t = clamp((now - begin) / FADE_IN_MS, 0, 1);
            this.fadeGate = 1 - (1 - t) ** 3;
            this.gateRaf = t < 1 ? requestAnimationFrame(step) : 0;
            this.paint();
        };
        this.gateRaf = requestAnimationFrame(step);
    }

    private setOpacity(elements: ArrayLike<HTMLElement> | undefined, value: number): void {
        if (!elements) {
            return;
        }
        for (let i = 0; i < elements.length; i++) {
            elements[i].style.opacity = String(value);
        }
    }

    private showBar(): void {
        if (this.maxScroll() <= 0) {
            return;
        }

        const {track} = this.o;
        track.classList.add("visible");
        clearTimeout(this.hideTimer);

        if (!this.barHover && !this.barDragging) {
            this.hideTimer = window.setTimeout(() => {
                if (!this.barHover && !this.barDragging) {
                    track.classList.remove("visible");
                }
            }, 1000);
        }
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Wheel / trackpad: every delta is an impulse; a delta of d px glides exactly d px.
    // ---------------------------------------------------------------------------------------------------------------

    private readonly onWheel = (e: WheelEvent): void => {
        let dy = e.deltaY;
        if (e.deltaMode === 1) {
            dy *= 16;
        } else if (e.deltaMode === 2) {
            dy *= this.o.viewport.clientHeight;
        }
        if (!dy) {
            return;
        }

        const max = this.maxScroll();
        if (max <= 0) {
            return;
        }

        e.preventDefault();
        if (this.barDragging || this.touching || this.locked) {
            return;
        }

        let impulse = (dy / this.scale) * this.friction;
        const over = overscrollOf(this.pos, max);
        if (over * dy > 0) {
            // Pushing further past the end: progressively harder.
            impulse /= 1 + Math.abs(over) / 36;
        }

        this.vel = clamp(this.vel + impulse, -MAX_SPEED, MAX_SPEED);
        this.kick();
    };

    // ---------------------------------------------------------------------------------------------------------------
    // Touch: content follows the finger, rubber-bands past the ends, keeps its velocity on release.
    // ---------------------------------------------------------------------------------------------------------------

    private touchY = 0;
    private touchTime = 0;
    private touchSpeed = 0;
    private touchMoved = 0;

    private readonly onTouchStart = (e: TouchEvent): void => {
        if (e.touches.length !== 1) {
            return;
        }
        this.touching = true;
        this.stopLoop();
        this.touchY = e.touches[0].clientY;
        this.touchTime = performance.now();
        this.touchSpeed = 0;
        this.touchMoved = 0;
        this.vel = 0;
    };

    private readonly onTouchMove = (e: TouchEvent): void => {
        if (!this.touching) {
            return;
        }

        const y = e.touches[0].clientY;
        const delta = (this.touchY - y) / this.scale;
        this.touchY = y;

        if (this.locked) {
            if (e.cancelable) {
                e.preventDefault();
            }
            return;
        }

        const now = performance.now();
        const dt = Math.max(0.004, (now - this.touchTime) / 1000);
        this.touchTime = now;
        this.touchMoved += Math.abs(delta);
        this.touchSpeed = 0.65 * this.touchSpeed + 0.35 * (delta / dt);

        const max = this.maxScroll();
        if (max <= 0) {
            return;
        }
        if (e.cancelable) {
            e.preventDefault();
        }

        const over = overscrollOf(this.pos, max);
        const applied = over * delta > 0 ? (delta * 0.55) / (1 + Math.abs(over) / 48) : delta;
        this.pos += applied;
        this.paint();
        this.showBar();
    };

    private readonly onTouchEnd = (): void => {
        if (!this.touching) {
            return;
        }
        this.touching = false;

        if (this.touchMoved > 8) {
            // The browser may still dispatch a click after a drag: swallow it.
            this.suppressClick = true;
            clearTimeout(this.suppressTimer);
            this.suppressTimer = window.setTimeout(() => (this.suppressClick = false), 350);
        }

        const idle = performance.now() - this.touchTime;
        this.vel = idle > 90 ? 0 : clamp(this.touchSpeed * 1.4, -5000, 5000);
        this.kick();
    };

    private readonly onClickCapture = (e: MouseEvent): void => {
        if (this.suppressClick) {
            e.stopPropagation();
            e.preventDefault();
        }
    };

    /** Keyboard focus can still scroll the (overflow: hidden) box natively. Fold that into our own position. */
    private readonly onNativeScroll = (): void => {
        const {viewport} = this.o;
        const native = viewport.scrollTop;
        if (native) {
            viewport.scrollTop = 0;
            this.pos = clamp(this.pos + native, 0, this.maxScroll());
            this.vel = 0;
            this.paint();
            this.showBar();
        }
        if (viewport.scrollLeft) {
            viewport.scrollLeft = 0;
        }
    };

    // ---------------------------------------------------------------------------------------------------------------
    // Scroll bar: fades in while scrolling, widens on hover, thumb is draggable, the track jumps to the clicked spot.
    // ---------------------------------------------------------------------------------------------------------------

    private barStartY = 0;
    private barStartPos = 0;
    private barScale = 1;

    private readonly onBarDown = (e: PointerEvent): void => {
        if (e.pointerType === "mouse" && e.button !== 0) {
            return;
        }

        const max = this.maxScroll();
        if (max <= 0) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        this.stopLoop();
        this.vel = 0;
        this.pos = clamp(this.pos, 0, max);

        const {track, thumb} = this.o;
        const rect = track.getBoundingClientRect();
        const trackHeight = track.offsetHeight;
        this.barScale = trackHeight > 0 && rect.height > 0 ? rect.height / trackHeight : 1;

        if (e.target !== thumb) {
            const y = (e.clientY - rect.top) / this.barScale;
            const fraction = clamp((y - this.nominalThumb / 2) / Math.max(1, trackHeight - this.nominalThumb), 0, 1);
            this.pos = fraction * max;
        }

        this.barStartY = e.clientY;
        this.barStartPos = this.pos;
        this.barDragging = true;
        track.classList.add("dragging");

        try {
            track.setPointerCapture(e.pointerId);
        } catch {
            // Pointer already gone: nothing to capture.
        }

        this.paint();
        this.showBar();
    };

    private readonly onBarMove = (e: PointerEvent): void => {
        if (!this.barDragging) {
            return;
        }

        const max = this.maxScroll();
        const range = Math.max(1, this.o.track.offsetHeight - this.nominalThumb);
        const dy = (e.clientY - this.barStartY) / this.barScale;
        this.pos = clamp(this.barStartPos + (dy * max) / range, 0, max);
        this.paint();
        this.showBar();
    };

    private readonly onBarUp = (): void => {
        if (!this.barDragging) {
            return;
        }
        this.barDragging = false;
        this.o.track.classList.remove("dragging");
        this.kick();
        this.showBar();
    };

    private readonly onBarEnter = (e: PointerEvent): void => {
        if (e.pointerType === "touch") {
            return;
        }
        this.barHover = true;
        this.o.track.classList.add("hover");
        this.showBar();
    };

    private readonly onBarLeave = (): void => {
        this.barHover = false;
        this.o.track.classList.remove("hover");
        this.showBar();
    };

    // ---------------------------------------------------------------------------------------------------------------

    private listen<K extends keyof HTMLElementEventMap>(
        target: HTMLElement,
        type: K,
        handler: (event: HTMLElementEventMap[K]) => void,
        options?: AddEventListenerOptions
    ): void {
        target.addEventListener(type, handler, options);
        this.cleanups.push(() => target.removeEventListener(type, handler, options));
    }
}
