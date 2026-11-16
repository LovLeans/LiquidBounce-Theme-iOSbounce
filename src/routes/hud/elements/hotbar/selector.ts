/*
 * Motion of the hotbar selector (the round bubble with one ring that sits on the selected slot).
 *
 * The bubble is not one moving circle, it is a blob with TWO EDGES, each on its own spring:
 *
 *   - the LEADING edge (the one facing the new slot) gets a stiff spring and shoots ahead,
 *     the TRAILING edge gets a soft one and drags behind. So the blob stretches by itself while it flies (slot 1 -> 9 is a long
 *     streak), the tail then catches up, the whole thing squashes as it lands, overshoots and wobbles out. No fake "speed -> scale".
 *   - the ends of the dock are SOFT WALLS: an edge that reaches the end bounces back a little instead of stopping dead, while the
 *     other edge is still arriving. That is the squash against the wall and the jiggle on a 1 <-> 9 hop.
 *   - JELLY, a third spring that follows the speed: it stretches the blob while it moves and, because it is under-damped, swings
 *     past zero when the blob stops (a short squash), then wobbles out. This is what makes even a 1-slot hop jiggle.
 *   - PRESS, as before: every slot change swells the bubble and brightens its ring, and lets go ~210 ms after the LAST change
 *     (scrolling quickly keeps it pressed). The dock behind the slots stays still.
 *
 * The blob is sized with width / height / border-radius (not scale()), so the ring keeps the same thickness however far it is
 * stretched, and the shape is always a true capsule. Its volume is kept roughly constant: wide = lower, squashed = taller.
 *
 * Nothing here is reactive state. The loop writes the styles of the `.slider` inside the node it is used on and sleeps (no
 * requestAnimationFrame) as soon as everything has settled. The stylesheet only sets the look; this file sets:
 *
 *   transform   translate3d(left, top)      width / height   the blob's box        --q   0..1, pressed / moving (ring + glow)
 *
 * Usage: `<div class="hotbar-elements" use:selector={currentSlot}>` with a `.slider` child (the slots are PITCH px apart, the
 * first is at x = 0, a slot is SLOT px wide and tall).
 */

export const PITCH = 45;
export const SLOT = 45;

const LAST = 8 * PITCH;

// The dock reaches out 6 px past the slots. State: how far an EDGE may go before the wall pushes it back. Drawing: the blob
// (which can be wider than the slot: swollen, wobbling) is never drawn past this, so it always stays inside the glass.
const WALL_L = -3, WALL_R = LAST + SLOT + 3;
const DRAW_L = -4.5, DRAW_R = LAST + SLOT + 4.5;
const BOUNCE = .38;                    // how much of its speed an edge keeps when it hits the wall

// Edge springs (stiffness, damping). Leading: fast and bouncy (zeta ~ .6). Trailing: slow, so the blob stretches, and nearly critically
// damped (zeta ~ .85): an overshooting tail would grow with the distance and squash a long hop into a thin tall pill.
const LEAD = {k: 430, c: 25};
const TRAIL = {k: 220, c: 25};

// Jelly: follows the speed, under-damped on purpose (zeta ~ .18: when the speed drops to 0 it swings well past zero, then wobbles out)
const JELLY_K = 620, JELLY_C = 9;
const JELLY_SPEED = 900;               // px/s that count as "full speed"
const JELLY_PX = 18;                   // width the jelly adds (or removes while it swings back) at full speed
const WALL_SQUASH = .009;              // a hit on the end wall kicks the jelly negative by this much per px/s of impact speed

const PRESS_K = 185, PRESS_C = 14.5;
const PRESS_W = 10, PRESS_H = 6;       // px the press swell adds to the width / height

const STRETCH_MAX = 40;                // the lag stretch (px beyond the slot) saturates smoothly here: a streak, never a bar
const MIN_W = 34, MIN_H = 30, MAX_H = 53;   // the dock's inside is 57 px tall

const clamp = (a: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, a));

interface Edge {
    x: number;   // position
    v: number;   // velocity
    t: number;   // target
    k: number;   // stiffness
    c: number;   // damping
}

export function selector(node: HTMLElement, slot: number) {
    const bubble = node.querySelector<HTMLElement>(".slider");
    if (!bubble) {
        return {update() {}, destroy() {}};
    }

    const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

    let idx = slot;
    const L: Edge = {x: slot * PITCH, v: 0, t: slot * PITCH, k: LEAD.k, c: LEAD.c};
    const R: Edge = {x: slot * PITCH + SLOT, v: 0, t: slot * PITCH + SLOT, k: LEAD.k, c: LEAD.c};
    let j = 0, jv = 0;                     // jelly (may swing negative)
    let p = 0, pv = 0, pt = 0;             // press amount (may overshoot), velocity, target
    let raf = 0, last = 0, downAt = 0, relT: number | undefined;

    function render() {
        const cx = (L.x + R.x) / 2;
        const speed = Math.min(Math.abs(L.v + R.v) / 2 / JELLY_SPEED, 1);

        // the lag between the edges is the stretch; saturate it softly
        let lag = R.x - L.x;
        if (lag > SLOT) lag = SLOT + STRETCH_MAX * Math.tanh((lag - SLOT) / STRETCH_MAX);
        const sw = Math.max(MIN_W, lag + j * JELLY_PX);                      // width without the press swell
        const h = clamp(SLOT * Math.sqrt(SLOT / sw) + p * PRESS_H, MIN_H, MAX_H);   // roughly constant volume
        const w = sw + p * PRESS_W;

        // keep the drawn blob inside the dock: against an end it squashes instead of poking out
        const left = Math.max(DRAW_L, cx - w / 2);
        const right = Math.min(DRAW_R, cx + w / 2);

        const s = bubble!.style;
        s.transform = "translate3d(" + left.toFixed(2) + "px," + ((SLOT - h) / 2).toFixed(2) + "px,0)";
        s.width = Math.max(MIN_W * .8, right - left).toFixed(2) + "px";
        s.height = h.toFixed(2) + "px";
        s.setProperty("--q", clamp(Math.max(p, speed * .6), 0, 1).toFixed(3));
    }

    function step(t: number) {
        const dt = Math.min(.033, (t - last) / 1000 || .016);
        last = t;
        const n = Math.ceil(dt / .0042), h = dt / n;
        for (let i = 0; i < n; i++) {
            L.v += ((L.t - L.x) * L.k - L.v * L.c) * h;
            L.x += L.v * h;
            R.v += ((R.t - R.x) * R.k - R.v * R.c) * h;
            R.x += R.v * h;

            // the ends of the dock are soft walls: the edge bounces back a little
            if (L.x < WALL_L) { L.x = WALL_L; if (L.v < 0) { jv += L.v * WALL_SQUASH; L.v *= -BOUNCE; } }
            if (R.x > WALL_R) { R.x = WALL_R; if (R.v > 0) { jv -= R.v * WALL_SQUASH; R.v *= -BOUNCE; } }

            const speed = Math.min(Math.abs(L.v + R.v) / 2 / JELLY_SPEED, 1);
            jv += ((speed - j) * JELLY_K - jv * JELLY_C) * h;
            j += jv * h;

            pv += ((pt - p) * PRESS_K - pv * PRESS_C) * h;
            p += pv * h;
        }
        render();
        if (
            Math.abs(L.t - L.x) > .04 || Math.abs(R.t - R.x) > .04 || Math.abs(L.v) > .4 || Math.abs(R.v) > .4 ||
            Math.abs(j) > .006 || Math.abs(jv) > .12 ||
            Math.abs(pt - p) > .002 || Math.abs(pv) > .01
        ) {
            raf = requestAnimationFrame(step);
        } else {
            raf = 0;
            L.x = L.t; R.x = R.t; L.v = R.v = 0;
            j = jv = 0;
            p = pt; pv = 0;
            render();
        }
    }

    function kick() {
        if (!raf) {
            last = performance.now();
            raf = requestAnimationFrame(step);
        }
    }

    function release() {
        const wait = Math.max(0, 210 - (performance.now() - downAt));
        clearTimeout(relT);
        relT = window.setTimeout(() => { pt = 0; kick(); }, wait);
    }

    render();

    return {
        update(next: number) {
            if (next === idx) return;
            const dir = Math.sign(next - idx);
            idx = next;
            L.t = idx * PITCH;
            R.t = idx * PITCH + SLOT;
            if (still) {
                L.x = L.t; R.x = R.t; L.v = R.v = 0;
                render();
                return;
            }
            // the edge that faces the new slot leads, the other one drags
            const lead = dir > 0 ? R : L, trail = dir > 0 ? L : R;
            lead.k = LEAD.k; lead.c = LEAD.c;
            trail.k = TRAIL.k; trail.c = TRAIL.c;
            downAt = performance.now();
            pt = 1;
            release();
            kick();
        },
        destroy() {
            cancelAnimationFrame(raf);
            clearTimeout(relT);
        }
    };
}
