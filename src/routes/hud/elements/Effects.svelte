<script lang="ts">
    import {afterUpdate, onDestroy} from "svelte";
    import {listenSticky} from "../../../integration/ws";
    import type {ClientPlayerDataEvent, ClientPlayerEffectEvent} from "../../../integration/events";
    import type {StatusEffect} from "../../../integration/types";
    import {effectTextureUrl} from "../../../integration/rest";
    import {
        cardMotion,
        CARD_OUT_MS,
        type CardSize,
        EFFECT_ROW_LEAVE_MS,
        effectRowMotion,
        sizeMorph
    } from "../motion";
    import SwapText from "./SwapText.svelte";
    // the rows are stacked by the same hand-made FLIP layout as the array list (the effects are a list whose rows come and go too)
    import {layoutRows} from "./arraylist/rowLayout";

    /** a row of the card; the key is unique per row (an effect that ends and comes back while its old row is still leaving gets a new one) */
    interface Row {
        key: number;
        effect: StatusEffect;
        /** place on the card (0 = top) */
        rank: number;
        /** playing its exit: no longer part of the layout, removed when the exit is over */
        leaving: boolean;
        /** ms before the entrance of the row; null: none, the card's own entrance shows it */
        delay: number | null;
    }

    // Rows stay in the order they ARRIVED in, whatever their rank is: the DOM is never reordered (a browser drops the running transition
    // of a moved element) and layoutRows puts them in order with `rank`.
    let rows: Row[] = [];
    let box: HTMLElement;
    let nextKey = 0;

    // in the DOM: from the first effect until the exit of the card is over (a timer removes it, `cardMotion` plays the entrance / exit,
    // as in BlockCounter.svelte)
    let mounted = false;
    // false while the card is closing: the rows stay as they were until it is gone
    let open = false;
    // the size the card morphs to (`sizeMorph`); set from the layout of the rows
    let cardSize: CardSize | undefined = undefined;

    const PAD = 4; // the padding of the card (.rows is inset by it)
    /** how deep the digits dip when the time ticks down (1 = the full dip of a number; lower it if the once-a-second tick is too much) */
    const TIMER_INTENSITY = 1;
    /** pause before the rows of a new effect pop in: the card has started to grow by then */
    const ROW_LEAD_MS = 45;
    /** pause between rows that arrive together, so that they cascade */
    const ROW_STAGGER_MS = 55;
    /** several effects at once: the first one is shown with the entrance of the card, the others follow after this beat, while it is still opening */
    const FIRST_BEAT_MS = 60;

    let latest: StatusEffect[] = [];
    let beat: ReturnType<typeof setTimeout> | undefined;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    function later(ms: number, action: () => void) {
        const timer = setTimeout(() => {
            timers.delete(timer);
            action();
        }, ms);
        timers.add(timer);
    }

    function onEffects(list: StatusEffect[]) {
        // one row per effect
        latest = list.filter((e, i) => list.findIndex((other) => other.effect === e.effect) === i);

        // the first beat is running: it reads `latest` when it is over
        if (beat !== undefined) return;

        if (!mounted && latest.length > 1) {
            // First effect, with the entrance of the card ...
            show([latest[0]], 0);
            // ... the rest a moment later, WHILE the card is still opening: the card morphs open (jiggling) and the rows pop in
            beat = setTimeout(() => {
                beat = undefined;
                show(latest, 0);
            }, FIRST_BEAT_MS);
            return;
        }

        show(latest, ROW_LEAD_MS);
    }

    // Brings the card in line with the list: rows that are still there keep their element (and so their place and motion), rows that
    // are gone start leaving, effects that are new get a row at the end of the array. The card opens with the first effect and closes
    // with the last one.
    function show(list: StatusEffect[], lead: number) {
        clearTimeout(closeTimer);

        if (list.length === 0) {
            if (open) {
                // no effect left: the card closes with what is on it, then it is gone
                open = false;
                closeTimer = setTimeout(() => {
                    mounted = false;
                    rows = [];
                    cardSize = undefined;
                    signature = "";
                }, CARD_OUT_MS + 60);
            }
            return;
        }

        const first = !mounted;
        const rankOf = new Map(list.map((e, i) => [e.effect, i] as const));
        const known = new Set<string>();
        const next: Row[] = [];

        for (const row of rows) {
            if (row.leaving) {
                next.push(row);
            } else if (rankOf.has(row.effect.effect)) {
                const rank = rankOf.get(row.effect.effect)!;
                known.add(row.effect.effect);
                next.push({...row, effect: list[rank], rank});
            } else {
                next.push({...row, leaving: true});
                later(EFFECT_ROW_LEAVE_MS, () => rows = rows.filter((r) => r.key !== row.key));
            }
        }

        let added = 0;
        list.forEach((effect, rank) => {
            if (known.has(effect.effect)) return;

            next.push({
                key: ++nextKey,
                effect,
                rank,
                leaving: false,
                delay: first && rank === 0 ? null : lead + added++ * ROW_STAGGER_MS
            });
        });

        rows = next;
        mounted = true;
        open = true;
    }

    listenSticky("clientPlayerData", (event: ClientPlayerDataEvent) => {
        onEffects(event.playerData.effects);
    });

    listenSticky("clientPlayerEffect", (event: ClientPlayerEffectEvent) => {
        onEffects(event.effects);
    });

    // ---- layout of the card ----
    //
    // layoutRows (rowLayout.ts) places the rows and works out how big `.rows` has to be (the widest live row x the live rows); the card is
    // that size plus its padding. The card does not take the new size at once: `sizeMorph` morphs it there. Between layouts the rows are
    // as wide as the card is RIGHT NOW (`--slot-w`, see the style), so while it morphs the times stay on its right edge.

    function relayout() {
        if (!box) return;

        // the rows at their natural width, to find out how wide the widest one is ...
        box.style.setProperty("--slot-w", "max-content");
        layoutRows(box, 0);
        box.style.removeProperty("--slot-w");

        // ... layoutRows keeps the size it worked out (it does not touch it when nothing changed); `.rows` itself follows the card
        box.style.width = "";
        box.style.height = "";
        const [width, height] = (box.dataset.size ?? "0x0").split("x").map(Number);

        if (width > 0 && height > 0) {
            const w = width + PAD * 2;
            const h = height + PAD * 2;
            if (!cardSize || cardSize.width !== w || cardSize.height !== h) {
                cardSize = {width: w, height: h};
            }
        }
    }

    // What decides the layout: which rows there are, in which place, and what is written on them (the time ticking down changes nothing).
    let signature = "";

    afterUpdate(() => {
        if (!mounted || !box) return;

        const next = rows
            .map((r) => `${r.key}:${r.rank}:${r.leaving}:${r.effect.localizedName}:${r.effect.amplifier}`)
            .join("|");
        if (next === signature) return;

        signature = next;
        relayout();
    });

    // A row can change its natural width without the list changing (the font arriving, a longer level). The name and the time are observed,
    // not the slot: their size does not depend on the card, the size of the slot does (it follows the card while it morphs).
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => relayout());

    function observe(node: HTMLElement) {
        resizeObserver?.observe(node);
        return {
            destroy() {
                resizeObserver?.unobserve(node);
            }
        };
    }

    onDestroy(() => {
        clearTimeout(beat);
        clearTimeout(closeTimer);
        timers.forEach(clearTimeout);
        resizeObserver?.disconnect();
    });

    function formatTime(duration: number): string {
        if (duration === -1) {
            return "\u221e";
        }

        const totalSeconds = Math.floor(duration / 20);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    }

    function formatAmplifier(n: number): string {
        return (n + 1).toString();
    }
</script>

<!-- The card (`cardMotion`: expands in place for the first effect, closes with the last one; `sizeMorph`: morphs to the size of its rows).
     Every row is a `slot` that layoutRows places and a `effect` that plays its own entrance / exit (`effectRowMotion`): two elements because
     they use `transform` for different things. As in ArrayList.svelte there is no `animate:`, `in:` or `out:`, see rowLayout.ts. -->
{#if mounted}
    <div class="effects" use:cardMotion={{leaving: !open}} use:sizeMorph={cardSize}>
        <div class="rows" bind:this={box}>
            {#each rows as row (row.key)}
                <div
                        class="slot"
                        data-rank={row.rank}
                        data-leaving={row.leaving ? "" : null}
                >
                    <div class="effect" class:sep={row.rank > 0}
                         use:effectRowMotion={{leaving: row.leaving, delay: row.delay}}>
                        <span class="icon"><img class="effect-icon" src={effectTextureUrl(row.effect.effect)}
                                                alt={row.effect.localizedName}/></span>
                        <span class="name" use:observe>{row.effect.localizedName}<span
                                class="amplifier"><SwapText text={formatAmplifier(row.effect.amplifier)}/></span></span>
                        <span class="duration" use:observe
                              class:expiring={row.effect.duration !== -1 && row.effect.duration < 200}><SwapText
                                text={formatTime(row.effect.duration)} origin="100% 50%" intensity={TIMER_INTENSITY}/></span>
                    </div>
                </div>
            {/each}
        </div>
    </div>
{/if}

<style lang="scss">
  @use "../glass" as *;

  // The card has no size of its own: `sizeMorph` gives it the size of its rows (+ 4px of padding all round) and morphs it when that changes.
  // It clips its rows, so that a row that is still arriving is uncovered by the card growing round it.
  .effects {
    @include hud-glass(var(--hud-r-card), var(--effects-background-color));

    position: relative;
    box-sizing: border-box;
    overflow: hidden;
  }

  // The box of the rows: it fills the card (inset by its padding), so it is as big as the card is at every moment of a morph.
  // layoutRows places the slots inside it (and sets a size on it for a moment, Effects.svelte takes that off again).
  .rows {
    position: absolute;
    inset: 4px;
  }

  // Where a slot goes when the rows change (layoutRows sets `transform`): a spring with ~4 % overshoot, so the rows below a row that
  // leaves glide up and settle softly. The first declaration is the fallback for a browser without `linear()`.
  .slot {
    position: absolute;
    top: 0;
    left: 0;
    // as wide as the box, so the time on the right of a row is on the right edge of the card; "max-content" while the layout measures
    width: var(--slot-w, 100%);
    transition: transform .5s cubic-bezier(.3, 1.2, .5, 1);
    transition: transform .55s linear(0, 0.0277, 0.0978, 0.1938, 0.3028, 0.4153, 0.5243, 0.6252, 0.7152, 0.7928, 0.8578, 0.9106, 0.9521, 0.9835, 1.0063, 1.0219, 1.0316, 1.0367, 1.0384, 1.0376, 1.035, 1.0314, 1.0272, 1.0229, 1.0187, 1.0148, 1.0113, 1.0083, 1.0057, 1.0036, 1.002, 1.0007, 0.9998, 0.9992, 0.9988, 0.9986, 0.9985, 0.9986, 0.9986, 0.9988, 0.9989, 0.9991, 0.9993, 0.9994, 1);
    will-change: transform;
  }

  // rows of an iOS list: a tile for the potion icon, the name with the level as a small badge, the time on the right
  .effect {
    position: relative;
    display: flex;
    align-items: center;
    gap: 9px;
    box-sizing: border-box;
    height: 34px;
    padding: 0 8px 0 5px;
    font-size: 13px;
    font-weight: 500;

    // the hairline between two rows sits on the row (not on the slot), so it comes and goes with it
    &.sep::before {
      content: "";
      position: absolute;
      top: 0;
      left: 42px;
      right: 8px;
      height: 1px;
      background: var(--hud-separator);
    }

    .icon {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: none;
      width: 26px;
      height: 26px;
      border-radius: 8px;
      background: var(--hud-fill);
    }

    .effect-icon {
      width: 18px;
      height: 18px;
      image-rendering: pixelated;
      image-rendering: -moz-crisp-edges;
      image-rendering: crisp-edges;
    }

    .name {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--effects-name-color);
      white-space: nowrap;
    }

    .amplifier {
      min-width: 16px;
      height: 16px;
      padding: 0 5px;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 700;
      color: var(--effects-amplifier-color);
      background: color-mix(in srgb, var(--effects-amplifier-color) 20%, transparent);
    }

    .duration {
      margin-left: auto;
      padding-left: 12px;
      color: var(--effects-duration-color);
      font-size: 12px;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
      transition: color .3s;

      &.expiring {
        color: var(--hud-orange);
      }
    }
  }
</style>
