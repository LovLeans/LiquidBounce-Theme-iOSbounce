<!--
    Glass list panel with iOS scroll physics:
      - momentum that carries into the top / bottom edge and springs back (rubber band)
      - blur (no tint) that fades in at an edge only while there is more content behind it
      - an auto-hiding, draggable scroll bar that squeezes while the list is stretched

    Put list rows in the default snippet. `footer` is rendered after the rows inside the scrolling area.
    Bind `scroller` to call `scroller.scrollIntoView(rowElement)` (e.g. for keyboard selection).
-->
<script lang="ts">
    import {onMount, type Snippet} from "svelte";
    import {SmoothScroll} from "./scrollPhysics";

    interface Props {
        /** Accessible name of the list. */
        label: string;
        children?: Snippet;
        footer?: Snippet;
        scroller?: SmoothScroll;
    }

    let {label, children, footer, scroller = $bindable()}: Props = $props();

    let panel: HTMLDivElement;
    let viewport: HTMLDivElement;
    let content: HTMLDivElement;
    let track: HTMLDivElement;
    let thumb: HTMLDivElement;

    // Stacked blur layers with increasing strength towards the edge approximate a progressive blur.
    const blurLayers = [
        {blur: 1, from: 60, to: 100},
        {blur: 3, from: 40, to: 80},
        {blur: 8, from: 20, to: 60}
    ];

    onMount(() => {
        const instance = new SmoothScroll({
            viewport,
            content,
            track,
            thumb,
            fadeTop: panel.querySelectorAll<HTMLElement>(".fade-top"),
            fadeBottom: panel.querySelectorAll<HTMLElement>(".fade-bottom")
        });
        instance.attach();
        scroller = instance;

        return () => {
            instance.destroy();
            scroller = undefined;
        };
    });
</script>

<div class="panel" bind:this={panel}>
    <!-- The glass is its own layer BEHIND the rows, not the background of .panel (see the CSS): the edge blurs below must see the wallpaper
         through it, not a panel that is its own backdrop root. -->
    <div class="glass" aria-hidden="true"></div>
    <div class="viewport" bind:this={viewport}>
        <div class="content" bind:this={content}>
            <div class="items" role="listbox" aria-label={label}>
                {@render children?.()}
            </div>
            {@render footer?.()}
        </div>
    </div>

    {#each blurLayers as layer}
        <div class="fade fade-top blur" aria-hidden="true"
             style:--blur="{layer.blur}px" style:--from="{layer.from}%" style:--to="{layer.to}%"></div>
    {/each}

    {#each blurLayers as layer}
        <div class="fade fade-bottom blur" aria-hidden="true"
             style:--blur="{layer.blur}px" style:--from="{layer.from}%" style:--to="{layer.to}%"></div>
    {/each}

    <div class="track" bind:this={track} aria-hidden="true">
        <div class="thumb" bind:this={thumb}></div>
    </div>
</div>

<style>
    .panel {
        position: relative;
        flex: 1;
        min-height: 0;
        overflow: hidden;
        border-radius: 22px;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.25);
    }

    /*
     * The glass (tint + backdrop blur + hairline) lives on this layer BEHIND the rows, not on .panel itself. An element with
     * `backdrop-filter` is a "backdrop root": the edge-blur layers inside it only saw the panel's own grey tint, never the
     * wallpaper behind it, and replaced the glass at the top / bottom edge with a grey, desaturated band. Next to the glass
     * they blur the glass and the rows together and the colour stays.
     * Fade the glass in when the screen opens. The animation is on the glass itself (and the rows), not on .panel: an ancestor
     * with opacity < 1 would become the backdrop root and the glass would stop blurring what is behind it for the length of the
     * animation. `backwards` leaves no animation behind once it is over.
     */
    .glass {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
        background: linear-gradient(var(--ios-tint), var(--ios-tint)), var(--ios-panel);
        -webkit-backdrop-filter: blur(24px) saturate(1.5);
        backdrop-filter: blur(24px) saturate(1.5);
        box-shadow: inset 0 0 0 1px var(--ios-hairline),
        inset 0 1px 0 rgba(255, 255, 255, 0.24);
        animation: panel-in 0.3s ease-out backwards;
    }

    @keyframes panel-in {
        from {
            opacity: 0;
        }
    }

    /* Native scrolling is off: SmoothScroll moves `.content` with a transform. */
    .viewport {
        position: absolute;
        inset: 0;
        box-sizing: border-box;
        padding: 8px;
        overflow: hidden;
        touch-action: none;
        animation: panel-in 0.3s ease-out backwards;
    }

    .content {
        position: relative;
        display: flow-root;
        will-change: transform;
    }

    /* --- edge fades (opacity is driven by SmoothScroll) --------------------------------------------------- */
    .fade {
        position: absolute;
        left: 0;
        right: 0;
        height: 68px;
        opacity: 0;
        pointer-events: none;
        /* Keep the layer (and its backdrop blur) alive at opacity 0, so it is not created in the middle of a frame
           the first time it is needed. */
        will-change: opacity;
    }

    .fade-top {
        top: 0;
    }

    .fade-bottom {
        bottom: 0;
    }

    .blur {
        -webkit-backdrop-filter: blur(var(--blur));
        backdrop-filter: blur(var(--blur));
    }

    .blur.fade-top {
        -webkit-mask-image: linear-gradient(to bottom, #000 0%, #000 var(--from), transparent var(--to));
        mask-image: linear-gradient(to bottom, #000 0%, #000 var(--from), transparent var(--to));
    }

    .blur.fade-bottom {
        -webkit-mask-image: linear-gradient(to top, #000 0%, #000 var(--from), transparent var(--to));
        mask-image: linear-gradient(to top, #000 0%, #000 var(--from), transparent var(--to));
    }

    /* --- scroll bar ---------------------------------------------------------------------------------------- */
    .track {
        position: absolute;
        right: 0;
        top: 14px;
        bottom: 14px;
        width: 12px;
        opacity: 0;
        transition: opacity 0.28s ease;
        touch-action: none;
    }

    .thumb {
        position: absolute;
        top: 0;
        right: 2px;
        width: 5px;
        height: 0;
        display: none;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.62);
        box-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.18), 0 1px 4px rgba(0, 0, 0, 0.28);
        transition: width 0.16s ease-out, background 0.16s ease-out;
        will-change: transform, height;
    }

    /* These classes are toggled by SmoothScroll, hence :global. */
    .track:global(.visible) {
        opacity: 1;
    }

    .track:global(.hover) .thumb {
        width: 8px;
        background: rgba(255, 255, 255, 0.8);
    }

    .track:global(.dragging) .thumb {
        width: 8px;
        background: rgba(255, 255, 255, 0.92);
    }
</style>
