<script lang="ts">
    import {listenSticky} from "../../../integration/ws";
    import type {ClosedCaptionEntry, ClosedCaptionsEvent} from "../../../integration/events";
    import TextComponent from "../../menu/common/TextComponent.svelte";
    import {intToHex} from "../../../integration/util";
    import HudIcon from "./HudIcon.svelte";

    let entries: ClosedCaptionEntry[] = [];

    listenSticky("closedCaptions", (event: ClosedCaptionsEvent) => {
        entries = event.entries;
    });
</script>

{#if entries.length > 0}
    <div class="closed-captions">
        {#each entries as entry}
            <div
                    class="closed-caption-entry"
                    style:color={intToHex(entry.textColor)}
                    style:background-color={intToHex(entry.backgroundColor)}
            >
                <span class="arrow" class:visible={entry.direction === "LEFT"}><HudIcon name="left" size={14}/></span>
                <span class="text">
                    {#if typeof entry.text === "string"}
                        {entry.text}
                    {:else}
                        <TextComponent
                                fontSize={13}
                                textComponent={entry.text}
                                inheritedColor={intToHex(entry.textColor)}
                        />
                    {/if}
                </span>

                <span class="arrow" class:visible={entry.direction === "RIGHT"}><HudIcon name="right" size={14}/></span>
            </div>
        {/each}
    </div>
{/if}

<style lang="scss">
  @use "../glass" as *;

  // The text and background colours come from the game (inline), so only the shape is iOS: small capsules with a hairline and a shadow.
  .closed-captions {
    display: flex;
    flex-direction: column-reverse;
    align-items: flex-end;
    gap: 4px;
  }

  .closed-caption-entry {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 26px;
    padding: 0 8px;
    border-radius: 13px;
    font-weight: 600;
    font-size: 13px;
    letter-spacing: -.01em;
    box-shadow: var(--hud-shadow-sm);

    @include hud-frost;
  }

  .arrow {
    display: flex;
    visibility: hidden;
    opacity: .8;

    &.visible {
      visibility: visible;
    }
  }
</style>
