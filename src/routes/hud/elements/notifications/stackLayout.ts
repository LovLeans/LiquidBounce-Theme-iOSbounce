/*
 * Layout of the notification stack, done by hand instead of by svelte's `animate:flip`.
 *
 * Why: svelte 5 takes a leaving item of a keyed each out of the layout flow so the others can move into its place, but it does not when the
 * item has an animation running (a flip of its own). Banners that left a few ms apart or while others were still gliding kept their room
 * during their exit, the others glided only part of the way, and when the exits ended the rest happened in ONE frame. Anything built on
 * `animate:` + a transition on the same list has this hole, so nothing here uses either.
 *
 * How it works. Every banner sits in a `slot` (position: absolute; top: 0) and is placed with `transform: translateY(y)`; the slot has
 * a CSS `transition` on that transform. A CSS transition always starts from where the element is RIGHT NOW and can be retargeted at any
 * moment, so a slot that is interrupted (another banner comes, goes, or leaves) just turns and glides to its new place: no jump is possible.
 *  - `y` of a live slot = the heights and gaps of the live slots above it. A LEAVING slot (`data-leaving`) no longer counts: it is frozen
 *    where it is on screen and plays its exit there (see `bannerMotion`).
 *  - The box has the height of the live slots. When that changes, the box's own place on screen can move (a bottom-anchored stack grows
 *    upwards: its top edge moves). All slots are positioned relative to the box top, so that would move everything at once. The move is
 *    measured and every slot is shifted back by exactly that much (without transition) before it glides to its target. The stack is thus
 *    smooth whatever the HUD anchors it to (top, bottom, centre).
 *  - A new slot is placed without a transition (its entrance is the banner's own animation).
 */

export const STACK_GAP = 8;

/** px on screen per px of the element's own coordinates (the HUD sits in a CSS `zoom`; rects are screen px, a `translate` is not) */
function zoomFactor(el: HTMLElement): number {
    const width = el.offsetWidth;
    return width > 0 ? el.getBoundingClientRect().width / width : 1;
}

function currentY(el: HTMLElement): number {
    const transform = getComputedStyle(el).transform;
    return transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42;
}

function jump(el: HTMLElement, y: number) {
    el.style.transition = "none";
    el.style.transform = `translateY(${y}px)`;
}

/** Call after every change of the list (a banner added, replaced, set to leaving or removed). Idempotent. */
export function layoutStack(box: HTMLElement, gap = STACK_GAP) {
    const slots = Array.from(box.children) as HTMLElement[];

    // Where everything is now, before anything changes (a running transition reports its current value).
    const now = slots.map((slot) => slot.dataset.placed ? currentY(slot) : 0);

    // Where the live ones go.
    let y = 0;
    let live = 0;
    const target = slots.map((slot) => {
        if (slot.hasAttribute("data-leaving")) return null;
        const at = y;
        y += slot.offsetHeight + gap;
        live++;
        return at;
    });
    const height = live > 0 ? y - gap : 0;

    // The box changes its height; its top edge may move on screen with it.
    const topBefore = box.getBoundingClientRect().top;
    box.style.height = `${height}px`;
    const shift = (box.getBoundingClientRect().top - topBefore) / zoomFactor(box);

    const glide: [HTMLElement, number][] = [];
    const settle: HTMLElement[] = [];

    slots.forEach((slot, i) => {
        const to = target[i];

        if (!slot.dataset.placed) {
            // new: straight to its place
            jump(slot, to ?? 0);
            slot.dataset.placed = "1";
            settle.push(slot);
        } else if (to === null) {
            // leaving: stays exactly where it is on screen, for good
            if (slot.style.transition !== "none" || shift !== 0) jump(slot, now[i] - shift);
        } else if (shift !== 0) {
            // keep it where it is on screen, then glide
            jump(slot, now[i] - shift);
            glide.push([slot, to]);
        } else {
            slot.style.transition = "";
            slot.style.transform = `translateY(${to}px)`;
        }
    });

    if (glide.length > 0 || settle.length > 0) {
        void box.offsetHeight; // the jumps above must be applied before the transition is switched on again
        settle.forEach((slot) => slot.style.transition = "");
        glide.forEach(([slot, to]) => {
            slot.style.transition = "";
            slot.style.transform = `translateY(${to}px)`;
        });
    }
}
