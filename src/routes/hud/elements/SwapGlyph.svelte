<script lang="ts">
    import {onDestroy} from "svelte";
    import {NUMBER_SWAP_MS, TEXT_SWAP_MS, textPulse} from "../motion";

    /** what is written; whenever it changes the old text damps in, the new one appears at the bottom of the dip and damps out (motion.ts `textPulse`) */
    export let text: string;
    /**
     * What the text is ABOUT (a player's uuid, say). When it changes the text is a different thing, not a new value of the same one, so it is
     * swapped at once without a pulse (the card that holds it has its own damp in / damp out for that).
     */
    export let key: unknown = undefined;
    /** where the text shrinks towards: "0% 50%" for text on the left edge, "100% 50%" for text on the right edge */
    export let origin = "50% 50%";
    /** how deep the dip is (1 = the full one, a timer that ticks every second uses less) */
    export let intensity = 1;
    /** a digit (or a sign of a number): the short size-only pulse that never blurs or fades out (motion.ts `NUMBER_PULSE`) */
    export let numeric = false;

    // what is on screen right now: it lags `text` by the damp in
    let shown = text;
    let shownKey = key;
    // the newest text: the swap at the bottom of the dip reads it, so a change in the middle of the dip is not lost and does not restart it
    let latest = text;

    let node: HTMLElement | undefined;
    let animation: Animation | null = null;
    let swapTimer: ReturnType<typeof setTimeout> | undefined;

    function update(next: string, nextKey: unknown) {
        latest = next;

        if (nextKey !== shownKey) {
            // another subject: no pulse
            shownKey = nextKey;
            clearTimeout(swapTimer);
            swapTimer = undefined;
            animation?.cancel();
            animation = null;
            shown = next;
            return;
        }

        // the swap is already waiting for the bottom of the dip: it will pick `latest` up
        if (swapTimer !== undefined) return;
        if (next === shown) return;

        if (!node) {
            shown = next;
            return;
        }

        // built from the current look first (a pulse that is still settling), then the old animation goes
        const next_animation = textPulse(node, intensity, numeric);
        animation?.cancel();
        animation = next_animation;

        if (!animation) {
            // no animations in this browser: just change it
            shown = next;
            return;
        }

        swapTimer = setTimeout(() => {
            swapTimer = undefined;
            shown = latest;
        }, numeric ? NUMBER_SWAP_MS : TEXT_SWAP_MS);
    }

    $: update(text, key);

    onDestroy(() => {
        clearTimeout(swapTimer);
        animation?.cancel();
    });
</script>

<span class="swap" bind:this={node} style:transform-origin={origin}>{shown === " " ? "\u00a0" : shown}</span>

<style lang="scss">
  // inline-block: a transform does not apply to a plain inline box. It takes no space of its own beyond the text.
  .swap {
    display: inline-block;
    max-width: 100%;
    white-space: inherit;
    font: inherit;
    color: inherit;
  }
</style>
