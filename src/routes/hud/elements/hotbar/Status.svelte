<script lang="ts">
    import SwapText from "../SwapText.svelte";

    export let max: number;
    export let value: number;
    export let color: string;
    export let alignRight: boolean;
    export let label: string | null = null;

    // 0..100, never NaN (max can be 0 for a moment, e.g. absorption right after it ran out)
    $: percent = max > 0 ? Math.max(0, Math.min(100, Math.floor((value / max) * 100))) : 0;
</script>

<!-- A small glass capsule with a thin track and its fill, and the level next to it (experience only). There are no icons: the colour says what
     the bar is. `alignRight` mirrors everything (the fill then grows from the right). -->
<div class="status" class:align-right={alignRight} style="--c: {color}">
    <div class="track">
        <div class="fill" class:empty={percent === 0} style="width: {percent}%"></div>
    </div>
    {#if label}
        <span class="label"><SwapText text={label}/></span>
    {/if}
</div>

<style lang="scss">
  @use "../../glass" as *;

  .status {
    @include hud-glass(12px, var(--hotbar-status-background-color), var(--hud-shadow-sm), false);

    display: flex;
    align-items: center;
    gap: 8px;
    height: 24px;
    padding: 0 10px;

    &.align-right {
      flex-direction: row-reverse;

      .track {
        justify-content: flex-end;
      }
    }
  }

  .track {
    flex: 1;
    display: flex;
    height: 6px;
    border-radius: 3px;
    background: var(--hud-fill);
    overflow: hidden;
  }

  .fill {
    height: 100%;
    min-width: 6px; // a rounded cap even for a sliver, so 1 hp is still a visible dot
    border-radius: 3px;
    background: var(--c);
    box-shadow: 0 0 8px color-mix(in srgb, var(--c) 50%, transparent);
    will-change: width;
    transition: width .45s var(--hud-smooth);

    &.empty {
      min-width: 0;
      box-shadow: none;
    }
  }

  .label {
    color: var(--hotbar-text-color);
    font-size: 12px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    min-width: 14px;
    text-align: center;
  }
</style>
