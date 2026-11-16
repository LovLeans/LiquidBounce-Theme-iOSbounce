/**
 * The press physics of a keystroke key: the same springs and constants as the ClickGUI buttons (`menu/title/main-menu/pressPhysics.ts`,
 * PressButton), but driven by the state of the key instead of the pointer.
 *
 *   key down  -> the key swells (a few px on both axes) and the accent fills in, both on springs that overshoot a little
 *   key up    -> it squeezes below its size while the accent fades out, then springs back with a jiggle (the underdamped 347 / 13.6 spring)
 *
 * It is a Svelte action: `<div use:keyPress={active}>`. It only animates the `scale` property (the layout never changes, so the keys of the
 * grid do not push each other around) and the CSS variable `--press` (0..1, the accent's opacity); both are removed again once at rest.
 * A child marked `data-press-label` is counter-scaled so the text grows with the key instead of being stretched (the wide space key is
 * 160 x 50, so the same extra px on both axes would stretch it).
 *
 * Tapping quickly is fine: every change only retargets the springs, which keep their position and velocity, so a second press during the
 * jiggle of the first one carries the motion on without a jump.
 */
import {createLoop, retarget, spring, type Spring} from "../../../menu/title/main-menu/spring.js";

const SWELL = 0.43; // x height (as PressButton), times SWELL_STRENGTH below
const SQUEEZE = 0.1; // x height (as PressButton), times SQUEEZE_STRENGTH below
// Two keys that are held together (W + D) swell towards each other over a 5px gap, so the swell stays small: 0.2 x 0.43 x 50px = 4.3px
// (2.15px each side, about 4.5px with the overshoot). The squeeze on release is free to be bigger: a key shrinking leaves room.
const SWELL_STRENGTH = 0.2;
const SQUEEZE_STRENGTH = 0.75;

export function keyPress(node: HTMLElement, initiallyActive = false) {
    // extra width / height in px (0 = the key's own size) and the accent's progress, with the ClickGUI button's constants
    const w = spring(0, 420, 26);
    const h = spring(0, 420, 26);
    const pr = spring(0, 520, 34);

    let W = 1;
    let H = 1;
    let label: HTMLElement | null = null;
    let active = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dirty = false;

    const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const atRest = () => [w, h, pr].every((s) => Math.abs(s.p) < 0.005 && Math.abs(s.t) < 0.005 && Math.abs(s.v) < 0.01);

    function render() {
        if (!active && !timer && atRest()) {
            if (dirty) {
                node.style.scale = "";
                node.style.transformOrigin = "";
                node.style.removeProperty("--press");
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
        // the accent never goes past 100 % or below 0 % (its spring overshoots a little)
        node.style.setProperty("--press", Math.max(0, Math.min(1, pr.p)).toFixed(3));
        // net text scale = sx on both axes
        if (label) label.style.scale = `1 ${(sx / sy).toFixed(4)}`;
    }

    const loop = createLoop([w, h, pr], {render});

    function go(s: Spring, target: number, stiffness: number, damping: number) {
        retarget(s, target, stiffness, damping);
        loop.kick();
    }

    function down() {
        active = true;
        clearTimeout(timer);
        timer = undefined;
        W = Math.max(1, node.offsetWidth);
        H = Math.max(1, node.offsetHeight);
        label = node.querySelector<HTMLElement>(":scope > [data-press-label]");
        const swell = reduced() ? 0 : H * SWELL * SWELL_STRENGTH;
        go(pr, 1, 248, 24.5);
        go(w, swell, 281, 24.5);
        go(h, swell, 281, 24.5);
    }

    function up() {
        active = false;
        clearTimeout(timer);
        const squeeze = reduced() ? 0 : H * SQUEEZE * SQUEEZE_STRENGTH;
        go(pr, 0, 165, 25.5);
        go(w, -squeeze, 992, 54.5);
        go(h, -squeeze, 992, 54.5);
        // after the squeeze the key springs back to its size on a loose spring: that is the jiggle
        timer = setTimeout(() => {
            timer = undefined;
            if (!active) {
                go(w, 0, 347, 13.6);
                go(h, 0, 347, 13.6);
            }
        }, 165);
    }

    if (initiallyActive) down();

    return {
        update(next: boolean) {
            if (next === active) return;
            if (next) down();
            else up();
        },
        destroy() {
            loop.stop();
            clearTimeout(timer);
            node.style.scale = "";
            node.style.transformOrigin = "";
            node.style.removeProperty("--press");
            if (label) label.style.scale = "";
        }
    };
}
