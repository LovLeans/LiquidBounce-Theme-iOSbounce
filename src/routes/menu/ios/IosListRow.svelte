<!--
    One row of an IosScrollList: icon tile, text block (default snippet) and an optional trailing block.

    Text styling helpers for the default snippet: give a line the class `ios-title` or `ios-line`.
    Single click selects (`onselect`), a quick double click / Enter activates (`onactivate`). A press that is held
    (or dragged) is never part of a double click, so holding a row only selects it.
    Holding the row still for HOLD_MS calls `onhold(event)` (used to start a drag-to-reorder); leave it unset for
    rows that cannot be moved.
-->
<script lang="ts">
    import type {Snippet} from "svelte";
    import {createPress} from "./press.svelte";

    interface Props {
        selected?: boolean;
        /** URL or data URI of the icon. */
        image: string;
        /** Shown instead of `image` if that fails to load. */
        fallbackImage?: string;
        /** Align the trailing block and text to the top (server list) instead of the center. */
        alignTop?: boolean;
        /** Slides + fades the row in when it appears, after this many ms (stagger rows by their index). */
        enterDelay?: number;
        element?: HTMLElement;
        onselect?: () => void;
        onactivate?: () => void;
        onhold?: (event: PointerEvent) => void;
        children: Snippet;
        trailing?: Snippet;
    }

    let {
        selected = false,
        image,
        fallbackImage,
        alignTop = false,
        enterDelay,
        element = $bindable(),
        onselect,
        onactivate,
        onhold,
        children,
        trailing
    }: Props = $props();

    const press = createPress();
    $effect(() => () => press.dispose());

    const HOLD_MS = 380;
    /** Two clicks within this time count as a double click... */
    const DOUBLE_CLICK_MS = 400;
    /** ...but only if each of them was a quick tap, not a press that was held down. */
    const TAP_MS = 250;

    let downX = 0;
    let downY = 0;
    let downAt = 0;
    let moved = false;
    let lastTapAt = 0;
    let holdTimer: ReturnType<typeof setTimeout> | undefined;

    $effect(() => () => clearTimeout(holdTimer));

    function onPointerDown(e: PointerEvent) {
        downX = e.clientX;
        downY = e.clientY;
        downAt = performance.now();
        moved = false;
        press.down();

        if (onhold && e.button === 0) {
            holdTimer = setTimeout(() => {
                press.cancel();
                onhold(e);
            }, HOLD_MS);
        }
    }

    function onPointerMove(e: PointerEvent) {
        // A press that turns into a drag is a scroll, not a click or a hold: let go of the pressed look.
        if (Math.abs(e.clientY - downY) > 8 || Math.abs(e.clientX - downX) > 8) {
            moved = true;
            clearTimeout(holdTimer);
            if (press.pressed) {
                press.cancel();
            }
        }
    }

    function onPointerEnd() {
        clearTimeout(holdTimer);
        press.up();
    }

    function onClick() {
        const now = performance.now();
        const isTap = !moved && now - downAt <= TAP_MS;

        onselect?.();

        if (isTap && now - lastTapAt <= DOUBLE_CLICK_MS) {
            lastTapAt = 0;
            onactivate?.();
        } else {
            lastTapAt = isTap ? now : 0;
        }
    }

    function onImageError(e: Event) {
        const img = e.currentTarget as HTMLImageElement;
        // Only once: never loop if the fallback fails to load too.
        if (fallbackImage && !img.dataset.fallbackUsed) {
            img.dataset.fallbackUsed = "1";
            img.src = fallbackImage;
        }
    }

    function onKeyDown(e: KeyboardEvent) {
        if (e.key === "Enter") {
            e.preventDefault();
            onactivate?.();
        } else if (e.key === " ") {
            e.preventDefault();
            onselect?.();
        }
    }
</script>

<div class="row"
     class:selected
     class:pressed={press.pressed}
     class:top={alignTop}
     class:enter={enterDelay !== undefined}
     style:--enter-delay={enterDelay !== undefined ? `${enterDelay}ms` : undefined}
     role="option"
     aria-selected={selected}
     tabindex="-1"
     bind:this={element}
     onpointerdown={onPointerDown}
     onpointermove={onPointerMove}
     onpointerup={onPointerEnd}
     onpointerleave={onPointerEnd}
     onpointercancel={onPointerEnd}
     onmousedown={(e) => e.preventDefault()}
     onclick={onClick}
     onkeydown={onKeyDown}>
    <img class="tile" src={image} alt="" draggable="false" onerror={onImageError}>
    <div class="text">
        {@render children()}
    </div>
    {#if trailing}
        <div class="trailing">
            {@render trailing()}
        </div>
    {/if}
</div>

<style>
    .row {
        height: 78px;
        box-sizing: border-box;
        margin-bottom: 3px;
        padding: 0 14px;
        display: flex;
        align-items: center;
        gap: 15px;
        border-radius: 17px;
        background: var(--ios-row);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        touch-action: none;
        transition: transform 0.55s cubic-bezier(0.34, 1.7, 0.5, 1), filter 0.35s ease-out;
    }

    /* `backwards`: nothing is left behind once it is over, so press / reorder transforms work as usual. */
    .row.enter {
        animation: row-in 0.5s cubic-bezier(0.2, 0.8, 0.3, 1) var(--enter-delay, 0ms) backwards;
    }

    @keyframes row-in {
        from {
            opacity: 0;
            transform: translateY(14px) scale(0.97);
        }
    }

    .row.top {
        align-items: flex-start;
        padding-top: 12px;
    }

    .row.selected {
        background: var(--ios-row-selected);
        box-shadow: inset 0 0 0 2px var(--ios-accent);
    }

    .row.pressed {
        transform: scale(0.965);
        filter: brightness(0.82);
        transition: transform 0.1s cubic-bezier(0.2, 0.8, 0.3, 1), filter 0.1s ease-out;
    }

    .row:focus-visible {
        outline: 3px solid #ffffff;
        outline-offset: 2px;
    }

    .tile {
        width: 55px;
        height: 55px;
        flex: none;
        border-radius: 14px;
        object-fit: cover;
        image-rendering: pixelated;
        background: rgba(255, 255, 255, 0.08);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2);
    }

    .text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .text :global(.ios-title) {
        font-size: 16px;
        line-height: 20px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .text :global(.ios-line) {
        font-size: 13px;
        line-height: 17px;
        color: var(--ios-text-dim);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .trailing {
        flex: none;
        display: flex;
        align-items: center;
        gap: 9px;
    }

    .row.top .trailing {
        margin-top: 2px;
    }
</style>
