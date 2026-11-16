<!--
    One row of buttons. `columns` equal columns, or a custom `template` (CSS grid-template-columns), e.g.
    "repeat(4, minmax(0, 1fr)) 45px" for four buttons followed by a square settings app.
-->
<script lang="ts">
    import type {Snippet} from "svelte";

    interface Props {
        columns?: number;
        template?: string;
        children?: Snippet;
    }

    let {columns = 4, template, children}: Props = $props();
</script>

<div class="grid" style:grid-template-columns={template ?? `repeat(${columns}, minmax(0, 1fr))`}>
    {@render children?.()}
</div>

<style>
    .grid {
        display: grid;
        gap: 10px;
    }
</style>
