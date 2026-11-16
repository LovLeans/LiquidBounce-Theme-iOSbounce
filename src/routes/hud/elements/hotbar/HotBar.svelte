<script lang="ts">
    import Status from "./Status.svelte";
    import {listenSticky} from "../../../../integration/ws";
    import type {PlayerData, TextComponent as TTExtComponent} from "../../../../integration/types";
    import {onMount} from "svelte";
    import {getPlayerData} from "../../../../integration/rest";
    import {fade} from "svelte/transition";
    import {cubicOut} from "svelte/easing";
    import {selector} from "./selector";
    import TextComponent from "../../../menu/common/TextComponent.svelte";
    import type {ClientPlayerDataEvent, OverlayMessageEvent} from "../../../../integration/events";

    let lastSlot = 0;
    let currentSlot = 0;
    let playerData: PlayerData | null = null;
    let maxAbsorption = 0;
    let slotsElement: HTMLElement | undefined;

    let showItemStackName = false;
    let showItemStackNameTimeout: number | null = null;
    let itemStackName: TTExtComponent | string | null = null;
    let overlayMessage: OverlayMessageEvent | null = null;
    let overlayMessageTimeout: number | null = null;

    function updatePlayerData(s: PlayerData) {
        playerData = s;
        if (playerData.absorption <= 0) {
            maxAbsorption = 0;
        }
        if (playerData.absorption > maxAbsorption) {
            maxAbsorption = playerData.absorption;
        }
        currentSlot = playerData.selectedSlot;
        if (currentSlot !== lastSlot) {
            lastSlot = currentSlot;
            if (playerData.mainHandStack.identifier !== "minecraft:air") {
                itemStackName = playerData.mainHandStack.displayName;
                if (showItemStackNameTimeout !== null) {
                    clearTimeout(showItemStackNameTimeout);
                }
                showItemStackName = true;
                showItemStackNameTimeout = setTimeout(() => {
                    showItemStackName = false;
                }, 2000);
            }
        }
    }

    listenSticky("clientPlayerData", (event: ClientPlayerDataEvent) => {
        updatePlayerData(event.playerData);
    });

    listenSticky("overlayMessage", (event: OverlayMessageEvent) => {
        overlayMessage = event;
        if (overlayMessageTimeout !== null) {
            clearTimeout(overlayMessageTimeout);
        }
        overlayMessageTimeout = setTimeout(() => {
            overlayMessage = null;
        }, 3000)
    });

    // The first read must not replace data the client already pushed while the request was out (older health / slot would show again).
    onMount(async () => {
        try {
            const initial = await getPlayerData();
            if (playerData === null) {
                updatePlayerData(initial);
            }
        } catch (e) {
            console.warn("[HotBar] could not read the player data, waiting for the client to push it", e);
        }
    });
</script>

{#if playerData && playerData.gameMode !== "spectator"}
    <div class="hotbar">
        {#if overlayMessage !== null}
            <div class="overlay-message" in:fade={{duration: 220, easing: cubicOut}} out:fade={{duration: 260}}
                 style="max-width: {slotsElement?.offsetWidth ?? 0}px">
                <TextComponent fontSize={13} textComponent={overlayMessage.text} allowPreformatting={true} preFormattingMonospace={false} />
            </div>
        {/if}
        {#if showItemStackName && itemStackName !== null}
            <div class="item-name" in:fade={{duration: 220, easing: cubicOut}} out:fade={{duration: 260}}>
                <TextComponent fontSize={13} textComponent={itemStackName}/>
            </div>
        {/if}
        <div class="status">

            <div class="pair">
                {#if playerData.armor > 0}
                    <Status
                            max={20}
                            value={playerData.armor}
                            color="var(--hotbar-armor-color)"
                            alignRight={false}
                    />
                {:else}
                    <div></div>
                {/if}

                {#if playerData.air < playerData.maxAir}
                    <Status
                            max={playerData.maxAir}
                            value={playerData.air}
                            color="var(--hotbar-air-color)"
                            alignRight={true}
                    />
                {:else}
                    <div></div>
                {/if}
            </div>

            {#if playerData.gameMode !== "creative"}
                {#if playerData.absorption > 0}
                    <div class="pair">
                        <Status
                                max={maxAbsorption}
                                value={playerData.absorption}
                                color="var(--hotbar-absorption-color)"
                                alignRight={false}
                        />

                        <div></div>
                    </div>
                {/if}
                <div class="pair">
                    <Status
                            max={playerData.maxHealth}
                            value={playerData.health}
                            color="var(--hotbar-health-color)"
                            alignRight={false}
                    />
                    <Status
                            max={20}
                            value={playerData.food}
                            color="var(--hotbar-hunger-color)"
                            alignRight={true}
                    />
                </div>
            {/if}
            {#if playerData.experienceLevel > 0}
                <Status
                        max={100} value={playerData.experienceProgress * 100}
                        color="var(--hotbar-experience-color)"
                        alignRight={false}
                        label={playerData.experienceLevel.toString()}
                />
            {/if}

        </div>

        <!-- The slot row keeps its exact old box (9 slots of 45px = 405 x 45): the game positions the item icons by it. The glass capsule
             around it is a ::before that reaches out past the box, so it takes no part in the layout. The round selector is a jelly blob
             that stretches, squashes and wobbles to the selected slot (selector.ts sizes and places the .slider with transform / width /
             height and writes --q on it). -->
        <div class="hotbar-elements" use:selector={currentSlot}>
            <div class="slots" bind:this={slotsElement}>
                <div class="slot"></div>
                <div class="slot"></div>
                <div class="slot"></div>
                <div class="slot"></div>
                <div class="slot"></div>
                <div class="slot"></div>
                <div class="slot"></div>
                <div class="slot"></div>
                <div class="slot"></div>
            </div>
            <div class="slider"></div>
        </div>

        {#if playerData?.offHandStack.identifier !== "minecraft:air"}
            <div class="offhand-slot"></div>
        {/if}
    </div>
{/if}

<style lang="scss">
  @use "../../glass" as *;

  $slot: 45px;

  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 8px;
  }

  .status {
    display: flex;
    flex-direction: column;
    margin-bottom: 12px; // 6px of it is taken by the dock that reaches out above the slots
    row-gap: 6px;
  }

  // Capsule dock: one long glass pill round the slots (6px of reach, so its end caps are concentric with the first / last slot), with a
  // round selector with one ring that springs to the selected slot (motion: selector.ts, the pill of the tab bars).
  .hotbar-elements {
    position: relative;
    isolation: isolate;

    @include hud-glass-halo(6px, 999px, var(--hotbar-slot-background-color), var(--hud-shadow), false);

    .slots {
      display: flex;
    }

    .slot {
      height: $slot;
      width: $slot;
    }

    // The selection is a round bubble with ONE thin ring. selector.ts moves AND sizes it (transform + width + height, not scale()), so the
    // ring keeps the same thickness while the bubble stretches into a capsule and squashes again. --q (0..1) is "pressed / moving".
    .slider {
      --ring: color-mix(in srgb, var(--hotbar-slot-border-color) 78%, white);

      position: absolute;
      top: 0;
      left: 0;
      width: $slot;
      height: $slot;
      border-radius: 999px; // a circle at rest, a true capsule when stretched
      will-change: transform;
      pointer-events: none;
      // a flat tint that gets brighter while pressed; the one thin ring, which gets a touch bolder while pressed; a glow only while it moves
      background: rgba(255, 255, 255, calc(.09 + var(--q, 0) * .2));
      box-shadow:
        inset 0 0 0 calc(1.5px + var(--q, 0) * .5px) var(--ring),
        0 0 calc(var(--q, 0) * 12px) color-mix(in srgb, var(--hotbar-slot-border-color) 40%, transparent);
    }
  }

  // the offhand slot is a round dock of its own, same language as the capsule
  .offhand-slot {
    @include hud-glass-halo(6px, 999px, var(--hotbar-slot-background-color), var(--hud-shadow), false);

    position: absolute;
    bottom: 0;
    left: -65px;
    height: $slot;
    width: $slot;
    isolation: isolate;
  }

  // The text above the dock (item name, overlay message): no border, no edge highlight, no shadow, only a soft tint behind the text.
  // It fades in and out (the transitions in the markup), it does not move or scale.
  .item-name,
  .overlay-message {
    background: var(--hotbar-item-name-background-color);
    border-radius: 15px;
    box-shadow: none;

    @include hud-frost;
    color: var(--hotbar-text-color);
    margin: 0 auto 12px;
    width: max-content;
  }

  .item-name {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: -.01em;
    padding: 0 14px;
    height: 30px;
    display: flex;
    align-items: center;
    max-width: 100%;
  }

  .overlay-message {
    text-align: center;
    padding: 6px 14px;
    overflow: hidden;
  }
</style>
