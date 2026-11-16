<script lang="ts">
    import {listenSticky} from "../../../../integration/ws";
    import type {KeyEvent} from "../../../../integration/events";
    import type {MinecraftKeybind} from "../../../../integration/types";
    import {keyPress} from "./keyPress";

    export let gridArea: string;
    export let key: MinecraftKeybind | undefined;

    let active = false;

    listenSticky("key", (e: KeyEvent) => {
        if (e.key !== key?.key.translationKey) {
            return;
        }

        active = e.action === 1 || e.action === -1;
    });
</script>

<div class="key" style="grid-area: {gridArea};" use:keyPress={active}>
    <span class="label" data-press-label>{key?.key.localized ?? "???"}</span>
</div>

<style lang="scss">
  @use "../../glass" as *;

  // iOS keypad: a glass key that swells and fills with the accent while it is held, and squeezes and jiggles back when it is let go.
  // The motion is `keyPress.ts` (springs, same constants as the ClickGUI buttons): it drives `scale` and `--press` (0..1) on the key.
  .key {
    @include hud-glass(15px, var(--keystrokes-background-color), var(--hud-shadow-sm));

    position: relative;
    height: 50px;
    color: var(--keystrokes-text-color);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: -.01em;
    text-align: center;

    // the accent lives on a layer of its own, so it fades with the spring without touching the glass
    &::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: var(--keystrokes-active-color);
      box-shadow: 0 0 16px color-mix(in srgb, var(--keystrokes-active-color) 55%, transparent);
      opacity: var(--press, 0);

      @supports (corner-shape: squircle) {
        corner-shape: squircle;
      }
    }

    .label {
      position: relative;
      z-index: 1;
    }
  }
</style>
