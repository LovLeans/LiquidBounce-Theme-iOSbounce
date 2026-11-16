import {get} from "svelte/store";
import {getComponentSettings, setComponentSettings} from "../../integration/rest";
import type {HudComponent} from "../../integration/types";
import {clientMismatches, nameOfKey, type FrozenLayout} from "./layout";
import {frozenLayout} from "./positions";
import {currentAdd, reloadHud} from "./reload";

/**
 * Tells the client what the theme's layout says is on. The theme draws its own layout whatever the client's lists say (see
 * positions.ts), but the client switches vanilla HUD parts off by the state IT has (an enabled Hotbar hides the vanilla hotbar,
 * Effects the effect icons, Scoreboard the scoreboard, ...). A component the theme hid without the client taking it left the vanilla part
 * hidden too. So every list that comes in is compared with the layout, and the difference is sent to the client.
 */
const RETRY_AFTER_MS = 8000;
const MAX_FAILURES = 3;

const asked = new Map<string, { enabled: boolean, at: number, failures: number }>();

// The component's own "Enabled" switch (the first setting; found by name first), same as the HUD editor's popover does.
const enabledOf = (cfg: any) => cfg && Array.isArray(cfg.value)
    ? cfg.value.find((x: any) => x && typeof x.name === "string" && x.name.toLowerCase() === "enabled" && "value" in x) ?? cfg.value[0]
    : null;

async function tell(id: string, enabled: boolean): Promise<void> {
    const cfg: any = await getComponentSettings(id);
    const sw = enabledOf(cfg);

    if (!sw || sw.value === enabled) {
        return;
    }

    sw.value = enabled;
    // without the alignment, like the popover: the position the client has must not be overwritten with an older one
    cfg.value = cfg.value.filter((x: any) => x.name !== "Alignment");
    await setComponentSettings(id, cfg);
}

export function syncClientToLayout(list: HudComponent[], frozen: FrozenLayout = get(frozenLayout)): void {
    const now = performance.now();

    // The component the user is adding right now: the client switches it ON, and until the layout has taken that over (Hud.svelte) it
    // must not be told to switch it OFF again, or the add is undone before it shows.
    const adding = currentAdd()?.name;

    for (const {key, id, enabled} of clientMismatches(list, frozen)) {
        if (adding !== undefined && !enabled && nameOfKey(key) === adding) {
            continue;
        }

        const before = asked.get(key);

        if (before && before.enabled === enabled && (before.failures >= MAX_FAILURES || now - before.at < RETRY_AFTER_MS)) {
            continue;
        }

        const entry = {enabled, at: now, failures: before?.enabled === enabled ? before.failures : 0};
        asked.set(key, entry);

        tell(id, enabled).catch(e => {
            entry.failures++;
            entry.at = -Infinity; // a failed try may be repeated at once
            console.warn(`[Hud] could not tell the client that ${key} is ${enabled ? "on" : "off"} (try ${entry.failures})`, e);

            // the id may be an old one (the client hands out new ones): read the list again, that checks it again with the new ids
            if (entry.failures < MAX_FAILURES) {
                setTimeout(reloadHud, 1500 * entry.failures);
            }
        });
    }
}
