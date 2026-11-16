<!--
    The small round "random" button at the end of a username field (IosField `trailing`): a die, with the press physics of the
    other round buttons.
-->
<script lang="ts">
    import {pressPhysics} from "../title/main-menu/pressPhysics";

    interface Props {
        title?: string;
        onclick: () => void;
    }

    let {title = "Random username", onclick}: Props = $props();
</script>

<button class="dice" type="button" {title} aria-label={title} use:pressPhysics onclick={() => onclick()}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
         stroke-linejoin="round" aria-hidden="true">
        <rect x="3.5" y="3.5" width="17" height="17" rx="4.5"></rect>
        <circle cx="8.6" cy="8.6" r="0.6" fill="currentColor"></circle>
        <circle cx="15.4" cy="8.6" r="0.6" fill="currentColor"></circle>
        <circle cx="12" cy="12" r="0.6" fill="currentColor"></circle>
        <circle cx="8.6" cy="15.4" r="0.6" fill="currentColor"></circle>
        <circle cx="15.4" cy="15.4" r="0.6" fill="currentColor"></circle>
    </svg>
</button>

<style>
    .dice {
        flex: none;
        width: 34px;
        height: 34px;
        margin-right: -6px;
        padding: 0;
        border: 0;
        border-radius: 50%;
        display: grid;
        place-items: center;
        cursor: pointer;
        color: var(--ios-text-dim);
        background: rgba(255, 255, 255, 0.1);
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        transition: color 0.15s;
        will-change: scale;
    }

    .dice:hover {
        color: var(--ios-text);
    }

    .dice:focus-visible {
        outline: 3px solid #ffffff;
        outline-offset: 2px;
    }
</style>
