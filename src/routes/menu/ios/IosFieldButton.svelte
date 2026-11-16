<!--
    A small round glass button at the right end of an IosField (`trailing` snippet), e.g. the dice that makes a random username.
    Same press physics as every other button (swell on touch, squeeze on release), a little gentler because it is small.
-->
<script lang="ts">
    import type {Snippet} from "svelte";
    import {pressPhysics} from "../title/main-menu/pressPhysics";

    interface Props {
        title: string;
        disabled?: boolean;
        onclick?: () => void;
        children: Snippet;
    }

    let {title, disabled = false, onclick, children}: Props = $props();
</script>

<button class="fb"
        type="button"
        {title}
        {disabled}
        aria-label={title}
        use:pressPhysics={{strength: 0.4}}
        onclick={(e) => {
            // the field around it is a <label>: a click must not also focus the text
            e.preventDefault();
            onclick?.();
        }}>
    <span data-press-label>{@render children()}</span>
</button>

<style>
    .fb {
        flex: none;
        width: 36px;
        height: 36px;
        margin-right: -6px;
        padding: 0;
        border: 0;
        border-radius: 50%;
        display: grid;
        place-items: center;
        color: var(--ios-text-dim);
        cursor: pointer;
        background: linear-gradient(var(--ios-tint), var(--ios-tint)), var(--ios-control);
        box-shadow: inset 0 0 0 1px var(--ios-hairline);
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        transition: color 0.15s;
        will-change: scale;
    }

    .fb span {
        display: grid;
        place-items: center;
    }

    .fb:hover:not(:disabled) {
        color: var(--ios-text);
    }

    .fb:disabled {
        opacity: 0.4;
        cursor: default;
    }

    .fb:focus-visible {
        outline: 3px solid #ffffff;
        outline-offset: 2px;
    }
</style>
