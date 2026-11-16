/*
 * Layout of the array list, done by hand (the same idea as elements/notifications/stackLayout.ts, see there for why `animate:flip` and
 * `in:` / `out:` are not used for a list whose rows come and go at any moment, e.g. a config load toggles ~100 modules at once).
 *
 * Every row sits in a `slot` (position: absolute; top: 0; pinned to the left OR right edge of the box by CSS, so the alignment needs no
 * measuring) that is moved with `transform: translate(x, y)`. The slot has a CSS `transition` on that transform (a spring, ArrayList.svelte),
 * which always starts from where the slot is RIGHT NOW and can be retargeted at any moment: a row that is interrupted by another one
 * coming or going just turns and glides on.
 *
 * This is a FLIP done on every change of the list:
 *   First  - where every slot is on screen right now (getBoundingClientRect includes a running transition).
 *   Last   - the box gets its new size (the widest live row x the live rows), every live slot is put at its place (`ty` = the heights and
 *            gaps of the live rows above it, in the order of `data-rank`), every leaving slot at 0, and the rects are read again.
 *   Invert - every slot is put back to where it was on screen (the difference between First and Last), without a transition.
 *   Play   - live slots get their transition back and glide to `translate(0, ty)`; leaving slots (`data-leaving`) stay where they are.
 * The box's own place on screen can move when its size changes (a right-anchored HUD component grows to the left, a bottom-anchored one
 * upwards), and an alignment that does not match the anchor moves the rows with it: First / Last captures all of that, so the rows glide
 * instead of jumping. Rows that are new are put at their place without a transition (their entrance is the row's own animation).
 *
 * The slots are never reordered in the DOM (ArrayList.svelte keeps them in the order they arrived and sorts with `data-rank`): a browser
 * drops the running transition of an element that is moved.
 *
 * Idempotent and cheap when nothing changed (it is also called by a ResizeObserver), and it then does not touch a glide that is running.
 */

export const ROW_GAP = 4;

function rank(slot: HTMLElement): number {
    return Number(slot.dataset.rank ?? 0);
}

/**
 * px on screen per px of the element's own coordinates (the HUD sits in a CSS `zoom`; rects are screen px, a `translate` is not).
 * Taken from the HEIGHT: it is an exact integer (26px), unlike the width, which `offsetWidth` rounds (a 146.4px row gave a zoom that was
 * 0.3 % off, and every leaving row then crept by that much each time it was frozen again).
 */
function zoomOf(slots: HTMLElement[], rects: DOMRect[]): number {
    for (let i = 0; i < slots.length; i++) {
        const height = slots[i].offsetHeight;
        if (height > 0 && rects[i].height > 0) return rects[i].height / height;
    }
    return 1;
}

export function layoutRows(box: HTMLElement, gap = ROW_GAP) {
    const slots = Array.from(box.children) as HTMLElement[];

    if (slots.length === 0) {
        box.style.width = "";
        box.style.height = "";
        delete box.dataset.size;
        return;
    }

    // ---- First: read everything before anything is written
    const rects = slots.map((slot) => slot.getBoundingClientRect());
    const zoom = zoomOf(slots, rects);

    const live = slots
        .filter((slot) => !slot.hasAttribute("data-leaving"))
        .sort((a, b) => rank(a) - rank(b));

    const rectOf = new Map(slots.map((slot, i) => [slot, rects[i]] as const));
    const target = new Map<HTMLElement, number>();
    let y = 0;
    let width = 0;
    for (const slot of live) {
        target.set(slot, y);
        y += slot.offsetHeight + gap;
        width = Math.max(width, rectOf.get(slot)!.width / zoom);
    }
    const height = live.length > 0 ? y - gap : 0;

    // ---- nothing to do?
    const size = `${width}x${height}`;
    let dirty = box.dataset.size !== size;
    for (const slot of slots) {
        const to = target.get(slot);
        if (!slot.dataset.placed) dirty = true;
        else if (to === undefined ? slot.dataset.state !== "leaving" : slot.dataset.ty !== String(to)) dirty = true;
    }
    if (!dirty) return;

    // ---- Last: new box size, everything at its place (no transitions: they would still be at their old value when measured)
    box.dataset.size = size;
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;

    for (const slot of slots) {
        slot.style.transition = "none";
        slot.style.transform = `translate(0px, ${target.get(slot) ?? 0}px)`;
    }

    const last = slots.map((slot) => slot.getBoundingClientRect());

    // ---- Invert
    const glide: [HTMLElement, number][] = [];
    const settle: HTMLElement[] = [];

    slots.forEach((slot, i) => {
        const to = target.get(slot);

        if (!slot.dataset.placed) {
            // new: stays at its place
            slot.dataset.placed = "1";
            slot.dataset.ty = String(to ?? 0);
            slot.dataset.state = to === undefined ? "leaving" : "live";
            if (to !== undefined) settle.push(slot);
            return;
        }

        const dx = (rects[i].left - last[i].left) / zoom;
        const dy = (rects[i].top - last[i].top) / zoom;

        if (to === undefined) {
            // leaving: exactly where it is on screen, for good
            slot.style.transform = `translate(${dx}px, ${dy}px)`;
            slot.dataset.state = "leaving";
            return;
        }

        slot.dataset.ty = String(to);
        slot.dataset.state = "live";

        if (Math.abs(dx) < .01 && Math.abs(dy) < .01) {
            settle.push(slot);
        } else {
            slot.style.transform = `translate(${dx}px, ${to + dy}px)`;
            glide.push([slot, to]);
        }
    });

    // ---- Play
    if (glide.length > 0) {
        void box.offsetHeight; // the inverted positions must be applied before the transition is switched on again
    }
    settle.forEach((slot) => slot.style.transition = "");
    glide.forEach(([slot, to]) => {
        slot.style.transition = "";
        slot.style.transform = `translate(0px, ${to}px)`;
    });
}
