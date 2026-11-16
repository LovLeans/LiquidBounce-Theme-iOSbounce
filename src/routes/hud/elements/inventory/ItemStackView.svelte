<script lang="ts">
    import type {ItemStack} from "../../../../integration/types";
    import {mapToColor} from "../../../../util/color_utils";
    import {itemTextureUrl} from "../../../../integration/rest";

    export let stack: ItemStack;

    const {count, damage, identifier, maxDamage, enchantments} = stack;

    const countColor = count <= 0 ? "red" : "white";

    const valueColor = mapToColor(120 * (maxDamage - damage) / maxDamage);
</script>

<div class="item-stack">
    {#if enchantments}
        <div class="mask" style="mask-image: url({itemTextureUrl(identifier)})"></div>
    {/if}
    <img class="item-icon" src={itemTextureUrl(identifier)} alt={identifier}/>

    <div class="durability-bar" class:hidden={damage === 0}>
        <div class="durability"
             style="width: {100 * (maxDamage - damage) / maxDamage}%; background-color: {valueColor}">
        </div>
    </div>

    <div class="count" class:hidden={count === 1 || identifier === "minecraft:air"} style="color: {countColor}">
        {count}
    </div>
</div>

<style lang="scss">

  .hidden {
    display: none;
  }

  .item-stack {
    position: relative;
    width: 32px;
    height: 32px;
  }

  .mask {
    position: absolute;
    background: radial-gradient(circle, var(--item-enchant-glow-start-color), var(--item-enchant-glow-end-color) 100%);
    mix-blend-mode: screen;
    scale: 105%;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    mask-size: cover;
  }

  .item-icon {
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
  }

  // durability: a thin capsule under the item
  .durability-bar {
    position: absolute;
    bottom: -1px;
    left: 12%;
    width: 76%;
    height: 3px;
    border-radius: 1.5px;
    background: var(--item-damage-background-color);
    overflow: hidden;
  }

  .durability {
    height: 100%;
    border-radius: 1.5px;
    transition: width 150ms;
  }

  // the stack size is a small badge on the corner, like the badge on an iOS app icon
  .count {
    position: absolute;
    bottom: -3px;
    right: -3px;
    min-width: 15px;
    height: 15px;
    padding: 0 4px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--item-count-background-color);
    box-shadow: 0 1px 2px rgba(0, 0, 0, .35);
    font-size: 10px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
</style>
