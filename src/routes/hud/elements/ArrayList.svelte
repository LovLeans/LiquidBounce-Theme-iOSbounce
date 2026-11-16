<script lang="ts">
    import {afterUpdate, onDestroy, onMount, tick} from "svelte";
    import type {Module} from "../../../integration/types";
    import {getModules} from "../../../integration/rest";
    import {listenSticky} from "../../../integration/ws";
    import {getTextWidth} from "../../../integration/text_measurement";
    import {rowMotion, type RowSide} from "../motion";
    import SwapText from "./SwapText.svelte";
    import {layoutRows} from "./arraylist/rowLayout";
    import {convertToSpacedString, spaceSeperatedNames} from "../../../theme/theme_config";
    import type {HudArrayListSettings} from "../components";

    export let settings: { [name: string]: any };

    let cSettings = settings as HudArrayListSettings;

    /** a module in the list; the key is unique per row (a module that is switched off and on again while its old row is still leaving gets a new one) */
    interface Row {
        key: number;
        name: string;
        tag: string | null | undefined;
        /** place in the list (0 = top) */
        rank: number;
        /** playing its exit: no longer part of the layout, removed when the exit is over */
        leaving: boolean;
    }

    // Rows stay in the order they ARRIVED in, whatever the sort order is: the DOM is never reordered (a browser drops the running
    // transition of a moved element) and rowLayout.ts puts the rows in order with `rank`. Leaving rows stay here until their exit is over.
    let rows: Row[] = [];
    let box: HTMLElement;
    let nextKey = 0;

    // How long a leaving row stays in the DOM: its exit (motion.ts, 240 ms) plus a margin. A timer on purpose: an exit that waits for an
    // animation to report that it ended stayed on screen for good whenever the page was not painted.
    const LEAVE_MS = 280;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    $: side = (cSettings.itemAlignment === "Left" ? "left" : "right") as RowSide;

    // Several refreshes can be out at once (toggle, tag change, setting change); only the newest one may write the list, otherwise a slow
    // older answer put an outdated list (and its tags) back on screen.
    let updateSequence = 0;
    let destroyed = false;

    async function updateEnabledModules() {
        const sequence = ++updateSequence;
        const modules = await getModules();

        if (destroyed || sequence !== updateSequence) {
            return;
        }

        const visibleModules = modules.filter(m => m.enabled && !m.hidden);

        const modulesWithWidths = visibleModules.map(module => {
            const formattedName = $spaceSeperatedNames ? convertToSpacedString(module.name) : module.name;
            const fullName = module.tag == null || !cSettings.showTags
                ? formattedName
                : formattedName + " " + module.tag;

            return {
                ...module,
                width: getTextWidth(fullName, "600 13px Inter")
            };
        });

        modulesWithWidths.sort((a, b) => cSettings.order === "Ascending" ? a.width - b.width : b.width - a.width);

        applyModules(modulesWithWidths);
        await tick();
    }

    // Brings `rows` in line with the sorted list of enabled modules: rows that are still enabled keep their element (and so their place and
    // motion), rows that are gone start leaving, modules that are new get a row at the end of the array.
    function applyModules(sorted: Module[]) {
        const rankOf = new Map(sorted.map((module, index) => [module.name, index] as const));
        const known = new Set<string>();
        const next: Row[] = [];

        for (const row of rows) {
            if (row.leaving) {
                next.push(row);
            } else if (rankOf.has(row.name)) {
                known.add(row.name);
                next.push({...row, tag: sorted[rankOf.get(row.name)!].tag, rank: rankOf.get(row.name)!});
            } else {
                next.push({...row, leaving: true});
                later(LEAVE_MS, () => rows = rows.filter((r) => r.key !== row.key));
            }
        }

        sorted.forEach((module, index) => {
            if (!known.has(module.name)) {
                next.push({key: ++nextKey, name: module.name, tag: module.tag, rank: index, leaving: false});
            }
        });

        rows = next;
    }

    function later(ms: number, action: () => void) {
        const timer = setTimeout(() => {
            timers.delete(timer);
            action();
        }, ms);
        timers.add(timer);
    }

    // The rows are laid out by hand (rowLayout.ts) after every change of the list ...
    afterUpdate(() => {
        if (box) layoutRows(box);
    });

    // ... and again when a row changes its width without the list changing (the font arriving, a tag changing its length).
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
        if (box) layoutRows(box);
    });

    function observe(node: HTMLElement) {
        resizeObserver?.observe(node);
        return {
            destroy() {
                resizeObserver?.unobserve(node);
            }
        };
    }

    $: if (cSettings !== settings) {
        cSettings = settings as HudArrayListSettings;
        updateEnabledModules();
    }

    // The subscription used to be never released: every ArrayList that was ever created kept fetching the modules for good.
    const stopSpaceSeperatedNames = spaceSeperatedNames.subscribe(async () => {
        await updateEnabledModules();
    });

    onDestroy(() => {
        destroyed = true;
        stopSpaceSeperatedNames();
        timers.forEach(clearTimeout);
        resizeObserver?.disconnect();
    });

    onMount(async () => {
        await updateEnabledModules();
    });

    // Sticky: the router's cleanupListeners() wipes plain `listen` handlers on every route change, and the list then stopped following
    // the client (same reason as in Hud.svelte).
    listenSticky("moduleToggle", async () => {
        await updateEnabledModules();
    });

    listenSticky("refreshArrayList", async () => {
        await updateEnabledModules();
    });
</script>

<!-- Every row is a `slot` that rowLayout.ts places (and sizes the box for) and a `module` that plays the entrance / exit (motion.ts `rowMotion`).
     Two elements because they use `transform` for different things: the slot for where the row is in the list, the module for its own
     entrance / exit. There is no `animate:`, `in:` or `out:` here on purpose, see rowLayout.ts. -->
<div class="arraylist" bind:this={box}>
    {#each rows as row (row.key)}
        <div
                class="slot"
                class:right={side === "right"}
                data-rank={row.rank}
                data-leaving={row.leaving ? "" : null}
                use:observe
        >
            <div class="module" class:right={side === "right"} use:rowMotion={{leaving: row.leaving, side}}>
                <i class="dot"></i>
                <span class="label">
                    {$spaceSeperatedNames ? convertToSpacedString(row.name) : row.name}
                    {#if row.tag && cSettings.showTags}
                        <span class="tag"><SwapText text={row.tag} origin={side === "right" ? "100% 50%" : "0% 50%"}/></span>
                    {/if}
                </span>
            </div>
        </div>
    {/each}
</div>

<style lang="scss">
  @use "../glass" as *;

  // iOS: every enabled module is a small glass capsule. The accent dot sits on the outer edge (the side the list is aligned to),
  // where the old 4px accent border was.
  // The box is as wide as the widest live row and as high as the live rows (rowLayout.ts sets both); the slots are placed inside it.
  .arraylist {
    position: relative;
  }

  // Where a slot goes when the list changes (rowLayout.ts sets `transform`): a spring with ~9 % overshoot, so the other rows jiggle a
  // little when one comes or goes. The first declaration is the fallback for a browser without `linear()`.
  .slot {
    position: absolute;
    top: 0;
    left: 0;
    width: max-content;
    transition: transform .55s cubic-bezier(.3, 1.4, .5, 1);
    transition: transform .62s linear(0, 0.0235, 0.0854, 0.1737, 0.2781, 0.39, 0.5027, 0.6109, 0.7108, 0.7999, 0.8767, 0.9407, 0.9921, 1.0316, 1.0602, 1.0793, 1.0903, 1.0946, 1.0936, 1.0886, 1.0808, 1.0713, 1.0608, 1.0501, 1.0397, 1.03, 1.0212, 1.0136, 1.0072, 1.002, 0.9979, 0.995, 0.9929, 0.9917, 0.9911, 0.9911, 0.9914, 0.9921, 0.993, 0.994, 0.995, 0.996, 0.9969, 0.9978, 1);
    will-change: transform;

    &.right {
      left: auto;
      right: 0;
    }
  }

  .module {
    @include hud-glass(13px, var(--arraylist-background-color), var(--hud-shadow-sm), false);

    display: flex;
    align-items: center;
    gap: 8px;
    width: max-content;
    height: 26px;
    padding: 0 12px 0 10px;
    color: var(--arraylist-text-color);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: -.01em;
    white-space: nowrap;

    &.right {
      padding: 0 10px 0 12px;

      .dot {
        order: 1;
      }
    }
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--arraylist-border-color);
    box-shadow: 0 0 6px color-mix(in srgb, var(--arraylist-border-color) 70%, transparent);
  }

  .tag {
    margin-left: 3px;
    color: var(--arraylist-tag-color);
    font-weight: 500;
  }
</style>
