<!--
    iOS-style toggle chip (filters). A small switch dot plus a label. Squishes while pressed and springs back with
    an overshoot on release, like IosButton. `selected` is the on state. Fills the width of its grid cell.
-->
<script lang="ts">
    import type {Snippet} from "svelte";
    import {pressPhysics} from "../title/main-menu/pressPhysics";

    interface Props {
        selected?: boolean;
        title?: string;
        onclick?: () => void;
        children: Snippet;
    }

    let {selected = false, title, onclick, children}: Props = $props();

</script>

<button class="chip"
        class:selected
        type="button"
        aria-pressed={selected}
        {title}
        use:pressPhysics
        onclick={() => onclick?.()}>
    <!-- counter-scaled by the press physics so the text is not stretched -->
    <span class="inner" data-press-label>
        <span class="dot" aria-hidden="true"></span>
        <span class="label">{@render children()}</span>
    </span>
</button>

<style>
    .chip {
        width: 100%;
        height: 36px;
        box-sizing: border-box;
        border: 0;
        border-radius: 18px;
        padding: 0 14px;
        font-family: inherit;
        font-size: 13px;
        font-weight: 600;
        line-height: 1;
        color: var(--ios-text-dim);
        cursor: pointer;
        background: linear-gradient(var(--ios-tint), var(--ios-tint)), var(--ios-field);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        /* swell / squeeze / brightness come from the spring action (transform + filter) */
        transition: background-color 0.3s ease-out, color 0.25s ease-out, box-shadow 0.25s ease-out;
        will-change: scale;
    }

    .inner {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 9px;
        width: 100%;
        height: 100%;
        min-width: 0;
    }

    .chip.selected {
        color: var(--ios-text);
        background: linear-gradient(color-mix(in srgb, var(--ios-accent) 34%, transparent),
        color-mix(in srgb, var(--ios-accent) 34%, transparent)), var(--ios-field);
        box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--ios-accent) 80%, transparent);
    }

    .chip:hover {
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.3), inset 0 0 0 100px rgba(255, 255, 255, 0.07);
    }

    .chip.selected:hover {
        box-shadow: inset 0 0 0 1.5px var(--ios-accent), inset 0 0 0 100px rgba(255, 255, 255, 0.07);
    }

    .chip:focus-visible {
        outline: 3px solid #ffffff;
        outline-offset: 2px;
    }

    .dot {
        flex: none;
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.28);
        transition: transform 0.55s cubic-bezier(0.34, 1.7, 0.5, 1), background-color 0.25s ease-out,
        box-shadow 0.25s ease-out;
    }

    .selected .dot {
        transform: scale(1.15);
        background: #ffffff;
        box-shadow: 0 0 8px var(--ios-accent), 0 0 0 3px color-mix(in srgb, var(--ios-accent) 55%, transparent);
    }

    .label {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
</style>
