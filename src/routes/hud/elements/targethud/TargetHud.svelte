<script lang="ts">
    import ArmorStatus from "./ArmorStatus.svelte";
    import {listenSticky} from "../../../../integration/ws.js";
    import type {PlayerData} from "../../../../integration/types";
    import {REST_BASE} from "../../../../integration/host";
    import {cardMotion, CARD_OUT_MS, CARD_SETTLED_MS, CARD_SWAP_MS} from "../../motion";
    import HudIcon from "../HudIcon.svelte";
    import SwapText from "../SwapText.svelte";
    import HealthProgress from "./HealthProgress.svelte";
    import type {TargetChangeEvent} from "../../../../integration/events";

    // the last target that was hit: it stays on the card while the card closes
    let target: PlayerData | null = null;
    // in the DOM: from the moment a target arrives until the exit is over (an exit that waits for a svelte `out:` would pop when a new
    // target arrives half way through it, so a timer removes the card and `cardMotion` plays the entrance / exit, as in ArrayList.svelte)
    let mounted = false;
    // false while the card is closing
    let open = false;
    // goes up every time the card is open and another player is hit: the card then pulses (motion.ts `cardMotion`)
    let pulse = 0;
    // When the card pulses it dips and blurs first and the new player is put on it at the bottom of the dip (CARD_SWAP_MS later), so for
    // that moment the next player waits here.
    let pending: PlayerData | null = null;
    // when the card last opened (a card that is still growing does not pulse)
    let openedAt = 0;

    let hideTimeout: number;
    let removeTimeout: number;
    let swapTimeout: number;

    function applyPending() {
        if (pending != null) target = pending;
        pending = null;
    }

    function startHideTimeout() {
        hideTimeout = setTimeout(() => {
            open = false;
            removeTimeout = setTimeout(() => {
                mounted = false;
            }, CARD_OUT_MS + 60);
        }, 1000);
    }

    listenSticky("targetChange", (data: TargetChangeEvent) => {
        clearTimeout(hideTimeout);
        clearTimeout(removeTimeout);

        const incoming = data.target;

        if (incoming != null) {
            const shown = pending ?? target;
            const switching = shown != null && shown.uuid !== incoming.uuid;
            const canPulse = mounted && open && performance.now() - openedAt > CARD_SETTLED_MS;

            if (switching && canPulse) {
                // dip first, the new player appears at the bottom of the dip (a quicker second switch just moves the swap on)
                pulse++;
                pending = incoming;
                clearTimeout(swapTimeout);
                swapTimeout = setTimeout(applyPending, CARD_SWAP_MS);
            } else if (pending != null && pending.uuid === incoming.uuid) {
                // the player that is about to appear was hit again: keep its stats current
                pending = incoming;
            } else {
                clearTimeout(swapTimeout);
                pending = null;
                target = incoming;
            }

            if (!open) openedAt = performance.now();
            mounted = true;
            open = true;
        }

        startHideTimeout();
    });

    startHideTimeout();
</script>

{#if mounted && target != null}
    <div class="targethud" use:cardMotion={{leaving: !open, pulse}}>
        <div class="main-wrapper">
            <div class="avatar">
                <img src="{REST_BASE}/api/v1/client/resource/skin?uuid={target.uuid}" alt="avatar" />
            </div>
    
            <div class="name">{target.username}</div>
            <div class="health-stats">
                <div class="stat health">
                    <HudIcon name="heart" size={12}/>
                    <div class="value"><SwapText text={String(Math.floor(target.actualHealth))} key={target.uuid} origin="0% 50%"/></div>
                </div>
                {#if target.absorption > 0}
                    <div class="stat absorption">
                        <HudIcon name="heart" size={12}/>
                        <div class="value"><SwapText text={String(Math.floor(target.absorption))} key={target.uuid} origin="0% 50%"/></div>
                    </div>
                {/if}
                <div class="stat armor">
                    <HudIcon name="shield" size={12}/>
                    <div class="value"><SwapText text={String(Math.floor(target.armor))} key={target.uuid} origin="0% 50%"/></div>
                </div>
            </div>
            <div class="armor-stats">
                {#if target.armorItems[3].count > 0}
                    <ArmorStatus itemStack={target.armorItems[3]} />
                {/if}
                {#if target.armorItems[2].count > 0}
                    <ArmorStatus itemStack={target.armorItems[2]} />
                {/if}
                {#if target.armorItems[1].count > 0}
                    <ArmorStatus itemStack={target.armorItems[1]} />
                {/if}
                {#if target.armorItems[0].count > 0}
                    <ArmorStatus itemStack={target.armorItems[0]} />
                {/if}
            </div>
        </div>    
        
        <HealthProgress maxHealth={target.maxHealth + target.absorption} health={target.actualHealth + target.absorption} />
    </div>
{/if}

<style lang="scss">
    @use "../../glass" as *;

    // iOS card: a squircle avatar, the name, three small stats, the armour on the right and a thin health capsule underneath
    .targethud {
        // 22 = the avatar's radius (10) + the padding round it (12): concentric corners
        @include hud-glass(22px, var(--targethud-background-color));

        overflow: hidden;
        padding: 12px 14px 12px 12px;
        display: flex;
        flex-direction: column;
        row-gap: 10px;
    }

    .main-wrapper {
        display: grid;
        grid-template-areas:
            "a b d"
            "a c d";
        grid-template-columns: max-content 1fr max-content;
        column-gap: 12px;
        row-gap: 3px;
        align-items: center;
    }

    .name {
        grid-area: b;
        color: var(--targethud-text-color);
        font-size: 15px;
        font-weight: 600;
        letter-spacing: -.01em;
        align-self: end;
        white-space: nowrap;
    }

    .health-stats {
        grid-area: c;
        align-self: start;
        display: flex;
        column-gap: 10px;

        .stat {
            display: flex;
            align-items: center;
            gap: 4px;
            color: var(--hud-red);

            &.absorption {
                color: var(--hud-yellow);
            }

            &.armor {
                color: var(--hotbar-armor-color);
            }

            .value {
                color: var(--targethud-text-dimmed-color);
                font-size: 12px;
                font-weight: 500;
                font-variant-numeric: tabular-nums;
                min-width: 14px;
            }
        }
    }

    .armor-stats {
        grid-area: d;
        display: flex;
        align-items: center;
        column-gap: 8px;
        padding-left: 4px;
    }

    .avatar {
        grid-area: a;
        height: 46px;
        width: 46px;
        position: relative;
        image-rendering: pixelated;
        background-image: url("/img/steve.png");
        background-repeat: no-repeat;
        background-size: cover;
        border-radius: 10px;
        overflow: hidden;
        box-shadow: 0 1px 1px rgba(0, 0, 0, .10), 0 3px 8px -2px rgba(0, 0, 0, .34);

        @supports (corner-shape: squircle) {
            corner-shape: squircle;
        }

        img {
            position: absolute;
            // the face is cut out of the skin by scaling and moving the whole picture (it was tuned for a 50px box, hence the 46/50)
            scale: 5.75;
            left: 106px;
            top: 106px;
        }
    }
</style>
