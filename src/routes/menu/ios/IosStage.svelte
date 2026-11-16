<!--
    Full-screen stage for the iPadOS-style menus.

    All iOS menu components are sized for a 1920x1080 window. The stage scales everything with the window
    (1080p, 1440p, 4K, a small window) and with the user's GUI scale (settings app), and always fills the whole
    window: a bigger GUI scale means a smaller layout area, exactly like Minecraft's own GUI scale.

    The stage background is transparent on purpose: LiquidBounce draws the theme wallpaper natively *under* the
    browser, so the page only has to paint the UI.

    Tokens (CSS custom properties) are defined on the viewport element and inherited by every Ios* component,
    including things that are moved out of the scaled stage (the settings sheet). They default to the
    LiquidBounce theme variables (`--accent-color`, `--menu-text-color`, ...), so the theme colors from
    metadata.json (Accent / Tint) keep working. `--ios-base-scale` is the window scale without the GUI scale.
-->
<script lang="ts">
    import type {Snippet} from "svelte";
    import {guiScale} from "./guiScale.svelte";

    interface Props {
        children?: Snippet;
        /** Width of the design space in px. */
        designWidth?: number;
        /** Height of the design space in px. */
        designHeight?: number;
    }

    let {children, designWidth = 1920, designHeight = 1080}: Props = $props();

    let viewportWidth = $state(window.innerWidth);
    let viewportHeight = $state(window.innerHeight);

    /** Window size relative to the 1920x1080 design. Independent of the user's GUI scale. */
    const baseScale = $derived(Math.min(viewportWidth / designWidth, viewportHeight / designHeight));
    const scale = $derived(baseScale * guiScale.value);
</script>

<svelte:window bind:innerWidth={viewportWidth} bind:innerHeight={viewportHeight}/>

<div class="ios-viewport" style:--ios-base-scale={baseScale}>
    <div class="ios-stage"
         style:width="{viewportWidth / scale}px"
         style:height="{viewportHeight / scale}px"
         style:transform="scale({scale})">
        {@render children?.()}
    </div>
</div>

<style>
    .ios-viewport {
        position: fixed;
        inset: 0;
        overflow: hidden;

        /* --- tokens ------------------------------------------------------------------------------------------ */
        --ios-accent: var(--accent-color, #0a6cf0);
        --ios-text: var(--menu-text-color, #ffffff);
        --ios-text-dim: color-mix(in srgb, var(--ios-text) 62%, transparent);
        --ios-danger: var(--error-color, #ff6b62);

        /* Frosted-glass surfaces. Tinted by the theme's Tint color (--surface-color). */
        --ios-tint: color-mix(in srgb, var(--surface-color, #000000) 18%, transparent);
        --ios-panel: rgba(138, 138, 148, 0.26);
        --ios-control: rgba(138, 138, 148, 0.3);
        --ios-field: rgba(118, 118, 128, 0.28);
        --ios-row: rgba(255, 255, 255, 0.05);
        --ios-row-selected: rgba(255, 255, 255, 0.14);
        --ios-hairline: rgba(255, 255, 255, 0.14);

        font-family: "Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        color: var(--ios-text);
        user-select: none;
    }

    .ios-stage {
        position: absolute;
        left: 0;
        top: 0;
        transform-origin: 0 0;
    }

    /*
     * While an app window carries the screen layer (growing out of / shrinking into its dock icon: overlayfx.ts marks the layer
     * with data-fx-carry) the layer is scaled, clipped and faded every frame. Backdrop blurs inside it (the list panels, their
     * edge-blur layers, the toast, the settings sheet) are then re-rendered every frame for nothing: the layer's opacity makes it
     * the backdrop root, so they no longer blur the wallpaper, and the window already blurs that. This is what made closing
     * the screens stutter. The glass is just its tint for those ~0.5 s; the blurs come back two frames after the window settled.
     * !important: the scoped rules of the components are more specific than this one.
     */
    :global([data-fx-carry] .ios-viewport),
    :global([data-fx-carry] .ios-viewport *) {
        -webkit-backdrop-filter: none !important;
        backdrop-filter: none !important;
    }
</style>
