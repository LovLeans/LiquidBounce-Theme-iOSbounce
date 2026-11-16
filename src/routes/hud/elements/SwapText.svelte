<script lang="ts">
    import SwapGlyph from "./SwapGlyph.svelte";

    /**
     * What is written. Words change as a whole: the old text damps in, the new one appears at the bottom of the dip and damps out
     * (motion.ts `textPulse`). A NUMBER is split into its digits, placed by their value (the ones, the tens, ...): only the digits that
     * change play the pulse, so 59 -> 58 moves only the ones and 60 -> 59 moves both.
     */
    export let text: string;
    /**
     * What the text is ABOUT (a player's uuid, say). When it changes the text is a different thing, not a new value of the same one, so it is
     * swapped at once without a pulse (the card that holds it has its own damp in / damp out for that).
     */
    export let key: unknown = undefined;
    /** where words shrink towards: "0% 50%" for text on the left edge, "100% 50%" for text on the right edge (every digit shrinks towards its own middle) */
    export let origin = "50% 50%";
    /** how deep the dip is (1 = the full one, a timer that ticks every second uses less) */
    export let intensity = 1;

    // digits, a clock and a few signs
    const NUMBER = /^[\d\s:.,+\-%\u221e]*$/;

    interface Cell {
        /** the place counted from the RIGHT (0 = the last character): "9" in 59 stays the same cell when 59 becomes 159 */
        place: number;
        char: string;
    }

    let numeric = false;
    let cells: Cell[] = [];

    $: numeric = text.length > 0 && NUMBER.test(text);
    $: cells = numeric ? [...text].map((char, i, all) => ({place: all.length - 1 - i, char})) : [];
</script>

{#if numeric}
    <!-- inline-flex: no stray white space between the digits -->
    <span class="digits">{#each cells as cell (cell.place)}<SwapGlyph text={cell.char} {key} {intensity} numeric/>{/each}</span>
{:else}
    <SwapGlyph {text} {key} {origin} {intensity}/>
{/if}

<style lang="scss">
  .digits {
    display: inline-flex;
    max-width: 100%;
    white-space: inherit;
  }
</style>
