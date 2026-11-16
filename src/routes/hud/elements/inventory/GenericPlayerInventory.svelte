<script lang="ts">
    import type {ItemStack} from "../../../../integration/types";
    import {listenSticky} from "../../../../integration/ws";
    import type {ClientPlayerInventoryEvent, PlayerInventory} from "../../../../integration/events";
    import ItemStackView from "./ItemStackView.svelte";
    import {onMount} from "svelte";
    import {getPlayerInventory} from "../../../../integration/rest";

    export let rowLength: number;
    export let backgroundColor: string = "var(--inventory-background-color)";
    export let gap: string = "0.5rem";
    export let getRenderedStacks: (inventory: PlayerInventory) => ItemStack[];

    let inventory: PlayerInventory | undefined;
    let stacks: ItemStack[] = [];

    let pushed = false;

    listenSticky("clientPlayerInventory", (data: ClientPlayerInventoryEvent) => {
        pushed = true;
        inventory = data.inventory;
    });

    // The first read must not overwrite an inventory the client already pushed while the request was out (the older answer won).
    onMount(async () => {
        try {
            const initial = await getPlayerInventory();
            if (!pushed) {
                inventory = initial;
            }
        } catch (e) {
            console.warn("[Inventory] could not read the inventory, waiting for the client to push it", e);
        }
    });

    $: stacks = inventory ? getRenderedStacks(inventory) : [];
</script>

<div class="inventory" class:plain={backgroundColor === "transparent"} style="
    background-color: {backgroundColor};
    gap: {gap};
    --row-length: {rowLength};
">
    {#each stacks as stack (stack)}
        <ItemStackView {stack}/>
    {/each}
</div>

<style lang="scss">
  @use "../../glass" as *;

  .inventory {
    @include hud-glass(var(--hud-r-card), var(--inventory-background-color));

    padding: 6px;
    display: grid;
    grid-template-columns: repeat(var(--row-length), 1fr);

    // InventoryStatistics draws its items straight on the game (background "transparent"): no card then
    &.plain {
      background: none;
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
      box-shadow: none;
      border-radius: 0;
      padding: 0;
    }
  }
</style>
