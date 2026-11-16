// Pure helpers behind positions.ts (no imports from the client, so they can be tested on their own).
import type {Alignment, HudComponent} from "../../integration/types";

/** `Name:n`: the name, and which one of that name it is in the list. The client's ids do not hold still, this does. */
export function componentKeys(list: HudComponent[]): string[] {
    const seen = new Map<string, number>();

    return list.map(c => {
        const n = seen.get(c.name) ?? 0;
        seen.set(c.name, n + 1);
        return `${c.name}:${n}`;
    });
}

export function nameOfKey(key: string): string {
    return key.slice(0, key.lastIndexOf(":"));
}

function indexOfKey(key: string): number {
    return Number(key.slice(key.lastIndexOf(":") + 1));
}

/** Where the user dragged components to. */
export type StoredPositions = Record<string, Alignment>;

/**
 * What the THEME decided about each component: on or off, and where. Once a component is in here, no list from the client (a read, a
 * push, the other theme's list under the same id) changes it any more, only the user does, in the HUD editor.
 */
export type FrozenLayout = Record<string, { enabled: boolean, alignment?: Alignment }>;

export function sameAlignment(a: Alignment | undefined, b: Alignment | undefined): boolean {
    return !!a && !!b
        && a.horizontalAlignment === b.horizontalAlignment
        && a.verticalAlignment === b.verticalAlignment
        && Math.round(a.horizontalOffset) === Math.round(b.horizontalOffset)
        && Math.round(a.verticalOffset) === Math.round(b.verticalOffset);
}

/**
 * The list with the theme's own memory put over it: first what is frozen (on / off, position), then the positions the user dragged the
 * components to. Components without anything stored are returned as they are, except with `hideUnknown`: then they are switched off.
 * That is for a list that was only READ (the client has not pushed to this page yet): a read can be the other list, so a component the
 * theme has never seen in a push is not drawn until the push has said what it is.
 */
export function applyLayout(list: HudComponent[], sources: { positions: StoredPositions, frozen: FrozenLayout, hideUnknown?: boolean }): HudComponent[] {
    const keys = componentKeys(list);

    return list.map((c, i) => {
        if (!c.settings) {
            return c;
        }

        const key = keys[i];
        let settings = c.settings;

        const frozen = sources.frozen[key];
        if (!frozen && sources.hideUnknown && settings.enabled) {
            settings = {...settings, enabled: false};
        }

        if (frozen) {
            if (frozen.enabled !== !!settings.enabled) {
                settings = {...settings, enabled: frozen.enabled};
            }

            if (frozen.alignment && !sameAlignment(frozen.alignment, settings.alignment)) {
                settings = {...settings, alignment: {...frozen.alignment}};
            }
        }

        const position = sources.positions[key];
        if (position && !sameAlignment(position, settings.alignment)) {
            settings = {...settings, alignment: {...position}};
        }

        return settings === c.settings ? c : {...c, settings};
    });
}

/**
 * Adds an entry for every component of the list that has none yet. Entries that exist are never touched. Returns the same object when
 * nothing was missing.
 */
export function freezeMissing(frozen: FrozenLayout, list: HudComponent[]): FrozenLayout {
    const keys = componentKeys(list);
    let next: FrozenLayout | undefined;

    list.forEach((c, i) => {
        if (!c.settings || keys[i] in frozen) {
            return;
        }

        next ??= {...frozen};
        const alignment: Alignment | undefined = c.settings.alignment;
        next[keys[i]] = alignment ? {enabled: !!c.settings.enabled, alignment: {...alignment}} : {enabled: !!c.settings.enabled};
    });

    return next ?? frozen;
}

/** The user switched this component off (or on): only this one entry changes. */
export function withEnabled(frozen: FrozenLayout, key: string, enabled: boolean): FrozenLayout {
    return {...frozen, [key]: {...frozen[key], enabled}};
}

/**
 * The user added a component of this name. The lowest numbered one the theme keeps off is the one that comes back. A component that can
 * exist once is simply switched on. One that can exist several times (Text, Image) is handed back to the client instead: it may have
 * switched that one on, or made a new one, and either way it shows.
 */
export function withAdded(frozen: FrozenLayout, name: string, singleton: boolean): FrozenLayout {
    const key = Object.keys(frozen)
        .filter(k => nameOfKey(k) === name && !frozen[k].enabled)
        .sort((a, b) => indexOfKey(a) - indexOfKey(b))[0];

    if (key === undefined) {
        return frozen;
    }

    if (singleton) {
        return withEnabled(frozen, key, true);
    }

    const next = {...frozen};
    delete next[key];
    return next;
}

/** Names of which the theme keeps at least one component off. */
export function namesKeptOff(frozen: FrozenLayout): Set<string> {
    return new Set(Object.keys(frozen).filter(k => !frozen[k].enabled).map(nameOfKey));
}

/**
 * Components of this list whose on / off state in the CLIENT is not what the theme's layout says. The client hides parts of the vanilla
 * HUD by the state it has (an enabled Hotbar hides the vanilla hotbar, status bar and XP bar, Effects the effect icons, Scoreboard the
 * scoreboard, ...), so a component the theme only hides itself leaves its vanilla part hidden as well: nothing is drawn at all.
 */
export function clientMismatches(list: HudComponent[], frozen: FrozenLayout): { key: string, id: string, enabled: boolean }[] {
    const keys = componentKeys(list);
    const mismatches: { key: string, id: string, enabled: boolean }[] = [];

    list.forEach((c, i) => {
        const entry = frozen[keys[i]];

        if (c.settings && entry && entry.enabled !== !!c.settings.enabled) {
            mismatches.push({key: keys[i], id: c.id, enabled: entry.enabled});
        }
    });

    return mismatches;
}

/**
 * The user just added a component, and the client switched one of these names ON while the theme's layout still says it is off (the
 * layout was frozen from a list that did not have the add yet). The client's state is the newer one: the layout takes it over, instead
 * of telling the client to switch the component off again. Returns the same object when nothing differs.
 */
export function adoptEnabled(frozen: FrozenLayout, list: HudComponent[], names: ReadonlySet<string>): FrozenLayout {
    const keys = componentKeys(list);
    let next: FrozenLayout | undefined;

    list.forEach((c, i) => {
        const entry = frozen[keys[i]];

        if (!c.settings || !names.has(c.name) || !entry || entry.enabled || !c.settings.enabled) {
            return;
        }

        next ??= {...frozen};
        const alignment: Alignment | undefined = c.settings.alignment;
        next[keys[i]] = alignment ? {enabled: true, alignment: {...alignment}} : {enabled: true};
    });

    return next ?? frozen;
}

/**
 * What the HUD editor expects of an Add: one more component of this name is drawn afterwards than before. `shownBefore` / `totalBefore`
 * are counted when the add was asked for (drawn ones / all of that name in the list then), `at` is that moment.
 */
export interface AddCheck {
    name: string;
    shownBefore: number;
    totalBefore: number;
    at: number;
}

/** How many components of this name the layout draws: what it says about them, and for one it does not know yet what the list says (unless `hideUnknown`). */
export function shownCount(list: HudComponent[], frozen: FrozenLayout, name: string, hideUnknown = false): number {
    const keys = componentKeys(list);

    return list.filter((c, i) => c.name === name && c.settings && (frozen[keys[i]] ? frozen[keys[i]].enabled : !hideUnknown && !!c.settings.enabled)).length;
}

/**
 * Did the Add show up? `list` is a read of the client (after the layout learned it, so every component has an entry). A component of the
 * name that the layout keeps hidden although the user just asked for one is the add: the client may have made it switched off, the layout
 * may hold an older answer for the same `Name:n`, or the client may have switched an old one on instead of making a new one. Then the
 * add is shown: `key` is the entry to switch on (the client is told by syncClientToLayout). A new-looking one (numbered after the ones
 * that were there before) is taken at once; an older hidden one only after `oldAfterMs` (the first read after the one that came with the add: the client has
 * answered by then; with nothing new in it, it did not make one, it only had old switched-off ones), so a new one that the client is slow
 * with is not joined by a second one. Neither `done` nor `key`: nothing to show yet, read again.
 */
export function decideAdd(list: HudComponent[], frozen: FrozenLayout, check: AddCheck, ageMs: number, oldAfterMs = 300): { done: boolean, key?: string } {
    const keys = componentKeys(list);
    const all = list
        .map((c, i) => ({c, key: keys[i], n: indexOfKey(keys[i])}))
        .filter(x => x.c.name === check.name && x.c.settings);
    const shown = (x: typeof all[number]) => frozen[x.key] ? frozen[x.key].enabled : !!x.c.settings.enabled;

    if (all.filter(shown).length > check.shownBefore) {
        return {done: true};
    }

    const hidden = all.filter(x => !shown(x));
    const fresh = hidden.find(x => x.n >= check.totalBefore);

    if (fresh) {
        return {done: false, key: fresh.key};
    }

    if (ageMs >= oldAfterMs) {
        const old = hidden.find(x => x.c.settings.enabled) ?? hidden[0];

        if (old) {
            return {done: false, key: old.key};
        }
    }

    return {done: false};
}
