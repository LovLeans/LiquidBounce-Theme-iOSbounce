<!--
    One page of a tabbed iOS dialog: the fields (default snippet, 14px apart) with the buttons (`actions`, 10px apart) snapped to the
    bottom. A page fills the room the dialog gives it, so every tab of the dialog has its button in the same place.
-->
<script lang="ts">
    import type {Snippet} from "svelte";

    interface Props {
        children?: Snippet;
        actions?: Snippet;
    }

    let {children, actions}: Props = $props();
</script>

<div class="pane">
    {@render children?.()}
    {#if actions}
        <div class="actions">
            {@render actions()}
        </div>
    {/if}
</div>

<style>
    .pane {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 14px;
    }

    .actions {
        margin-top: auto;
        display: grid;
        gap: 10px;
    }

    /* small print under a field: give a <p class="hint"> to the default snippet */
    .pane :global(.hint) {
        margin: -6px 0 0;
        padding: 0 4px;
        font-size: 13px;
        line-height: 17px;
        color: var(--ios-text-dim);
    }
</style>
