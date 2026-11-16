<!--
    iOS-style button with the lock-screen press physics (see title/main-menu/pressPhysics.ts): it swells and brightens on touch,
    squeezes on release and springs back, exactly like the trash / Customize buttons. `strength` scales that (1 = the full feel,
    e.g. 0.3 for the alts button). `span` is the number of grid columns it takes inside an IosButtonGrid.
-->
<script lang="ts">
    import type {Snippet} from "svelte";
    import {DEFAULT_STRENGTH, pressPhysics} from "../title/main-menu/pressPhysics";

    interface Props {
        variant?: "plain" | "primary" | "danger";
        disabled?: boolean;
        span?: number;
        /** How strongly it swells / squeezes when pressed (1 = the full lock-screen trash / Customize feel, default 0.55). */
        strength?: number;
        title?: string;
        /** The <button>, for things that grow out of it (see ExpandWindow). */
        element?: HTMLElement;
        onclick?: () => void;
        children: Snippet;
    }

    let {variant = "plain", disabled = false, span = 1, strength = DEFAULT_STRENGTH, title, element = $bindable(), onclick, children}: Props = $props();
</script>

<button class="ios-button {variant}"
        bind:this={element}
        type="button"
        {disabled}
        {title}
        style:grid-column="span {span}"
        use:pressPhysics={{strength}}
        onclick={() => onclick?.()}>
    <!-- the label is counter-scaled by the press physics so the text grows with the button instead of stretching -->
    <span class="lbl" data-press-label>{@render children()}</span>
</button>

<style>
    .ios-button {
        height: 45px;
        border: 0;
        border-radius: 13px;
        padding: 0 12px;
        font-family: inherit;
        font-size: 14px;
        font-weight: 600;
        line-height: 1;
        color: var(--ios-text);
        cursor: pointer;
        background: linear-gradient(var(--ios-tint), var(--ios-tint)), var(--ios-control);
        box-shadow: inset 0 0 0 1px var(--ios-hairline);
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        /* the swell / squeeze / brightness are driven by the spring action (transform + filter), not by CSS */
        transition: box-shadow 0.15s;
        will-change: scale;
    }

    .lbl {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        min-width: 0;
    }

    .ios-button.primary {
        background: var(--ios-accent);
    }

    .ios-button.danger {
        color: var(--ios-danger);
    }

    .ios-button:hover:not(:disabled) {
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.3), inset 0 0 0 100px rgba(255, 255, 255, 0.09);
    }

    .ios-button:disabled {
        opacity: 0.4;
        cursor: default;
    }

    .ios-button:focus-visible {
        outline: 3px solid #ffffff;
        outline-offset: 2px;
    }
</style>
