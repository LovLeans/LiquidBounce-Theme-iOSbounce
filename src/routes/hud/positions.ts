import {get, writable} from "svelte/store";
import {persistentDataLoaded, setItem} from "../../integration/persistent_storage";
import {getPersistentStorageItems} from "../../integration/rest";
import type {Alignment, HudComponent} from "../../integration/types";
import {OPTIONS_KEY, reloadOptions} from "./options";
import {
    adoptEnabled,
    freezeMissing,
    withAdded,
    withEnabled,
    type FrozenLayout,
    type StoredPositions
} from "./layout";

export {applyLayout, componentKeys, namesKeptOff} from "./layout";

/**
 * What the HUD editor decided, kept by the THEME.
 *
 * The client does not take it all (a theme loaded from the dev server is a temporary theme: the client keeps nothing for it and sends
 * the default components again), and while this theme shares its id with the built-in one there are TWO lists under that id: the one
 * the client pushes, the one a read returns, and they do not agree on which components are on, or where they are. Whichever of them
 * arrives last used to decide what was drawn, so components came and went by themselves.
 *
 * So the theme keeps the layout itself and draws that, whatever list it gets. Two things go through the theme's persistent storage
 * (`setItem`), which the client keeps, and every <Hud> (the in-game one and the editor's) puts them over the list it got:
 *
 *  - `hud-positions`: where the user dragged components to
 *  - `hud-layout`: on / off and position of every component, taken from the client's list the first time the editor sees it. After
 *    that only the user changes an entry (the [x], Add Component). The editor is the only page that writes it.
 *
 * Components are matched by name plus their number among components of that name (Image, Text can exist several times), not by id.
 */
const POSITIONS_KEY = "hud-positions";
const LAYOUT_KEY = "hud-layout";
// the options the user chose in a component's popover (options.ts) travel the same way: stored with the theme, shown by every <Hud>
const ALL_KEYS = [POSITIONS_KEY, LAYOUT_KEY, OPTIONS_KEY];

function readStored<T extends object>(key: string): T {
    try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : {};

        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {} as T;
    } catch {
        return {} as T;
    }
}

export const positions = writable<StoredPositions>(readStored(POSITIONS_KEY));
export const frozenLayout = writable<FrozenLayout>(readStored(LAYOUT_KEY));

export function reloadPositions(): void {
    positions.set(readStored(POSITIONS_KEY));
    frozenLayout.set(readStored(LAYOUT_KEY));
    reloadOptions();
}

// The persistent data is put into localStorage a moment after the page started, and another page (the editor while the in-game HUD
// is drawn, or the other way round) can change it later.
persistentDataLoaded.then(reloadPositions);
window.addEventListener("storage", event => {
    if (event.key === null || ALL_KEYS.includes(event.key)) {
        reloadPositions();
    }
});

/** Asks the client for the stored layout again (a page that was hidden while another one saved). */
export async function refreshPositionsFromClient(): Promise<void> {
    try {
        const items = await getPersistentStorageItems();
        let found = false;

        for (const item of items) {
            if (ALL_KEYS.includes(item.key)) {
                localStorage.setItem(item.key, item.value);
                found = true;
            }
        }

        if (found) {
            reloadPositions();
        }
    } catch (e) {
        console.warn("[Hud] could not read the stored positions", e);
    }
}

async function store(key: string, value: object): Promise<void> {
    try {
        await setItem(key, JSON.stringify(value));
    } catch (e) {
        console.warn("[Hud] could not store", key, e);
    }
}

async function setLayout(next: FrozenLayout): Promise<void> {
    if (next === get(frozenLayout)) {
        return;
    }

    frozenLayout.set(next);
    await store(LAYOUT_KEY, next);
}

export async function rememberPosition(key: string, alignment: Alignment): Promise<void> {
    const next: StoredPositions = {...get(positions), [key]: {...alignment}};
    positions.set(next);

    await store(POSITIONS_KEY, next);
}

/** The user switched this component on or off somewhere else than the HUD editor (the HUD module's Themes list in the ClickGUI). */
export function rememberEnabled(key: string, enabled: boolean): Promise<void> {
    return setLayout(withEnabled(get(frozenLayout), key, enabled));
}

/** A list the client PUSHED to the editor: components the theme has not seen before are taken over as they are. */
export function learnFromPush(list: HudComponent[]): Promise<void> {
    return setLayout(freezeMissing(get(frozenLayout), list));
}

/** The user removed this component (the [x] in the editor): it stays off, whatever the client says about it. */
export function rememberRemoved(key: string): Promise<void> {
    return setLayout(withEnabled(get(frozenLayout), key, false));
}

/** The user added a component of this name (Add Component): the lowest numbered one the theme kept off comes back. */
export function rememberAdded(name: string, singleton: boolean): Promise<void> {
    return setLayout(withAdded(get(frozenLayout), name, singleton));
}

/** After an add: what the client switched on (of these names) while the layout says off is on now. True when the layout changed. */
export function adoptAdded(list: HudComponent[], names: ReadonlySet<string>): boolean {
    const current = get(frozenLayout);
    const next = adoptEnabled(current, list, names);

    if (next === current) {
        return false;
    }

    void setLayout(next);
    return true;
}
