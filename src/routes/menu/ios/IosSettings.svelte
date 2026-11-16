<!--
    The "settings app": an iOS-style app icon (a square 45px tile, put it last in a button row). Clicking it raises a
    sheet from the bottom of the screen with one slider, the GUI scale. Click anywhere else, press Esc or click the
    icon again to lower it.

    The sheet is moved out of the scaled stage (see `portal`): it keeps a constant size while the GUI scale changes,
    so the slider never moves under the cursor while it is dragged.
-->
<script lang="ts">
    import {GUI_SCALE_MAX, GUI_SCALE_MIN, GUI_SCALE_STEP, guiScale, setGuiScale} from "./guiScale.svelte";
    import {pressPhysics} from "../title/main-menu/pressPhysics";
    import Slider from "../../../components/Slider.svelte";

    let open = $state(false);
    let sheet: HTMLElement;

    const percent = $derived(Math.round(guiScale.value * 100));

    /** Re-parents the node to the unscaled viewport element of the IosStage. */
    function portal(node: HTMLElement) {
        node.closest(".ios-viewport")?.appendChild(node);
        return {
            destroy() {
                node.remove();
            }
        };
    }

    function toggle() {
        open = !open;
        if (open) {
            // Let the keyboard adjust the slider right away.
            requestAnimationFrame(() => sheet?.querySelector<HTMLElement>("[role=slider]")?.focus({preventScroll: true}));
        }
    }

    function onWindowKeyDown(e: KeyboardEvent) {
        if (open && e.key === "Escape") {
            open = false;
        }
    }
</script>

<svelte:window onkeydown={onWindowKeyDown}/>

<div class="settings">
    <div class="sheet-root" use:portal>
        <!-- Swallows the click that closes the sheet, so it never reaches a button underneath. -->
        <div class="backdrop" class:open aria-hidden="true" onpointerdown={() => (open = false)}></div>

        <div class="sheet" bind:this={sheet} class:open role="dialog" aria-label="GUI scale" aria-hidden={!open} inert={!open}>
            <span class="label">GUI Scale</span>
            <div class="slider">
                <Slider label="GUI scale"
                        min={GUI_SCALE_MIN}
                        max={GUI_SCALE_MAX}
                        step={GUI_SCALE_STEP}
                        big={1.3}
                        value={guiScale.value}
                        oninput={(v) => setGuiScale(v)}/>
            </div>
            <span class="value">{percent}%</span>
        </div>
    </div>

    <button class="app"
            type="button"
            title="Settings"
            aria-label="Settings"
            aria-expanded={open}
            use:pressPhysics
            onclick={toggle}>
        <svg width="27" height="27" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19.38 10.17 L22.09 10.48 L22.09 13.52 L19.38 13.83 L18.51 15.92 L20.20 18.06 L18.06 20.20 L15.92 18.51 L13.83 19.38 L13.52 22.09 L10.48 22.09 L10.17 19.38 L8.08 18.51 L5.94 20.20 L3.80 18.06 L5.49 15.92 L4.62 13.83 L1.91 13.52 L1.91 10.48 L4.62 10.17 L5.49 8.08 L3.80 5.94 L5.94 3.80 L8.08 5.49 L10.17 4.62 L10.48 1.91 L13.52 1.91 L13.83 4.62 L15.92 5.49 L18.06 3.80 L20.20 5.94 L18.51 8.08Z M15.1 12A3.1 3.1 0 1 0 8.9 12A3.1 3.1 0 1 0 15.1 12Z" fill="currentColor" fill-rule="evenodd"></path>
        </svg>
    </button>
</div>

<style>
    .settings {
        position: relative;
        width: 45px;
        height: 45px;
    }

    .app {
        width: 45px;
        height: 45px;
        padding: 0;
        border: 0;
        border-radius: 13px;
        display: grid;
        place-items: center;
        color: #ffffff;
        cursor: pointer;
        background: linear-gradient(160deg, #a3a3aa, #6a6a72);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22), 0 2px 8px rgba(0, 0, 0, 0.25);
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        /* swell / squeeze / brightness come from the spring action (scale + filter) */
        will-change: scale;
    }

    .app:focus-visible {
        outline: 3px solid #ffffff;
        outline-offset: 2px;
    }

    /* --- sheet (lives in the unscaled viewport after `portal`) ------------------------------------------------ */
    .sheet-root {
        position: absolute;
        inset: 0;
        pointer-events: none;
    }

    .backdrop {
        position: absolute;
        inset: 0;
        pointer-events: none;
    }

    .backdrop.open {
        pointer-events: auto;
    }

    .sheet {
        position: absolute;
        left: 50%;
        bottom: 22px;
        width: 400px;
        height: 58px;
        box-sizing: border-box;
        padding: 0 22px;
        display: flex;
        align-items: center;
        gap: 16px;
        border-radius: 20px;
        background: rgba(58, 54, 62, 0.78);
        -webkit-backdrop-filter: blur(24px) saturate(1.5);
        backdrop-filter: blur(24px) saturate(1.5);
        box-shadow: inset 0 0 0 1px var(--ios-hairline), inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 16px 40px rgba(0, 0, 0, 0.4);
        pointer-events: auto;
        transform-origin: 50% 100%;

        /* Lowered: below the bottom edge of the screen. Accelerates away. */
        visibility: hidden;
        transform: translateX(-50%) translateY(calc(100% * var(--ios-base-scale, 1) + 70px)) scale(var(--ios-base-scale, 1));
        transition: transform 0.42s cubic-bezier(0.5, 0, 0.75, 0.35), visibility 0s linear 0.42s;
    }

    /* Raised: rises from the bottom edge and eases out. */
    .sheet.open {
        visibility: visible;
        transform: translateX(-50%) scale(var(--ios-base-scale, 1));
        transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1), visibility 0s;
    }

    .label {
        font-size: 14px;
        font-weight: 600;
        white-space: nowrap;
    }

    .value {
        width: 42px;
        text-align: right;
        font-size: 14px;
        color: var(--ios-text-dim);
        font-variant-numeric: tabular-nums;
    }

    /* --- slider ----------------------------------------------------------------------------------------- */
    .slider {
        flex: 1;
        min-width: 0;
        display: flex;
        /* the shared spring slider (src/components/Slider.svelte) takes its colours from these */
        --sl-fill: var(--ios-accent);
        --sl-track: rgba(255, 255, 255, 0.22);
        --sl-focus: #ffffff;
    }
</style>
