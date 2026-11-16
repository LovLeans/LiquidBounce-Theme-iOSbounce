/**
 * Press physics for any element: the same springs and constants as PressButton (the lock-screen trash / Customize / + buttons).
 *
 *   touch-down  -> the element swells (+43% of its height, in px, on both axes) and brightens
 *   release     -> it squeezes to -10% of its height while the brightness fades, then springs back to its size
 *
 * It is a Svelte action: `<button use:pressPhysics={{strength: 1}}>`. It only animates the `scale` property and `filter` (the layout
 * never changes, so a button inside a grid does not push its neighbours around) and removes both again once at rest. `scale`
 * is used instead of `transform` so it composes with a `transform` the element already has (a slide-in, a rotation...), and the
 * transform-origin is centred while the press is active (some elements slide in from a corner).
 *
 * The element may contain one child marked `data-press-label`: it is counter-scaled so the text grows with the WIDTH ratio
 * (exactly what PressButton does with its icon) instead of being stretched, whatever the shape of the button.
 *
 * `strength` scales the swell and the squeeze (1 = the full trash / Customize feel). The default, DEFAULT_STRENGTH, is the one
 * shared feel for all buttons; pass a lower value for a gentler one (alts button 0.3).
 * `brighten` is how much brighter it gets at full press (0.22 = +22%).
 */
import {createLoop, retarget, spring} from "./spring.js";

export interface PressOptions {
    strength?: number;
    brighten?: number;
}

/** The shared press strength of every button (about half of the lock-screen trash / Customize buttons). */
export const DEFAULT_STRENGTH = 0.55;

const SWELL = 0.43; // x height, same as PressButton (H * 0.43)
const SQUEEZE = 0.1; // x height, same as PressButton (H * 0.1)

export function pressPhysics(node: HTMLElement, options: PressOptions = {}) {
    let strength = options.strength ?? DEFAULT_STRENGTH;
    let brighten = options.brighten ?? 0.22;

    // extra width / height in px (0 = the element's own size) and the brightness progress, with PressButton's constants
    const w = spring(0, 420, 26);
    const h = spring(0, 420, 26);
    const pr = spring(0, 520, 34);

    let W = 1;
    let H = 1;
    let label: HTMLElement | null = null;
    let pressed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dirty = false;

    const loop = createLoop([w, h, pr], {render});

    const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isDisabled = () => node.matches(":disabled") || node.getAttribute("aria-disabled") === "true";
    const atRest = () =>
        [w, h, pr].every((s) => Math.abs(s.p) < 0.005 && Math.abs(s.t) < 0.005 && Math.abs(s.v) < 0.01);

    function render() {
        if (!pressed && !timer && atRest()) {
            // settled: leave no transform / filter behind (no stacking context, crisp text)
            if (dirty) {
                node.style.scale = "";
                node.style.transformOrigin = "";
                node.style.filter = "";
                if (label) label.style.scale = "";
                dirty = false;
            }
            return;
        }
        dirty = true;
        const sx = (W + w.p) / W;
        const sy = (H + h.p) / H;
        node.style.transformOrigin = "50% 50%";
        node.style.scale = `${sx.toFixed(4)} ${sy.toFixed(4)}`;
        const b = 1 + brighten * Math.max(0, Math.min(1, pr.p));
        node.style.filter = b > 1.0005 ? `brightness(${b.toFixed(3)})` : "";
        // net text scale = sx on both axes
        if (label) label.style.scale = `1 ${(sx / sy).toFixed(4)}`;
    }

    function go(s: ReturnType<typeof spring>, t: number, k: number, c: number) {
        retarget(s, t, k, c);
        loop.kick();
    }

    function down() {
        if (pressed || isDisabled()) return;
        pressed = true;
        clearTimeout(timer);
        timer = undefined;
        W = Math.max(1, node.offsetWidth);
        H = Math.max(1, node.offsetHeight);
        label = node.querySelector<HTMLElement>(":scope > [data-press-label]");
        const swell = reduced() ? 0 : H * SWELL * strength;
        go(pr, 1, 248, 24.5);
        go(w, swell, 281, 24.5);
        go(h, swell, 281, 24.5);
    }

    function up() {
        if (!pressed) return;
        pressed = false;
        clearTimeout(timer);
        const squeeze = reduced() ? 0 : H * SQUEEZE * strength;
        go(pr, 0, 165, 25.5);
        go(w, -squeeze, 992, 54.5);
        go(h, -squeeze, 992, 54.5);
        timer = setTimeout(() => {
            timer = undefined;
            if (!pressed) {
                go(w, 0, 347, 13.6);
                go(h, 0, 347, 13.6);
            }
        }, 165);
    }

    const onPointerDown = (e: PointerEvent) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        down();
    };
    const onKeyDown = (e: KeyboardEvent) => {
        if ((e.key === "Enter" || e.key === " ") && !e.repeat) down();
    };
    const onKeyUp = (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") up();
    };

    node.addEventListener("pointerdown", onPointerDown);
    node.addEventListener("pointerup", up);
    node.addEventListener("pointerleave", up);
    node.addEventListener("pointercancel", up);
    node.addEventListener("keydown", onKeyDown);
    node.addEventListener("keyup", onKeyUp);
    node.addEventListener("blur", up);

    return {
        update(next: PressOptions = {}) {
            strength = next.strength ?? DEFAULT_STRENGTH;
            brighten = next.brighten ?? 0.22;
        },
        destroy() {
            node.removeEventListener("pointerdown", onPointerDown);
            node.removeEventListener("pointerup", up);
            node.removeEventListener("pointerleave", up);
            node.removeEventListener("pointercancel", up);
            node.removeEventListener("keydown", onKeyDown);
            node.removeEventListener("keyup", onKeyUp);
            node.removeEventListener("blur", up);
            loop.stop();
            clearTimeout(timer);
            node.style.scale = "";
            node.style.transformOrigin = "";
            node.style.filter = "";
            if (label) label.style.scale = "";
        }
    };
}
