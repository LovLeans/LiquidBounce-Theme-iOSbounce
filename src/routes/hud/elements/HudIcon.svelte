<script lang="ts">
    /*
     * The HUD's one icon set (24 x 24, filled, drawn in currentColor), so every element speaks the same visual language and none of
     * them depends on a loose svg file. Glyphs are the Material Design icons (Apache 2.0) except `info`, which is hand-drawn.
     */
    export let name: HudIconName;
    export let size: number = 14;
    /** the slim variant: the same glyph drawn as a round-capped line (only the glyphs that have one, see LINES) instead of filled */
    export let line: boolean = false;
    /** stroke width of a line glyph, in the 24 x 24 grid */
    export let stroke: number = 2;

    const PATHS = {
        heart: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
        shield: "M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z",
        food: "M16 6v8h3v8h2V2c-2.76 0-5 2.24-5 4zm-5 3H9V2H7v7H5V2H3v7c0 2.21 1.79 4 4 4v9h2v-9c2.21 0 4-1.79 4-4V2h-2v7z",
        drop: "M12 2c-5.33 4.55-8 8.48-8 11.8 0 4.98 3.8 8.2 8 8.2s8-3.22 8-8.2c0-3.32-2.67-7.25-8-11.8z",
        keyboard: "M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z",
        check: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
        xmark: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
        info: "M10.9 10h2.2v7.2h-2.2zM12 5.7a1.35 1.35 0 1 0 0 2.7 1.35 1.35 0 0 0 0-2.7z",
        power: "M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.58-5.42L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z",
        left: "M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z",
        right: "M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"
    } as const;

    // Line glyphs (the notification tile, the Binds header): one stroke, round caps, no fill. A dot is a zero-length line.
    const LINES: Partial<Record<keyof typeof PATHS, string>> = {
        power: "M12 3.5v8.2M6.86 5.87a8 8 0 1 0 10.28 0",
        check: "M5.5 12.8l4.2 4.2L18.5 8",
        xmark: "M7 7l10 10M17 7L7 17",
        info: "M12 11v6M12 7.4h.01",
        keyboard: "M6 6h12a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3zM7.2 10h.01M10.4 10h.01M13.6 10h.01M16.8 10h.01M8.5 14h7"
    };

    type HudIconName = keyof typeof PATHS;

    $: lined = line && LINES[name] !== undefined;
</script>

{#if lined}
    <svg class="hud-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={stroke}
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d={LINES[name] ?? ""}/>
    </svg>
{:else}
    <svg class="hud-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d={PATHS[name]}/>
    </svg>
{/if}

<style>
    .hud-icon {
        display: block;
        flex: none;
    }
</style>
