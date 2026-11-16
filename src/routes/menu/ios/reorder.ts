/**
 * Hold-and-drag reordering for a list of equally tall rows (iOS style).
 *
 * The caller starts a drag with `begin(index, pointerEvent)` once the user has held a row. From then on the row
 * is lifted and follows the pointer, the other rows slide out of the way, the list auto-scrolls near its top and
 * bottom edge, and releasing settles the row into its slot and calls `onDrop(from, to)`. Escape cancels.
 *
 * Only inline styles are written (transform / transition / shadow), never framework state. `onDrop` must resolve
 * once the DOM shows the new order, because the inline styles are removed right after it resolves.
 */
import type {SmoothScroll} from "./scrollPhysics";

export interface ReorderOptions {
    scroller: SmoothScroll;
    /** The reorderable rows in their current order (other rows in the list, e.g. LAN servers, are left out). */
    rows: () => HTMLElement[];
    onDrop: (from: number, to: number) => Promise<void> | void;
}

const EDGE_ZONE = 72;
const MAX_AUTOSCROLL = 1100;
const LIFT_SCALE = 1.035;
/** Solid fill of the lifted row (the normal row fill is translucent). */
const LIFTED_BACKGROUND = "#4c4c52";
const SLIDE = "transform 0.28s cubic-bezier(0.2, 0.8, 0.3, 1)";
const LIFT = "transform 0.2s cubic-bezier(0.2, 0.8, 0.3, 1), box-shadow 0.2s ease-out, filter 0.2s ease-out, background-color 0.2s ease-out";
const SETTLE = "transform 0.42s cubic-bezier(0.34, 1.45, 0.5, 1), box-shadow 0.35s ease-out, filter 0.35s ease-out, background-color 0.4s ease-out";

type Phase = "idle" | "drag" | "settle";

export class ReorderDrag {
    private phase: Phase = "idle";
    private rows: HTMLElement[] = [];
    private from = 0;
    private to = 0;
    private pitch = 0;
    private startY = 0;
    private lastY = 0;
    private startScroll = 0;
    private raf = 0;
    private lastFrame = 0;
    private settleTimer = 0;
    private restBackground = "";

    constructor(private readonly o: ReorderOptions) {
    }

    get active(): boolean {
        return this.phase === "drag";
    }

    begin(index: number, e: PointerEvent): void {
        if (this.phase !== "idle") {
            return;
        }

        const rows = this.o.rows();
        if (rows.length < 2 || !rows[index]) {
            return;
        }

        this.rows = rows;
        this.from = index;
        this.to = index;
        this.pitch = rows[1].offsetTop - rows[0].offsetTop;
        if (this.pitch <= 0) {
            this.pitch = rows[0].offsetHeight;
        }
        this.startY = e.clientY;
        this.lastY = e.clientY;
        this.startScroll = this.o.scroller.position;
        this.phase = "drag";
        this.o.scroller.lock(true);

        for (let i = 0; i < rows.length; i++) {
            const style = rows[i].style;
            if (i === index) {
                style.position = "relative";
                style.zIndex = "4";
                style.transition = LIFT;
                style.boxShadow = "0 18px 40px rgba(0, 0, 0, 0.45), inset 0 0 0 2px var(--ios-accent)";
                style.filter = "brightness(1.12)";
                style.cursor = "grabbing";
                // Opaque, so the rows sliding underneath don't show through the lifted one (double text).
                // Next frame: by then the caller has marked the row as selected, so its resting fill is the final one.
                requestAnimationFrame(() => {
                    if (this.phase === "drag" && this.rows[index] === rows[index]) {
                        this.restBackground = getComputedStyle(rows[index]).backgroundColor;
                        rows[index].style.backgroundColor = LIFTED_BACKGROUND;
                    }
                });
            } else {
                style.transition = SLIDE;
            }
        }

        window.addEventListener("pointermove", this.onMove);
        window.addEventListener("pointerup", this.onUp);
        window.addEventListener("pointercancel", this.onCancel);
        window.addEventListener("keydown", this.onKey, true);
        window.addEventListener("blur", this.onCancel);

        this.lastFrame = performance.now();
        this.raf = requestAnimationFrame(this.frame);
        this.update();
    }

    /** Drops the row back where it was. */
    cancel(): void {
        if (this.phase === "drag") {
            this.release(false);
        }
    }

    destroy(): void {
        this.stopListening();
        cancelAnimationFrame(this.raf);
        clearTimeout(this.settleTimer);
        if (this.phase !== "idle") {
            this.clearStyles();
            this.o.scroller.lock(false);
            this.phase = "idle";
        }
    }

    // -----------------------------------------------------------------------------------------------------------------

    /** How far the dragged row is from its home slot, in layout px (pointer travel + the list scrolling under it). */
    private offset(): number {
        const {scroller} = this.o;
        const travel = (this.lastY - this.startY) / scroller.screenScale;
        const dy = travel + (scroller.position - this.startScroll);
        const min = -this.from * this.pitch - this.pitch * 0.3;
        const max = (this.rows.length - 1 - this.from) * this.pitch + this.pitch * 0.3;
        return Math.min(max, Math.max(min, dy));
    }

    private update(): void {
        const dy = this.offset();
        const target = Math.min(this.rows.length - 1, Math.max(0, Math.round(this.from + dy / this.pitch)));
        this.to = target;

        this.rows[this.from].style.transform = `translate3d(0, ${dy.toFixed(2)}px, 0) scale(${LIFT_SCALE})`;

        for (let i = 0; i < this.rows.length; i++) {
            if (i === this.from) {
                continue;
            }
            let shift = 0;
            if (this.from < target && i > this.from && i <= target) {
                shift = -this.pitch;
            } else if (this.from > target && i < this.from && i >= target) {
                shift = this.pitch;
            }
            this.rows[i].style.transform = shift === 0 ? "" : `translate3d(0, ${shift}px, 0)`;
        }
    }

    private readonly frame = (now: number): void => {
        if (this.phase !== "drag") {
            return;
        }

        const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
        this.lastFrame = now;

        // Auto-scroll while the pointer is near the top / bottom edge of the list.
        const rect = this.o.scroller.viewportElement.getBoundingClientRect();
        const zone = EDGE_ZONE * this.o.scroller.screenScale;
        let speed = 0;
        if (this.lastY < rect.top + zone) {
            speed = -Math.min(1, (rect.top + zone - this.lastY) / zone);
        } else if (this.lastY > rect.bottom - zone) {
            speed = Math.min(1, (this.lastY - (rect.bottom - zone)) / zone);
        }
        if (speed !== 0) {
            this.o.scroller.nudge(Math.sign(speed) * Math.pow(Math.abs(speed), 1.5) * MAX_AUTOSCROLL * dt);
            this.update();
        }

        this.raf = requestAnimationFrame(this.frame);
    };

    private readonly onMove = (e: PointerEvent): void => {
        this.lastY = e.clientY;
        this.update();
    };

    private readonly onUp = (): void => this.release(true);
    private readonly onCancel = (): void => this.release(false);

    private readonly onKey = (e: KeyboardEvent): void => {
        if (e.key === "Escape") {
            e.stopPropagation();
            this.release(false);
        }
    };

    private stopListening(): void {
        window.removeEventListener("pointermove", this.onMove);
        window.removeEventListener("pointerup", this.onUp);
        window.removeEventListener("pointercancel", this.onCancel);
        window.removeEventListener("keydown", this.onKey, true);
        window.removeEventListener("blur", this.onCancel);
    }

    private release(commit: boolean): void {
        if (this.phase !== "drag") {
            return;
        }

        this.phase = "settle";
        this.stopListening();
        cancelAnimationFrame(this.raf);
        this.o.scroller.lock(false);

        const from = this.from;
        const to = commit ? this.to : this.from;
        this.to = to;

        // Everything glides into its final slot with a little overshoot, then the real order is applied.
        for (let i = 0; i < this.rows.length; i++) {
            const style = this.rows[i].style;
            if (i === from) {
                style.transition = SETTLE;
                style.transform = `translate3d(0, ${(to - from) * this.pitch}px, 0)`;
                style.boxShadow = "";
                style.filter = "";
                style.backgroundColor = this.restBackground; // fades from solid back to the translucent row fill
            } else {
                style.transition = SLIDE;
                let shift = 0;
                if (from < to && i > from && i <= to) {
                    shift = -this.pitch;
                } else if (from > to && i < from && i >= to) {
                    shift = this.pitch;
                }
                style.transform = shift === 0 ? "" : `translate3d(0, ${shift}px, 0)`;
            }
        }

        this.settleTimer = window.setTimeout(() => void this.finish(), 440);
    }

    private async finish(): Promise<void> {
        const {from, to} = this;
        const rows = this.rows;
        const parent = rows[0]?.parentElement;

        // The real order is applied by the caller. Rows keep their DOM nodes, so the moment the nodes move, their
        // inline offsets (which already show the final order) would be counted twice and every row would jump by one
        // slot. The observer runs right after the DOM change, before the browser paints, and removes the offsets
        // with transitions off so nothing animates from the stale offset.
        let observer: MutationObserver | undefined;
        if (to !== from && parent) {
            observer = new MutationObserver(() => this.clearStyles());
            observer.observe(parent, {childList: true});
        }

        try {
            if (to !== from) {
                await this.o.onDrop(from, to);
            }
        } finally {
            observer?.disconnect();
            this.clearStyles();
            this.phase = "idle";
        }
    }

    private clearStyles(): void {
        const rows = this.rows;
        if (rows.length === 0) {
            return;
        }

        // Transitions off while the offsets go away, so the browser snaps instead of animating (the rows' own CSS
        // has a springy transform transition that would otherwise play from the old offset).
        for (const row of rows) {
            const style = row.style;
            style.transition = "none";
            style.transform = "";
            style.zIndex = "";
            style.position = "";
            style.boxShadow = "";
            style.filter = "";
            style.backgroundColor = "";
            style.cursor = "";
        }
        void rows[0].offsetHeight; // flush: the snap is committed with transitions off
        for (const row of rows) {
            row.style.transition = "";
        }
        this.rows = [];
    }
}
