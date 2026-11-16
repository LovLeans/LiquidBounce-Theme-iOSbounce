<!--
    Page frame shared by the iOS-style menu screens: stage + a 700px column that spans the full height, so the list
    sits at the top and the buttons are snapped to the bottom. An optional `title` is shown above the column.
    The column is a flex container: put a search field, one IosScrollList (it grows) and the buttons in it.
-->
<script lang="ts">
    import type {Snippet} from "svelte";
    import IosStage from "./IosStage.svelte";

    interface Props {
        title?: string;
        children?: Snippet;
    }

    let {title, children}: Props = $props();
</script>

<IosStage>
    <main class="screen">
        {#if title}
            <h1>{title}</h1>
        {/if}
        <div class="column">
            {@render children?.()}
        </div>
    </main>
</IosStage>

<style>
    .screen {
        height: 100%;
        box-sizing: border-box;
        padding: 24px 0;
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    h1 {
        margin: 0;
        font-size: 25px;
        line-height: 30px;
        font-weight: 700;
        letter-spacing: -0.25px;
        text-shadow: 0 1px 12px rgba(0, 0, 0, 0.35);
    }

    h1 + .column {
        margin-top: 20px;
    }

    .column {
        width: 700px;
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 18px;
    }
</style>
