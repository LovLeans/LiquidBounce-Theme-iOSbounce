/**
 * The HUD module's "Themes" list in the ClickGUI (Themes > <theme> > Components > Watermark > Enabled / Alignment / ...) changes the CLIENT's
 * settings of the components. The theme does not draw the client's state but its own layout (hud/positions.ts: on / off, positions and
 * options the user chose are kept by the theme and put over whatever the client says, and the client is even told to follow the layout), so
 * a change made there was thrown away again and nothing on screen changed.
 *
 * This looks at what changed between the tree that was saved last and the one that is being saved now, and tells the theme about it the same
 * way the HUD editor does: Enabled -> the layout, Alignment -> the stored positions, every other simple option -> the stored options.
 * Only what the user changed is taken over (the rest of the tree may hold values the client has not got right).
 */
import {rememberEnabled, rememberPosition} from "../hud/positions";
import {rememberOptions} from "../hud/options";

type Node = { name?: string, valueType?: string, value?: any, choices?: any, active?: string };

const isNode = (x: any): x is Node => !!x && typeof x === "object" && typeof x.name === "string";
const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The settings under a node: a group's list, or the settings of every mode of a choice. */
function kids(node: Node | undefined): Node[] {
    if (!node) return [];
    if (Array.isArray(node.value)) return node.value.filter(isNode);
    if (node.choices && typeof node.choices === "object" && !Array.isArray(node.choices)) {
        return Object.entries(node.choices).map(([name, c]: [string, any]) => ({...c, name: c?.name ?? name}));
    }
    return [];
}

/** The node of `list` that matches `node`: the one with the same name (the n-th of that name), else the one at the same place. */
function counterpart(list: Node[], node: Node, index: number, list2: Node[]): Node | undefined {
    const nth = list2.slice(0, index).filter(k => k.name === node.name).length;
    return list.filter(k => k.name === node.name)[nth] ?? (list[index]?.name === node.name ? list[index] : undefined);
}

const valueOf = (n: Node | undefined) => (n && typeof n.active === "string" ? n.active : n?.value);

/** The Enabled switch of a component: a setting called Enabled, else the first one (a toggleable group keeps it there). */
function enabledNode(component: Node): Node | undefined {
    const list = kids(component);
    return list.find(k => norm(k.name) === "enabled" && typeof k.value === "boolean")
        ?? (component.valueType === "TOGGLEABLE" && Array.isArray(component.value) && typeof component.value[0]?.value === "boolean" ? component.value[0] : undefined);
}

function alignmentOf(component: Node): Record<string, any> | undefined {
    const group = kids(component).find(k => norm(k.name) === "alignment");
    if (!group) return undefined;

    const out: Record<string, any> = {};
    for (const k of kids(group)) {
        const n = norm(k.name);
        const v = valueOf(k);
        if (n.includes("horiz")) out[n.includes("offset") ? "horizontalOffset" : "horizontalAlignment"] = v;
        else if (n.includes("vert")) out[n.includes("offset") ? "verticalOffset" : "verticalAlignment"] = v;
    }

    const ok = typeof out.horizontalAlignment === "string" && typeof out.verticalAlignment === "string"
        && typeof out.horizontalOffset === "number" && typeof out.verticalOffset === "number";
    return ok ? out : undefined;
}

function component(old: Node, next: Node, key: string): void {
    const oe = enabledNode(old), ne = enabledNode(next);
    if (oe && ne && oe.value !== ne.value) void rememberEnabled(key, !!ne.value);

    const oa = alignmentOf(old), na = alignmentOf(next);
    if (na && !same(oa, na)) void rememberPosition(key, na as any);

    // every other simple option (Show Tags, Order, ...): `rememberOptions` skips Enabled / Alignment itself, and takes only what changed
    const name = String(next.name);
    const plainTree = (n: Node) => ({value: kids(n).filter(k => norm(k.name) !== "alignment")});
    rememberOptions(name, plainTree(next), plainTree(old));
}

/** `old`: the setting as it was saved last, `next`: as it is now (the same setting of the HUD module, both whole trees). */
export function applyThemeComponentChanges(old: Node | undefined, next: Node | undefined): void {
    if (!old || !next) return;

    const walk = (o: Node, n: Node, depth: number) => {
        const nk = kids(n), ok = kids(o);

        if (norm(n.name) === "components") {
            nk.forEach((c, i) => {
                const oc = counterpart(ok, c, i, nk);
                if (!oc) return;
                const key = `${c.name}:${nk.slice(0, i).filter(k => k.name === c.name).length}`;
                component(oc, c, key);
            });
            return;
        }

        if (depth > 8) return;
        nk.forEach((c, i) => {
            const oc = counterpart(ok, c, i, nk);
            if (oc) walk(oc, c, depth + 1);
        });
    };

    try {
        walk(old, next, 0);
    } catch (e) {
        console.warn("[ios-clickgui] could not pass the component settings on to the theme", e);
    }
}
