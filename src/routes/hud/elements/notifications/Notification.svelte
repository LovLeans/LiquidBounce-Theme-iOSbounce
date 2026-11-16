<script lang="ts">
    import HudIcon from "../HudIcon.svelte";
    import Toggle from "../../../../components/Toggle.svelte";
    import SwapText from "../SwapText.svelte";

    export let title: string;
    export let message: string;
    export let severity: string;

    $: kind = severity.toString().toLowerCase();
    $: isToggle = kind === "enabled" || kind === "disabled";
    $: icon = kind === "success" ? "check" : kind === "error" ? "xmark" : kind === "info" ? "info" : "power";
</script>

<!-- iOS banner: an app-style tile (squircle with a white glyph), title + message, and for module toggles a real switch.
     The keyed list of Notifications.svelte keeps this element when the same module is toggled again, so the switch slides instead of
     being replaced. -->
<div class="notification">
    <div class="tile {kind}">
        <HudIcon name={icon} size={22} line stroke={1.9}/>
    </div>
    <!-- the same module toggled again keeps this element, so a changed title / message damps in and out (SwapText) instead of switching at once -->
    <div class="title"><SwapText text={title} origin="0% 50%"/></div>
    <div class="message"><SwapText text={message} origin="0% 50%"/></div>
    {#if isToggle}
        <!-- the theme's spring switch (components/Toggle.svelte): it only shows the state, and slides when the same module is toggled again -->
        <div class="switch">
            <Toggle checked={kind === "enabled"} size={54} label={title}/>
        </div>
    {/if}
</div>

<style lang="scss">
  @use "../../glass" as *;

  .notification {
    @include hud-glass(var(--hud-r-card), var(--notification-background-color));

    display: grid;
    grid-template-areas:
            "a b d"
            "a c d";
    grid-template-columns: max-content 1fr max-content;
    align-items: center;
    column-gap: 12px;
    row-gap: 1px;
    width: 300px;
    padding: 10px 14px 10px 10px;
  }

  .tile {
    grid-area: a;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 10px; // + the 10px padding round it = the card's 20px (concentric)
    color: #fff;
    --c: var(--notification-info-color);
    // flat: one solid colour, no border, no gradient, no shadow, no glow
    background: var(--c);
    transition: background-color .3s;

    @supports (corner-shape: squircle) {
      corner-shape: squircle;
    }

    &.success { --c: var(--notification-success-color); }
    &.enabled { --c: var(--notification-enabled-color); }
    &.error { --c: var(--notification-error-color); }
    &.info { --c: var(--notification-info-color); }
    &.disabled { --c: var(--notification-disabled-color); }
  }

  .title {
    grid-area: b;
    align-self: end;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: -.01em;
    color: var(--notification-title-color);
  }

  .message {
    grid-area: c;
    align-self: start;
    font-size: 12px;
    line-height: 1.3;
    color: var(--notification-message-color);
  }

  // the spring switch: the accent when it is on. It is only a display, so it takes no presses.
  .switch {
    grid-area: d;
    display: flex;
    align-items: center;
    pointer-events: none;
    --tg-on: var(--notification-enabled-color);
    --tg-off: rgba(120, 120, 128, .5);
  }
</style>
