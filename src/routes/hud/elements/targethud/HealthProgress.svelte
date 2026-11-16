<script lang="ts">
    export let maxHealth: number;
    export let health: number;

    let width = 0;
    $: width = maxHealth > 0 ? Math.max(0, Math.min(100, Math.ceil(health / maxHealth * 100))) : 0;
</script>

<div class="health-progress">
    <div class="thumb" style="width: {width}%;"></div>
</div>

<style lang="scss">

    // a thin capsule (the old bar was a flat strip at the bottom edge of the card)
    .health-progress {
        position: relative;
        height: 6px;
        border-radius: 3px;
        background: var(--hud-fill);
        overflow: hidden;
    }

    .thumb {
        height: 100%;
        min-width: 6px;
        border-radius: 3px;
        background: var(--targethud-health-progress-color);
        box-shadow: 0 0 8px color-mix(in srgb, var(--targethud-health-progress-color) 50%, transparent);
        transition: width .6s var(--hud-smooth);
    }
</style>
