<script lang="ts">
    import {listenSticky} from "../../../integration/ws";
    import {cardMotion, CARD_OUT_MS} from "../motion";
    import SwapText from "./SwapText.svelte";
    import {mapToColor} from "../../../util/color_utils";
    import {itemTextureUrl} from "../../../integration/rest";
    import type {HudBlockCounterSettings} from "../components";

    export let settings: { [name: string]: any };

    let cSettings: HudBlockCounterSettings;

    $: cSettings = settings as HudBlockCounterSettings;

    // the last values the client sent: they stay on the counter while it closes
    let nextBlock: string | undefined = undefined;
    let count: number | undefined = undefined;
    // in the DOM: from the first count until the exit is over (a timer removes it, `cardMotion` plays the entrance / exit, as in TargetHud.svelte)
    let mounted = false;
    // false while the counter is closing
    let open = false;

    let removeTimeout: number;

    listenSticky("blockCountChange", (data) => {
        clearTimeout(removeTimeout);

        if (data.count !== undefined) {
            nextBlock = data.nextBlock;
            count = data.count;
            mounted = true;
            open = true;
        } else if (open) {
            // no blocks to count any more: close, keeping what is shown until it is gone
            open = false;
            removeTimeout = setTimeout(() => {
                mounted = false;
            }, CARD_OUT_MS + 60);
        }
    });

    const FLEX_DIRECTION = {
        None: "row",
        Left: "row",
        Right: "row-reverse",
        Top: "column",
        Bottom: "column-reverse",
    };
</script>

{#if mounted && count !== undefined}
    <!-- two elements because both use `transform`: the slot is shifted left by its own width, the counter expands / closes in place -->
    <div class="slot">
        <div class="counter" style="color: {mapToColor(count)}; flex-direction: {FLEX_DIRECTION[cSettings.iconPosition]}"
             use:cardMotion={{leaving: !open}}>
            {#if nextBlock && cSettings.iconPosition !== "None"}
                <img class="icon" src={itemTextureUrl(nextBlock)} alt={nextBlock}/>
            {/if}
            <SwapText text={String(count)}/>
        </div>
    </div>
{/if}

<style lang="scss">
  @use "../glass" as *;

  .slot {
    width: fit-content;
    transform: translate(-100%);
  }

  // a glass capsule; the colour of the number (red -> green by how many blocks are left) is set inline
  .counter {
    @include hud-glass(18px, var(--blockcounter-background-color), var(--hud-shadow-sm), false);

    white-space: nowrap;
    height: 36px;
    padding: 0 14px;
    font-size: 15px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: center;
    width: fit-content;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    // the number's colour (red -> green) follows the count, softly
    transition: color .3s;
  }

  .icon {
    width: 22px;
    height: 22px;
    image-rendering: pixelated;
  }
</style>
