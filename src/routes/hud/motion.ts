/*
 * Motion of the HUD: one spring for everything that comes and goes, so a notification, an array-list row, the target card and a
 * tab-gui menu all arrive the same way (iOS: a short, slightly springy scale-up from just under full size, with a small slide).
 *
 * `pop` is a Svelte transition (use it as `in:` / `out:` / `transition:`). It keeps a transform that the element already has
 * (BlockCounter is shifted by translate(-100%)), exactly like svelte's own `fly` does.
 */

// Damped spring settling at t = 1 (damping ratio .82: ~1.4 % overshoot). Svelte hands the result to `css(t)`.
function spring(t: number): number {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const zeta = .82;
    const w = 12; // natural frequency over the unit interval: e^(-zeta * w) = 5e-5 at t = 1, so there is no jump at the end
    const wd = w * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + (zeta * w / wd) * Math.sin(wd * t));
}

export interface PopParams {
    x?: number;
    y?: number;
    /** scale at the start (1 = no scale) */
    from?: number;
    duration?: number;
    delay?: number;
}

export function pop(node: Element, {x = 0, y = 0, from = .9, duration = 380, delay = 0}: PopParams = {}) {
    const existing = getComputedStyle(node).transform;
    const base = existing === "none" ? "" : existing;

    return {
        delay,
        duration,
        easing: spring,
        css: (t: number, u: number) =>
            `transform: ${base} translate(${u * x}px, ${u * y}px) scale(${from + (1 - from) * t});` +
            `opacity: ${Math.min(1, t * 1.8)}`
    };
}

// Leaving is quicker and does not bounce (iOS dismisses faster than it presents).
export function popOut(node: Element, {x = 0, y = 0, from = .94, duration = 220, delay = 0}: PopParams = {}) {
    const existing = getComputedStyle(node).transform;
    const base = existing === "none" ? "" : existing;

    return {
        delay,
        duration,
        easing: (t: number) => 1 - (1 - t) * (1 - t),
        css: (t: number, u: number) =>
            `transform: ${base} translate(${u * x}px, ${u * y}px) scale(${from + (1 - from) * t});` +
            `opacity: ${t}`
    };
}

// The notification banner (iOS: it grows out of the Dynamic Island, small, blurred and see-through, overshoots its size a little and
// settles; it leaves the same way, quicker). Here the banner does not travel up / down but sideways: it grows out of its RIGHT edge,
// from the right to the left, and leaves back to the right (left to right).
//
// A touch bouncier than `pop` (damping ratio .7: ~4.6 % overshoot of the scale-up). `t` can pass 1 while it overshoots, so everything
// that must stay in range is clamped.
function bouncySpring(t: number): number {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const zeta = .7;
    const w = 8.2; // first reaches full size at ~.4 of the duration (~280 ms), e^(-zeta * w) = 3e-3 at t = 1: no visible jump at the end
    const wd = w * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + (zeta * w / wd) * Math.sin(wd * t));
}

export interface BannerParams {
    /** how far (px) the banner starts from its place, towards the right */
    x?: number;
    /** scale at the start */
    from?: number;
    /** blur (px) at the start */
    blur?: number;
    duration?: number;
    delay?: number;
}

export function bannerIn(node: Element, {x = 70, from = .5, blur = 10, duration = 700, delay = 0}: BannerParams = {}) {
    const existing = getComputedStyle(node).transform;
    const base = existing === "none" ? "" : existing;

    return {
        delay,
        duration,
        easing: bouncySpring,
        css: (t: number, u: number) =>
            `transform-origin: 100% 50%;` +
            `transform: ${base} translateX(${u * x}px) scale(${from + (1 - from) * t});` +
            `opacity: ${Math.min(1, Math.max(0, t) * 1.6)};` +
            `filter: blur(${Math.max(0, Math.min(1, u * 1.6)) * blur}px)`
    };
}

export function bannerOut(node: Element, {x = 70, from = .5, blur = 10, duration = 260, delay = 0}: BannerParams = {}) {
    const existing = getComputedStyle(node).transform;
    const base = existing === "none" ? "" : existing;

    return {
        delay,
        duration,
        easing: (t: number) => 1 - (1 - t) * (1 - t),
        css: (t: number, u: number) =>
            `transform-origin: 100% 50%;` +
            `transform: ${base} translateX(${u * x}px) scale(${from + (1 - from) * t});` +
            `opacity: ${Math.min(1, t * 1.6)};` +
            `filter: blur(${u * blur}px)`
    };
}

// ---- The banner as an action (what Notifications.svelte uses) ----
//
// The same motion as `bannerIn` / `bannerOut` above, but played with the Web Animations API by an action instead of a svelte transition,
// so that the list needs neither `in:` / `out:` nor `animate:` (see elements/notifications/stackLayout.ts for why). The exit starts from
// the banner's CURRENT look (read from its computed style), so a banner that leaves in the middle of its entrance does not pop.

const BANNER_STEPS = 40;
const BANNER_IN_MS = 700;
const BANNER_OUT_MS = 260;

function banner(x: number, scale: number, opacity: number, blur: number): Keyframe {
    return {transform: `translateX(${x}px) scale(${scale})`, opacity, filter: `blur(${blur}px)`};
}

function bannerEnterKeyframes({x = 70, from = .5, blur = 10}: BannerParams = {}): Keyframe[] {
    const frames: Keyframe[] = [];
    for (let i = 0; i <= BANNER_STEPS; i++) {
        const p = i / BANNER_STEPS;
        const t = bouncySpring(p); // may pass 1 (overshoot)
        const u = 1 - t;
        frames.push({
            ...banner(u * x, from + (1 - from) * t, Math.min(1, Math.max(0, t) * 1.6), Math.max(0, Math.min(1, u * 1.6)) * blur),
            offset: p
        });
    }
    return frames;
}

interface BannerLook {
    x: number;
    scale: number;
    opacity: number;
    blur: number;
}

function bannerLeaveKeyframes(
    start: BannerLook,
    {x = 70, from = .5, blur = 10}: BannerParams = {},
    ease: (p: number) => number = (p) => p * p // ease-in
): Keyframe[] {
    const frames: Keyframe[] = [];
    for (let i = 0; i <= BANNER_STEPS; i++) {
        const p = i / BANNER_STEPS;
        const u = ease(p);
        frames.push({
            ...banner(
                start.x + (x - start.x) * u,
                start.scale + (from - start.scale) * u,
                start.opacity * Math.min(1, (1 - u) * 1.6),
                start.blur + (blur - start.blur) * u
            ),
            offset: p
        });
    }
    return frames;
}

function currentLook(node: HTMLElement): BannerLook {
    const style = getComputedStyle(node);
    const matrix = style.transform === "none" ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(style.transform);
    const blur = /blur\(([\d.]+)px\)/.exec(style.filter);
    return {
        x: matrix.m41,
        scale: matrix.a,
        opacity: parseFloat(style.opacity),
        blur: blur ? parseFloat(blur[1]) : 0
    };
}

/** `use:bannerMotion={leaving}`: plays the entrance when the banner appears and the exit when `leaving` turns true. */
export function bannerMotion(node: HTMLElement, leaving: boolean) {
    node.style.transformOrigin = "100% 50%";

    // `backwards` only: once it is over nothing stays applied (a permanent `filter` / transform would keep a layer for every banner).
    let entrance: Animation | null = node.animate(bannerEnterKeyframes(), {duration: BANNER_IN_MS, fill: "backwards"});
    let gone = false;

    function leave() {
        if (gone) return;
        gone = true;

        const start = currentLook(node);
        entrance?.cancel();
        entrance = null;
        node.animate(bannerLeaveKeyframes(start), {duration: BANNER_OUT_MS, fill: "forwards"});
    }

    if (leaving) leave();

    return {
        update(nowLeaving: boolean) {
            if (nowLeaving) leave();
        },
        destroy() {
            entrance?.cancel();
        }
    };
}

// ---- The array-list row (what ArrayList.svelte uses) ----
//
// The banner's motion on a smaller scale: a row grows out of the edge the list is aligned to (small, blurred, see-through), overshoots its
// size and its place and settles; it leaves back to that edge, quicker and without a bounce. The spring is jigglier than the banner's
// (damping ratio .55 against .7: ~12.6 % overshoot against ~4.6 %), because a row is small and a slow, shallow bounce would not read.
// `layoutRows` (elements/arraylist/rowLayout.ts) moves the OTHER rows with a spring of their own when one comes or goes.

function jigglySpring(t: number): number {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const zeta = .55;
    const w = 10.5; // e^(-zeta * w) = 3e-3 at t = 1: no visible jump at the end
    const wd = w * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + (zeta * w / wd) * Math.sin(wd * t));
}

export type RowSide = "left" | "right";

export interface RowMotionParams {
    /** turns true when the row has to leave */
    leaving: boolean;
    /** the edge of the list the rows are aligned to: they come from and go to that side */
    side: RowSide;
}

const ROW_STEPS = 48; // a jigglier spring needs more samples than the banner's 40 (linear in between)
const ROW_IN_MS = 760;
const ROW_OUT_MS = 240;
const ROW_X = 36;
const ROW_FROM = .55;
const ROW_BLUR = 7;
const ROW_OUT_X = 24;
const ROW_OUT_FROM = .6;
const ROW_OUT_BLUR = 5;

function rowOrigin(side: RowSide): string {
    return side === "left" ? "0% 50%" : "100% 50%";
}

function rowEnterKeyframes(side: RowSide): Keyframe[] {
    const x = side === "left" ? -ROW_X : ROW_X;
    const frames: Keyframe[] = [];
    for (let i = 0; i <= ROW_STEPS; i++) {
        const p = i / ROW_STEPS;
        const t = jigglySpring(p); // passes 1 while it overshoots
        const u = 1 - t;
        frames.push({
            ...banner(u * x, ROW_FROM + (1 - ROW_FROM) * t, Math.min(1, Math.max(0, t) * 1.6), Math.max(0, Math.min(1, u * 1.6)) * ROW_BLUR),
            offset: p
        });
    }
    return frames;
}

/** `use:rowMotion={{leaving, side}}`: plays the entrance when the row appears and the exit when `leaving` turns true. */
export function rowMotion(node: HTMLElement, params: RowMotionParams) {
    let side = params.side;
    node.style.transformOrigin = rowOrigin(side);

    // `backwards` only: once it is over nothing stays applied (a permanent `filter` / transform would keep a layer for every row).
    let entrance: Animation | null = node.animate(rowEnterKeyframes(side), {duration: ROW_IN_MS, fill: "backwards"});
    let gone = false;

    function leave() {
        if (gone) return;
        gone = true;

        // from the row's CURRENT look, so a row that leaves in the middle of its entrance does not pop
        const start = currentLook(node);
        entrance?.cancel();
        entrance = null;
        node.animate(
            bannerLeaveKeyframes(start, {x: side === "left" ? -ROW_OUT_X : ROW_OUT_X, from: ROW_OUT_FROM, blur: ROW_OUT_BLUR}),
            {duration: ROW_OUT_MS, fill: "forwards"}
        );
    }

    if (params.leaving) leave();

    return {
        update(next: RowMotionParams) {
            if (!gone && next.side !== side) {
                side = next.side;
                node.style.transformOrigin = rowOrigin(side);
            }
            if (next.leaving) leave();
        },
        destroy() {
            entrance?.cancel();
        }
    };
}

// ---- The target card (what TargetHud.svelte uses) ----
//
// The banner's motion without the travel: nothing slides up, down or sideways, the card just EXPANDS in place from its middle (small,
// blurred and see-through at first, overshoots its size a little and settles) and CLOSES back into its middle (a smooth ease in and out, so
// it neither snaps at the start nor at the end). Same spring as the banner (`bouncySpring`).
//
// `leaving` can turn back to false while the exit is still playing (a new target arrives): the card then expands again from its CURRENT
// look instead of jumping to full size.

const CARD_IN_MS = 640;
const CARD_FROM = .6;
const CARD_BLUR = 8;
// Switching from one player to another, in two beats: the card DAMPS IN (a little smaller, blurred and a touch see-through, slowing into the
// dip), the new player is put on the card at the bottom of the dip (`CARD_SWAP_MS`, TargetHud.svelte switches then), and the card DAMPS OUT
// (springs back past its size, ~1.6 %, the blur clears and it settles).
const CARD_DIP_IN_MS = 150;
const CARD_DIP_OUT_MS = 470;
const CARD_DIP = .06; // scale at the bottom of the dip: .94
const CARD_DIP_BLUR = 4;
const CARD_DIP_OPACITY = .78;

/** when the new player has to appear on the card after a pulse starts: the bottom of the dip, where the card is at its blurriest */
export const CARD_SWAP_MS = CARD_DIP_IN_MS;
/** a card that opened less ago than this is still growing: it does not pulse, the new player is just shown */
export const CARD_SETTLED_MS = CARD_IN_MS;

/** how long the exit of a card takes: a leaving card must stay in the DOM at least that long (TargetHud.svelte adds a margin) */
export const CARD_OUT_MS = 320;

const smoothStep = (p: number): number => p * p * (3 - 2 * p);

function cardEnterKeyframes(): Keyframe[] {
    return bannerEnterKeyframes({x: 0, from: CARD_FROM, blur: CARD_BLUR});
}

function cardLeaveKeyframes(start: BannerLook): Keyframe[] {
    return bannerLeaveKeyframes(start, {x: 0, from: CARD_FROM, blur: CARD_BLUR}, smoothStep);
}

// From wherever the card is right now (half way through its exit, say) back to rest: the same spring, so it still settles softly.
function cardReenterKeyframes(start: BannerLook): Keyframe[] {
    const frames: Keyframe[] = [];
    for (let i = 0; i <= BANNER_STEPS; i++) {
        const p = i / BANNER_STEPS;
        const t = bouncySpring(p); // passes 1 while it overshoots
        const calm = Math.max(0, Math.min(1, t));
        frames.push({
            ...banner(0, start.scale + (1 - start.scale) * t, start.opacity + (1 - start.opacity) * Math.min(1, calm * 1.6), start.blur * (1 - calm)),
            offset: p
        });
    }
    return frames;
}

// Damped spring from 0 to 1 that overshoots (damping ratio .38: ~27 % of the way back out, so ~1.6 % past full size from a 6 % dip).
function dampOutSpring(t: number): number {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const zeta = .38;
    const w = 11; // e^(-zeta * w) = 1.5e-2 at t = 1: next to no jump at the end
    const wd = w * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + (zeta * w / wd) * Math.sin(wd * t));
}

interface PulseShape {
    /** ms of the damp in (down into the dip) */
    inMs: number;
    /** ms of the damp out (spring back and settle) */
    outMs: number;
    /** how far the scale drops at the bottom of the dip (.06 = down to .94) */
    dip: number;
    /** blur (px) at the bottom of the dip */
    blur: number;
    /** opacity at the bottom of the dip */
    opacity: number;
}

const CARD_PULSE: PulseShape = {
    inMs: CARD_DIP_IN_MS,
    outMs: CARD_DIP_OUT_MS,
    dip: CARD_DIP,
    blur: CARD_DIP_BLUR,
    opacity: CARD_DIP_OPACITY
};

// The two-beat damp in / damp out, shared by the card (a new player) and by text (a new value, see `textPulse` below).
// `start`: the look the element has when the pulse begins (a second switch in the middle of the first one): the dip starts from it, so nothing jumps.
function pulseKeyframes(start: BannerLook, shape: PulseShape): Keyframe[] {
    const frames: Keyframe[] = [];
    const total = shape.inMs + shape.outMs;
    const inSteps = 12;
    const outSteps = BANNER_STEPS;
    const dipScale = 1 - shape.dip;

    // damp in: slows down into the dip (ease out), blur and fade come with it
    for (let i = 0; i <= inSteps; i++) {
        const p = i / inSteps;
        const e = 1 - (1 - p) * (1 - p) * (1 - p);
        frames.push({
            ...banner(
                0,
                start.scale + (dipScale - start.scale) * e,
                start.opacity + (shape.opacity - start.opacity) * e,
                start.blur + (shape.blur - start.blur) * e
            ),
            offset: shape.inMs * p / total
        });
    }

    // damp out: spring back past full size and settle, the blur clears over the first part of it
    for (let i = 1; i <= outSteps; i++) {
        const p = i / outSteps;
        const t = dampOutSpring(p);
        const clear = smoothStep(Math.min(1, p * 1.6));
        frames.push({
            ...banner(
                0,
                dipScale + (1 - dipScale) * t,
                shape.opacity + (1 - shape.opacity) * Math.min(1, p * 2.2),
                shape.blur * (1 - clear)
            ),
            offset: (shape.inMs + shape.outMs * p) / total
        });
    }
    return frames;
}

function cardPulseKeyframes(start: BannerLook): Keyframe[] {
    return pulseKeyframes(start, CARD_PULSE);
}

// ---- Text that changes (what SwapText.svelte uses) ----
//
// The same damp in / damp out as the card, for a piece of text whose words change in place ("Enabled" -> "Disabled", a timer, a count):
// the old text damps in (a little smaller, blurred and see-through, slowing into the dip), the new text is put there at the bottom of the
// dip (`TEXT_SWAP_MS`), and it damps out (springs back past its size, the blur clears and it settles). Text is small, so the dip is a
// bit deeper than the card's, and `intensity` scales it (a timer that ticks every second uses a gentler one).

const TEXT_PULSE: PulseShape = {inMs: 150, outMs: 460, dip: .1, blur: 3, opacity: .45};

// Numbers are drawn one digit at a time (SwapText.svelte) and only the digits that change pulse. A digit is tiny and a count changes every
// few hundred ms, so it must NEVER fade or blur out (a deep dim made the changing digit vanish for ~a quarter of a second, in a recording
// of the block counter it was hard to see for most of a countdown): the pulse keeps a blur (1.7 px), a clear dip, a bouncy
// spring back and only a light dim, and it is short, so it is over before the next change. Its own swap moment, `NUMBER_SWAP_MS`.
const NUMBER_PULSE: PulseShape = {inMs: 120, outMs: 400, dip: .22, blur: 1.7, opacity: .6};

/** when the new text has to appear after a text pulse starts: the bottom of the dip */
export const TEXT_SWAP_MS = TEXT_PULSE.inMs;
/** the same for a digit (a shorter pulse) */
export const NUMBER_SWAP_MS = NUMBER_PULSE.inMs;

/**
 * Plays one text pulse on `node` and returns the animation. It starts from the node's CURRENT look, so a change in the middle of a pulse
 * does not jump. The caller cancels the animation it had before (after this call: the new one is built from where the old one is now).
 */
export function textPulse(node: HTMLElement, intensity = 1, numeric = false): Animation | null {
    if (typeof node.animate !== "function") return null;

    const base = numeric ? NUMBER_PULSE : TEXT_PULSE;
    const shape: PulseShape = {
        ...base,
        dip: base.dip * intensity,
        blur: base.blur * intensity,
        opacity: 1 - (1 - base.opacity) * intensity
    };

    return node.animate(pulseKeyframes(currentLook(node), shape), {duration: shape.inMs + shape.outMs});
}

export interface CardParams {
    /** turns true when the card has to close (and false again when it has to come back) */
    leaving: boolean;
    /** a counter: every increase plays one pulse (the target changed) */
    pulse?: number;
}

/** `use:cardMotion={{leaving, pulse}}`: expands the card in place when it appears, closes it when `leaving` turns true, expands it again if `leaving` turns false. */
export function cardMotion(node: HTMLElement, params: CardParams) {
    node.style.transformOrigin = "50% 50%";

    // `backwards` for the entrance: once it is over nothing stays applied (a permanent `filter` / transform would keep a layer for the card).
    let current: Animation | null = node.animate(cardEnterKeyframes(), {duration: CARD_IN_MS, fill: "backwards"});
    let entering = true;
    let gone = false;
    let pulse = params.pulse ?? 0;

    function play(frames: Keyframe[], options: KeyframeAnimationOptions, isEntrance = false) {
        current?.cancel();
        current = node.animate(frames, options);
        entering = isEntrance;
    }

    function leave() {
        if (gone) return;
        gone = true;

        // from the card's CURRENT look, so a card that leaves in the middle of its entrance does not pop
        play(cardLeaveKeyframes(currentLook(node)), {duration: CARD_OUT_MS, fill: "forwards"});
    }

    function comeBack() {
        if (!gone) return;
        gone = false;

        play(cardReenterKeyframes(currentLook(node)), {duration: CARD_IN_MS, fill: "backwards"}, true);
    }

    function bounce() {
        // not while the card is closing, nor while it is still opening (it is moving anyway, and the new player is simply shown)
        if (gone || (entering && current?.playState === "running")) return;

        play(cardPulseKeyframes(currentLook(node)), {duration: CARD_DIP_IN_MS + CARD_DIP_OUT_MS});
    }

    if (params.leaving) leave();

    return {
        update(next: CardParams) {
            if (next.leaving) leave();
            else comeBack();

            const nextPulse = next.pulse ?? 0;
            if (nextPulse !== pulse) {
                pulse = nextPulse;
                bounce();
            }
        },
        destroy() {
            current?.cancel();
        }
    };
}

// ---- The effects card (what Effects.svelte uses) ----
//
// The card itself comes and goes like the block counter (`cardMotion` above). What is new here is what happens INSIDE a card that stays:
//
//  - `sizeMorph`: the card's real width / height morphs from its current size to the new one. Growing (an effect arrived) is a jiggly
//    spring that overshoots its size a little and settles (`GROW_SPRING`, ~12 % overshoot); shrinking (an effect ran out) is smooth, it
//    only eases in and does not bounce (`SHRINK_SPRING`). The size is real (not a scale), so the text is never stretched, and a card that
//    is anchored to the bottom or the right of the screen grows the right way by itself.
//  - `effectRowMotion`: a row pops in on the spot (small, blurred and see-through at first, jiggles into place) after `delay` ms, so
//    that several rows that arrive together cascade; it leaves quicker (blurs out and shrinks a little) while the card closes in on it.

// A damped spring from 0 to 1 (the same shape as the springs above, just with its own damping ratio and frequency).
function makeSpring(zeta: number, w: number): (t: number) => number {
    const wd = w * Math.sqrt(1 - zeta * zeta);
    return (t: number): number => {
        if (t <= 0) return 0;
        if (t >= 1) return 1;
        return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + (zeta * w / wd) * Math.sin(wd * t));
    };
}

const GROW_SPRING = makeSpring(.56, 11); // e^(-zeta * w) = 2e-3 at t = 1: no visible jump at the end
// ~0.15 % overshoot: smooth. A touch slower than the rows that glide up into the gap (Effects.svelte `.slot`), so the card edge
// never cuts into a row that is still on its way (the row is clipped by the card).
const SHRINK_SPRING = makeSpring(.9, 10);

const MORPH_STEPS = 48;
const MORPH_GROW_MS = 640;
const MORPH_SHRINK_MS = 460;

export interface CardSize {
    width: number;
    height: number;
}

/**
 * `use:sizeMorph={size}`: sets the size of the element (border box, px) and, whenever `size` changes, morphs to the new one from where it
 * is RIGHT NOW (a change in the middle of a morph does not jump). The first size is set without a morph; `undefined` is ignored.
 */
export function sizeMorph(node: HTMLElement, initial: CardSize | undefined) {
    let target: CardSize | undefined;
    let run: { from: CardSize; to: CardSize; ms: number; anim: Animation } | null = null;

    function place(size: CardSize) {
        node.style.width = `${size.width}px`;
        node.style.height = `${size.height}px`;
    }

    const ease = (from: number, to: number) => to >= from ? GROW_SPRING : SHRINK_SPRING;
    const at = (from: number, to: number, p: number) => from + (to - from) * ease(from, to)(p);

    // The size on screen right now. Worked out from the running morph instead of read from the DOM, so it does not depend on the zoom
    // of the HUD and costs no layout.
    function now(): CardSize {
        if (!run) return target!;
        const p = Math.min(1, Math.max(0, Number(run.anim.currentTime ?? run.ms) / run.ms));
        return {width: at(run.from.width, run.to.width, p), height: at(run.from.height, run.to.height, p)};
    }

    function set(next: CardSize | undefined) {
        if (!next) return;

        if (!target) {
            target = next;
            place(next);
            return;
        }

        if (Math.abs(next.width - target.width) < .01 && Math.abs(next.height - target.height) < .01) return;

        const from = now();
        run?.anim.cancel();
        run = null;

        target = next;
        place(next); // the resting size: what stays once the morph is over

        const grows = next.width > from.width + .01 || next.height > from.height + .01;
        const ms = grows ? MORPH_GROW_MS : MORPH_SHRINK_MS;

        const frames: Keyframe[] = [];
        for (let i = 0; i <= MORPH_STEPS; i++) {
            const p = i / MORPH_STEPS;
            frames.push({
                width: `${at(from.width, next.width, p)}px`,
                height: `${at(from.height, next.height, p)}px`,
                offset: p
            });
        }

        run = {from, to: next, ms, anim: node.animate(frames, {duration: ms})};
    }

    set(initial);

    return {
        update(next: CardSize | undefined) {
            set(next);
        },
        destroy() {
            run?.anim.cancel();
        }
    };
}

const EFFECT_ROW_IN_MS = 620;
// A leaving row is gone FAST (ease out: most of the way in the first third): the rows under it glide up into its place at the same
// moment, and a slow fade left the two on top of each other.
const EFFECT_ROW_OUT_MS = 170;
const EFFECT_ROW_FROM = .7;
const EFFECT_ROW_BLUR = 6;
const EFFECT_ROW_OUT_FROM = .85;
const EFFECT_ROW_OUT_BLUR = 6;

/** how long a leaving row has to stay in the DOM: its exit plus a margin (a timer, as in ArrayList.svelte, never an `animationend`) */
export const EFFECT_ROW_LEAVE_MS = EFFECT_ROW_OUT_MS + 40;

function effectRowEnterKeyframes(): Keyframe[] {
    const frames: Keyframe[] = [];
    for (let i = 0; i <= ROW_STEPS; i++) {
        const p = i / ROW_STEPS;
        const t = jigglySpring(p); // passes 1 while it overshoots
        const u = 1 - t;
        frames.push({
            ...banner(0, EFFECT_ROW_FROM + (1 - EFFECT_ROW_FROM) * t, Math.min(1, Math.max(0, t) * 1.6), Math.max(0, Math.min(1, u * 1.6)) * EFFECT_ROW_BLUR),
            offset: p
        });
    }
    return frames;
}

export interface EffectRowParams {
    /** turns true when the row has to leave */
    leaving: boolean;
    /** ms to wait before the entrance; `null`: no entrance (the row is on the card from the start, the card's own entrance shows it) */
    delay: number | null;
}

/** `use:effectRowMotion={{leaving, delay}}`: pops the row in when it appears, blurs it out when `leaving` turns true. */
export function effectRowMotion(node: HTMLElement, params: EffectRowParams) {
    node.style.transformOrigin = "50% 50%";

    // `backwards`: holds the first frame (invisible) during the delay and leaves nothing applied once it is over.
    let entrance: Animation | null = params.delay === null
        ? null
        : node.animate(effectRowEnterKeyframes(), {duration: EFFECT_ROW_IN_MS, delay: params.delay, fill: "backwards"});
    let gone = false;

    function leave() {
        if (gone) return;
        gone = true;

        // from the row's CURRENT look, so a row that leaves in the middle of its entrance does not pop
        const start = currentLook(node);
        entrance?.cancel();
        entrance = null;
        node.animate(
            bannerLeaveKeyframes(start, {x: 0, from: EFFECT_ROW_OUT_FROM, blur: EFFECT_ROW_OUT_BLUR}, (p) => 1 - (1 - p) ** 3),
            {duration: EFFECT_ROW_OUT_MS, fill: "forwards"}
        );
    }

    if (params.leaving) leave();

    return {
        update(next: EffectRowParams) {
            if (next.leaving) leave();
        },
        destroy() {
            entrance?.cancel();
        }
    };
}
