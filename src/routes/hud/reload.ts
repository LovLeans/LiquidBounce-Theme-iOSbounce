import {writable} from "svelte/store";

/**
 * Bump this to make every mounted <Hud> read its components from the client again.
 *
 * The HUD normally follows the client's `componentsUpdate` websocket event. The iOS HUD editor does not rely on that alone: after it
 * added or removed a component it asks for a reload here, so the result shows even if the event was late or never reached the page.
 */
export const hudReload = writable(0);

let addedAt = -Infinity;
let afterAddTimers: ReturnType<typeof setTimeout>[] = [];

/**
 * After an add the client does not always have the new component yet when the first read comes back (the POST is answered before the
 * component is in the list that a read returns). Text and Image, which only show up through a read, were then missing: nothing appeared,
 * and the second Add is what made the first one show (the two lay on top of each other). So an add is followed by a few more reads, until
 * the client has settled. Every read is forced (it takes over what was added, see Hud.svelte `loadComponents`), a newer add starts the
 * series again.
 */
const AFTER_ADD_READS_MS = [350, 900, 1800, 3200, 5000, 8000];

/** What the user asked Add Component for last, until the HUD has seen it show up (see Hud.svelte `reconcileAdd`). */
export interface PendingAdd {
    name: string;
    serial: number;
    at: number;
}

let pendingAdd: PendingAdd | undefined;
let addSerial = 0;
const PENDING_ADD_MS = 12000;

/** The add the HUD is still waiting for (the last one, while its reads are running). */
export function currentAdd(): PendingAdd | undefined {
    return pendingAdd && performance.now() - pendingAdd.at < PENDING_ADD_MS ? pendingAdd : undefined;
}

/** The add with this serial number has shown up (or was given up on): the HUD stops checking for it. */
export function finishAdd(serial: number): void {
    if (pendingAdd?.serial === serial) {
        pendingAdd = undefined;
    }
}

/** `afterAdd`: the reload is for a component the user just added (see `recentlyAdded`). `name`: which component it was. */
export function reloadHud(afterAdd = false, name?: string): void {
    if (afterAdd) {
        addedAt = performance.now();
        pendingAdd = name ? {name, serial: ++addSerial, at: addedAt} : undefined;
        afterAddTimers.forEach(clearTimeout);
        afterAddTimers = AFTER_ADD_READS_MS.map(ms => setTimeout(() => hudReload.update((n) => n + 1), ms));
    }

    hudReload.update((n) => n + 1);
}

/** The user added a component a moment ago: what the client switched on since then is the add, not something to switch off again. */
export function recentlyAdded(ms = 6000): boolean {
    return performance.now() - addedAt < ms;
}
