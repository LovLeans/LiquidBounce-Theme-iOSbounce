<script lang="ts">
    import type {ItemStack} from "../../../../integration/types";
    import {itemTextureUrl} from "../../../../integration/rest";

    export let itemStack: ItemStack;

    // 0..100 (an item without durability, maxDamage 0, counts as intact)
    let left = 100;
    $: left = itemStack.maxDamage > 0 ? Math.max(0, Math.min(100, 100 - itemStack.damage / itemStack.maxDamage * 100)) : 100;
</script>

<div class="armor-status">
    <img class="icon" src={itemTextureUrl(itemStack.identifier)} alt={itemStack.identifier} />
    <div class="durability">
        <div class="left" style="height: {left}%"></div>
    </div>
</div>

<style lang="scss">

    // the armour piece and a thin vertical capsule that drains with its durability
    .armor-status {
        display: flex;
        align-items: center;
        column-gap: 4px;
    }

    .icon {
        height: 26px;
        width: 26px;
        image-rendering: pixelated;
    }

    .durability {
        display: flex;
        align-items: flex-end;
        height: 26px;
        width: 4px;
        border-radius: 2px;
        background: var(--targethud-armor-point-background-color);
        overflow: hidden;

        .left {
            width: 100%;
            border-radius: 2px;
            background: var(--targethud-armor-point-active-color);
            transition: height .6s var(--hud-smooth);
        }
    }
</style>
