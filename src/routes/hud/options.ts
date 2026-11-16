// What the user chose in a component's options popover (HUD editor), kept by the HUD page itself.
//
// The client does not reliably hand the new option values back (neither its push nor a read shows them straight away, and a read can even
// still hold the OLD ones), so an option the user changed used to not show on the component. The popover knows exactly what was chosen:
// it tells the HUD here, and the HUD puts it over whatever list the client gave. Only the values of options the component's `settings`
// already has are touched (`enabled`, `alignment`, `zIndex` stay with the theme's layout, see layout.ts). Text / Image (several of the same
// name, own flow in Hud.svelte) are left alone.
//
// The choices are kept in the theme's persistent storage (`setItem`, like the positions in positions.ts), not only in this page's memory:
// the in-game HUD is another page than the editor, and the editor page is reloaded now and then, so a choice that lived only in memory was
// gone after the next reload (e.g. after the position of a component was changed and the GUI closed), and the in-game HUD never had it.
import {get, writable} from "svelte/store";
import {setItem} from "../../integration/persistent_storage";
import type {HudComponent} from "../../integration/types";

type Options = Record<string, Record<string, unknown>>;

export const OPTIONS_KEY = "hud-options";

function readStored(): Options {
    try {
        const raw = localStorage.getItem(OPTIONS_KEY);
        const parsed = raw ? JSON.parse(raw) : {};

        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

/** component name -> settings key -> value */
export const localOptions = writable<Options>(readStored());

/** Reads the stored choices again (the persistent data arrived, or another page saved something). Never writes. */
export function reloadOptions(): void {
    localOptions.set(readStored());
}

async function store(all: Options): Promise<void> {
    try {
        await setItem(OPTIONS_KEY, JSON.stringify(all));
    } catch (e) {
        console.warn("[Hud] could not store the component options", e);
    }
}

const SKIP = new Set(["enabled", "alignment", "zindex"]);
const MULTI_INSTANCE = new Set(["Text", "Image"]);

/** "Show Tags" -> "showTags", "Order" -> "order" (the keys of the component settings are the option names in camel case) */
export function settingKey(name: string): string {
    const words = name.trim().split(/[^A-Za-z0-9]+/).filter(Boolean);

    return words.map((w, i) => i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1)).join("");
}

function plain(v: unknown): boolean {
    return typeof v === "boolean" || typeof v === "number" || typeof v === "string"
        || (Array.isArray(v) && v.every(x => typeof x === "string"));
}

/** The simple options of a popover tree (switches, choices, numbers, text, string lists), by settings key. Groups, colours, curves... are skipped. */
export function optionsOfTree(tree: { value?: unknown } | null | undefined): Record<string, unknown> {
    const out: Record<string, unknown> = {};

    if (!tree || !Array.isArray(tree.value)) {
        return out;
    }

    for (const node of tree.value as Array<{ name?: unknown, value?: unknown }>) {
        if (!node || typeof node.name !== "string" || SKIP.has(node.name.toLowerCase().replace(/[^a-z]/g, ""))) {
            continue;
        }

        if (plain(node.value)) {
            out[settingKey(node.name)] = node.value;
        }
    }

    return out;
}

/**
 * The popover saved / changed something: the HUD shows it from now on, and keeps it.
 *
 * `before` is the tree as it was before the change. With it only what the user changed is taken (plus what was taken earlier, so a
 * switch turned back to its old value is updated too); the other options of the tree may hold values the client had read at some point,
 * and since the choices are stored now, those must not become "chosen" just because another option was touched.
 */
export function rememberOptions(
    componentName: string,
    tree: { value?: unknown } | null | undefined,
    before?: { value?: unknown } | null
): void {
    if (MULTI_INSTANCE.has(componentName)) {
        return;
    }

    let options = optionsOfTree(tree);

    if (before) {
        const old = optionsOfTree(before);
        const known = get(localOptions)[componentName] ?? {};

        options = Object.fromEntries(Object.entries(options)
            .filter(([key, value]) => key in known || JSON.stringify(old[key]) !== JSON.stringify(value)));
    }

    if (Object.keys(options).length === 0) {
        return;
    }

    const next = {...get(localOptions), [componentName]: {...get(localOptions)[componentName], ...options}};
    localOptions.set(next);
    void store(next);
}

/**
 * The tree the client gave a popover, with the user's stored choices put into it (in place). The client keeps nothing for this theme and can
 * hand back old or default values, which the popover then showed as if the choice had been lost. True when something was changed, i.e. when
 * the client does not have the user's choices either.
 */
export function applyOptionsToTree(componentName: string, tree: { value?: unknown } | null | undefined): boolean {
    const wanted = get(localOptions)[componentName];

    if (!wanted || !tree || !Array.isArray(tree.value)) {
        return false;
    }

    let changed = false;

    for (const node of tree.value as Array<{ name?: unknown, value?: unknown }>) {
        if (!node || typeof node.name !== "string" || SKIP.has(node.name.toLowerCase().replace(/[^a-z]/g, ""))) {
            continue;
        }

        const key = settingKey(node.name);

        if (key in wanted && plain(node.value) && JSON.stringify(node.value) !== JSON.stringify(wanted[key])) {
            node.value = wanted[key];
            changed = true;
        }
    }

    return changed;
}

/** The list with the user's choices over it. A component that already shows them is returned as it is (same object). */
export function withLocalOptions(list: HudComponent[], all: Record<string, Record<string, unknown>>): HudComponent[] {
    if (Object.keys(all).length === 0) {
        return list;
    }

    return list.map(c => {
        const wanted = all[c.name];

        if (!c.settings || !wanted) {
            return c;
        }

        let settings: Record<string, any> | undefined;

        for (const [key, value] of Object.entries(wanted)) {
            // also a key the client's list does not carry (a pushed list can hold fewer settings than a read): the choice is the
            // component's own option, it was made in its own popover
            if (!SKIP.has(key.toLowerCase()) && JSON.stringify(c.settings[key]) !== JSON.stringify(value)) {
                settings ??= {...c.settings};
                settings[key] = value;
            }
        }

        return settings ? {...c, settings} : c;
    });
}
