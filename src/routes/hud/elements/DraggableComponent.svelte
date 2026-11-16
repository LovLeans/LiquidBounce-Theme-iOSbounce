<script lang="ts">
    import {getContext, onDestroy, onMount, tick} from "svelte";
    import {reloadHud} from "../reload";

    import type {KeyboardKeyEvent, ScaleFactorChangeEvent} from "../../../integration/events";
    import {bringComponentToFront, getGameWindow, setComponentAlignment} from "../../../integration/rest";
    import {type Alignment, HorizontalAlignment, VerticalAlignment} from "../../../integration/types.js";
    import {listenSticky} from "../../../integration/ws";
    import {
        type HorizontalAnchorZone,
        HUD_EDITOR_ELEMENTS_CONTEXT,
        HUD_EDITOR_GRID_SIZE,
        HUD_EDITOR_MAGNET_THRESHOLD,
        type HudEditorDragState,
        type VerticalAnchorZone
    } from "../constants";
    import {fade, type TransitionConfig} from "svelte/transition";

    export let alignment: Alignment;
    export let componentId: string;
    export let componentName: string;
    export let inEditor: boolean;
    export let onDragStateChange: ((state: HudEditorDragState) => void) | undefined = undefined;
    // called with the position a drag ended at, before it is sent to the client: the theme keeps the position itself (see positions.ts)
    export let onPositionSaved: ((alignment: Alignment) => void) | undefined = undefined;
    // called when the user removes the component in the editor (the [x] of the popover): the theme hides it itself, see positions.ts
    export let onRemoved: (() => void) | undefined = undefined;
    export let magneticallyReferenced = false;
    export let width: number | undefined = undefined;
    export let height: number | undefined = undefined;
    export let zIndex = 0;
    // the fade-in only plays while the HUD first appears (see Hud.svelte), not when the client swaps the components for new ones
    export let animateIn = true;
    // the popover shown over the component in the HUD editor (the iOS GUI passes its own); nothing when not given
    export let settingsComponent: any = undefined;

    let scaleFactor = 2;
    let element: HTMLElement | undefined;
    let isDragging = false;
    // The position the drag ended up at, copied after every mouse move. Only a drag that really moved is saved, and it is saved from this copy:
    // the `alignment` prop can be swapped for the client's own object in the middle of a drag (a `componentsUpdate`), and a click used to save
    // whatever the box held at that moment, which was often the client's old position.
    let dragResult: Alignment | undefined;
    let isGridIgnored = false;
    let pointerCenterOffsetX = 0;
    let pointerCenterOffsetY = 0;
    let horizontalZone: HorizontalAnchorZone = "left";
    let verticalZone: VerticalAnchorZone = "upper";
    let verticalGuide: number | undefined;
    let horizontalGuide: number | undefined;
    let horizontalTargetId: string | undefined;
    let verticalTargetId: string | undefined;
    let displayedZIndex = zIndex;

    let displayPosition = {
        x: 0,
        y: 0
    };
    let positionOnTop = false;

    const POSITION_OVERLAY_OFFSET = 19;

    const editorElements = getContext<Map<string, HTMLElement>>(HUD_EDITOR_ELEMENTS_CONTEXT);

    $: styleString = generateStyleString(alignment ?? {
        horizontalAlignment: HorizontalAlignment.LEFT,
        verticalAlignment: VerticalAlignment.TOP,
        horizontalOffset: 0,
        verticalOffset: 0
    });
    $: displayedZIndex = zIndex;
    $: sizeStyleString = (width !== undefined && height !== undefined)
        ? `width: ${width}px; height: ${height}px;`
        : "";

    function clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(value, max));
    }

    function toHudCoordinate(clientCoordinate: number): number {
        return clientCoordinate * (2 / scaleFactor);
    }

    function getHudWidth(): number {
        return toHudCoordinate(window.innerWidth);
    }

    function getHudHeight(): number {
        return toHudCoordinate(window.innerHeight);
    }

    function getElementWidth(): number {
        return toHudCoordinate(element?.getBoundingClientRect().width ?? 0);
    }

    function getElementHeight(): number {
        return toHudCoordinate(element?.getBoundingClientRect().height ?? 0);
    }

    function getHorizontalCenter(): number {
        const elementWidth = getElementWidth();
        const hudWidth = getHudWidth();

        switch (alignment.horizontalAlignment) {
            case HorizontalAlignment.LEFT:
                return alignment.horizontalOffset + elementWidth / 2;
            case HorizontalAlignment.RIGHT:
                return hudWidth - alignment.horizontalOffset - elementWidth / 2;
            case HorizontalAlignment.CENTER:
                return hudWidth / 2 + alignment.horizontalOffset + elementWidth / 2;
            case HorizontalAlignment.CENTER_TRANSLATED:
                return hudWidth / 2 + alignment.horizontalOffset;
        }
    }

    function getVerticalCenter(): number {
        const elementHeight = getElementHeight();
        const hudHeight = getHudHeight();

        switch (alignment.verticalAlignment) {
            case VerticalAlignment.TOP:
                return alignment.verticalOffset + elementHeight / 2;
            case VerticalAlignment.BOTTOM:
                return hudHeight - alignment.verticalOffset - elementHeight / 2;
            case VerticalAlignment.CENTER:
                return hudHeight / 2 + alignment.verticalOffset + elementHeight / 2;
            case VerticalAlignment.CENTER_TRANSLATED:
                return hudHeight / 2 + alignment.verticalOffset;
        }
    }

    function getHorizontalZone(cursorX: number): HorizontalAnchorZone {
        const hudWidth = getHudWidth();

        if (cursorX < hudWidth / 3) {
            return "left";
        }
        if (cursorX > hudWidth * 2 / 3) {
            return "right";
        }
        return "center";
    }

    function getVerticalZone(cursorY: number): VerticalAnchorZone {
        const hudHeight = getHudHeight();

        if (cursorY < hudHeight / 3) {
            return "upper";
        }
        if (cursorY > hudHeight * 2 / 3) {
            return "lower";
        }
        return "center";
    }

    function getHorizontalAlignment(zone: HorizontalAnchorZone): HorizontalAlignment {
        switch (zone) {
            case "left":
                return HorizontalAlignment.LEFT;
            case "center":
                return HorizontalAlignment.CENTER_TRANSLATED;
            case "right":
                return HorizontalAlignment.RIGHT;
        }
    }

    function getVerticalAlignment(zone: VerticalAnchorZone): VerticalAlignment {
        switch (zone) {
            case "upper":
                return VerticalAlignment.TOP;
            case "center":
                return VerticalAlignment.CENTER_TRANSLATED;
            case "lower":
                return VerticalAlignment.BOTTOM;
        }
    }

    function getHorizontalOffset(center: number, anchor: HorizontalAlignment): number {
        const elementWidth = getElementWidth();
        const hudWidth = getHudWidth();

        switch (anchor) {
            case HorizontalAlignment.LEFT:
                return center - elementWidth / 2;
            case HorizontalAlignment.RIGHT:
                return hudWidth - center - elementWidth / 2;
            case HorizontalAlignment.CENTER:
                return center - hudWidth / 2 - elementWidth / 2;
            case HorizontalAlignment.CENTER_TRANSLATED:
                return center - hudWidth / 2;
        }
    }

    function getVerticalOffset(center: number, anchor: VerticalAlignment): number {
        const elementHeight = getElementHeight();
        const hudHeight = getHudHeight();

        switch (anchor) {
            case VerticalAlignment.TOP:
                return center - elementHeight / 2;
            case VerticalAlignment.BOTTOM:
                return hudHeight - center - elementHeight / 2;
            case VerticalAlignment.CENTER:
                return center - hudHeight / 2 - elementHeight / 2;
            case VerticalAlignment.CENTER_TRANSLATED:
                return center - hudHeight / 2;
        }
    }

    interface MagneticSnap {
        center: number;
        guide: number;
        targetId?: string;
    }

    function emitDragState(dragging: boolean): void {
        onDragStateChange?.({
            dragging,
            horizontalZone,
            verticalZone,
            verticalGuide,
            horizontalGuide,
            magneticTargetIds: [...new Set([horizontalTargetId, verticalTargetId].filter(id => id !== undefined))],
        });
    }

    function updateDragState(
        nextHorizontalZone: HorizontalAnchorZone,
        nextVerticalZone: VerticalAnchorZone,
        nextVerticalGuide?: number,
        nextHorizontalGuide?: number,
        nextHorizontalTargetId?: string,
        nextVerticalTargetId?: string,
    ): void {
        if (horizontalZone === nextHorizontalZone &&
            verticalZone === nextVerticalZone &&
            verticalGuide === nextVerticalGuide &&
            horizontalGuide === nextHorizontalGuide &&
            horizontalTargetId === nextHorizontalTargetId &&
            verticalTargetId === nextVerticalTargetId) {
            return;
        }

        horizontalZone = nextHorizontalZone;
        verticalZone = nextVerticalZone;
        verticalGuide = nextVerticalGuide;
        horizontalGuide = nextHorizontalGuide;
        horizontalTargetId = nextHorizontalTargetId;
        verticalTargetId = nextVerticalTargetId;
        emitDragState(true);
    }

    function getElementPoints(target: HTMLElement, horizontal: boolean): number[] {
        const bounds = target.getBoundingClientRect();
        const start = toHudCoordinate(horizontal ? bounds.left : bounds.top);
        const size = toHudCoordinate(horizontal ? bounds.width : bounds.height);

        return [start, start + size / 2, start + size];
    }

    function findMagneticSnap(center: number, size: number, horizontal: boolean): MagneticSnap | undefined {
        if (isGridIgnored) {
            return undefined;
        }

        const draggedPoints = [center - size / 2, center, center + size / 2];
        const viewportSize = horizontal ? getHudWidth() : getHudHeight();
        const viewportCenter = viewportSize / 2;
        const viewportCenterDistance = viewportCenter - center;
        let closestSnap: MagneticSnap | undefined = Math.abs(viewportCenterDistance) <= HUD_EDITOR_MAGNET_THRESHOLD
            ? {center: viewportCenter, guide: viewportCenter}
            : undefined;
        let closestDistance = closestSnap
            ? Math.abs(viewportCenterDistance)
            : HUD_EDITOR_MAGNET_THRESHOLD + 1;

        for (const [id, target] of editorElements) {
            if (id === componentId) {
                continue;
            }

            for (const targetPoint of getElementPoints(target, horizontal)) {
                for (const draggedPoint of draggedPoints) {
                    const distance = targetPoint - draggedPoint;
                    const snappedCenter = center + distance;

                    if (Math.abs(distance) > HUD_EDITOR_MAGNET_THRESHOLD ||
                        Math.abs(distance) >= closestDistance ||
                        snappedCenter - size / 2 < 0 ||
                        snappedCenter + size / 2 > viewportSize) {
                        continue;
                    }

                    closestDistance = Math.abs(distance);
                    closestSnap = {center: snappedCenter, guide: targetPoint, targetId: id};
                }
            }
        }

        return closestSnap;
    }

    function onMouseDown(event: MouseEvent): void {
        if (inEditor && event.button === 0) {
            updateZIndex();
        }

        if (event.button !== 0 && event.button !== 1) {
            return;
        }

        isDragging = true;
        dragResult = undefined;
        const horizontalCenter = getHorizontalCenter();
        const verticalCenter = getVerticalCenter();
        const cursorX = toHudCoordinate(event.clientX);
        const cursorY = toHudCoordinate(event.clientY);

        pointerCenterOffsetX = horizontalCenter - cursorX;
        pointerCenterOffsetY = verticalCenter - cursorY;
        horizontalZone = getHorizontalZone(cursorX);
        verticalZone = getVerticalZone(cursorY);
        verticalGuide = undefined;
        horizontalGuide = undefined;
        horizontalTargetId = undefined;
        verticalTargetId = undefined;
        updateDisplayedPosition();
        emitDragState(true);
    }

    async function updateZIndex(): Promise<void> {
        const id = componentId;
        displayedZIndex = await bringComponentToFront(id);
    }

    async function updateDisplayedPosition(): Promise<void> {
        await tick();

        if (!element) {
            return;
        }

        const bounds = element.getBoundingClientRect();
        displayPosition = {
            x: Math.round(bounds.x),
            y: Math.round(bounds.y)
        };
        positionOnTop = bounds.top + bounds.height / 2 >= window.innerHeight / 2;
    }

    // A mouse reports 500-1000 times a second, the screen draws 60-240. Every onMouseMove does several forced layouts (getBoundingClientRect
    // of this box and of the snap targets) and state writes, so dragging lagged. Only the newest position of a frame is handled now;
    // endDrag() handles a pending one first, so the drop still lands exactly where the mouse was released.
    let pendingMove: MouseEvent | undefined;
    let moveFrame = 0;

    function onMouseMoveFrame(event: MouseEvent): void {
        if (!isDragging) {
            return;
        }

        pendingMove = event;
        if (!moveFrame) {
            moveFrame = requestAnimationFrame(() => {
                moveFrame = 0;
                flushMove();
            });
        }
    }

    function flushMove(): void {
        if (moveFrame) {
            cancelAnimationFrame(moveFrame);
            moveFrame = 0;
        }

        const event = pendingMove;
        pendingMove = undefined;
        if (event) {
            onMouseMove(event);
        }
    }

    function onMouseMove(event: MouseEvent): void {
        if (!isDragging) {
            return;
        }

        const cursorX = toHudCoordinate(event.clientX);
        const cursorY = toHudCoordinate(event.clientY);
        const horizontalCenter = cursorX + pointerCenterOffsetX;
        const verticalCenter = cursorY + pointerCenterOffsetY;
        const nextHorizontalZone = getHorizontalZone(cursorX);
        const nextVerticalZone = getVerticalZone(cursorY);
        const elementWidth = getElementWidth();
        const elementHeight = getElementHeight();
        const horizontalSnap = findMagneticSnap(horizontalCenter, elementWidth, true);
        const verticalSnap = findMagneticSnap(verticalCenter, elementHeight, false);

        alignment.horizontalAlignment = getHorizontalAlignment(nextHorizontalZone);
        alignment.verticalAlignment = getVerticalAlignment(nextVerticalZone);

        const horizontalOffset = getHorizontalOffset(
            horizontalSnap?.center ?? horizontalCenter,
            alignment.horizontalAlignment
        );
        const verticalOffset = getVerticalOffset(
            verticalSnap?.center ?? verticalCenter,
            alignment.verticalAlignment
        );

        alignment.horizontalOffset = clampHorizontalOffset(
            horizontalSnap ? horizontalOffset : snapToGrid(horizontalOffset)
        );
        alignment.verticalOffset = clampVerticalOffset(
            verticalSnap ? verticalOffset : snapToGrid(verticalOffset)
        );

        updateDragState(
            nextHorizontalZone,
            nextVerticalZone,
            horizontalSnap?.guide,
            verticalSnap?.guide,
            horizontalSnap?.targetId,
            verticalSnap?.targetId,
        );
        updateDisplayedPosition();
        dragResult = {...alignment};
    }

    function clampHorizontalOffset(offset: number): number {
        const elementWidth = getElementWidth();
        const hudWidth = getHudWidth();

        switch (alignment.horizontalAlignment) {
            case HorizontalAlignment.CENTER_TRANSLATED:
                return clamp(
                    offset,
                    -hudWidth / 2 + elementWidth / 2,
                    hudWidth / 2 - elementWidth / 2
                );
            case HorizontalAlignment.CENTER:
                return clamp(
                    offset,
                    -hudWidth / 2,
                    hudWidth / 2 - elementWidth
                );
            case HorizontalAlignment.LEFT:
            case HorizontalAlignment.RIGHT:
                return clamp(offset, 0, hudWidth - elementWidth);
        }
    }

    function clampVerticalOffset(offset: number): number {
        const elementHeight = getElementHeight();
        const hudHeight = getHudHeight();

        switch (alignment.verticalAlignment) {
            case VerticalAlignment.CENTER_TRANSLATED:
                return clamp(
                    offset,
                    -hudHeight / 2 + elementHeight / 2,
                    hudHeight / 2 - elementHeight / 2
                );
            case VerticalAlignment.CENTER:
                return clamp(
                    offset,
                    -hudHeight / 2,
                    hudHeight / 2 - elementHeight
                );
            case VerticalAlignment.TOP:
            case VerticalAlignment.BOTTOM:
                return clamp(offset, 0, hudHeight - elementHeight);
        }
    }

    function snapToGrid(value: number): number {
        return isGridIgnored ? value : Math.round(value / HUD_EDITOR_GRID_SIZE) * HUD_EDITOR_GRID_SIZE;
    }

    // Saves go one after another, so a slow one cannot land after (and overwrite) a newer one.
    let saveQueue: Promise<void> = Promise.resolve();

    function saveAlignment(result: Alignment): void {
        const id = componentId;
        const snapshot: Alignment = {...result};

        onPositionSaved?.({...snapshot});

        saveQueue = saveQueue.then(async () => {
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    await setComponentAlignment(id, snapshot);
                    return;
                } catch (e) {
                    console.warn("[Hud] could not save the position of", id, e);
                    await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
                }
            }

            // Not saved: do not leave a position on screen that the client does not have.
            reloadHud();
        });
    }

    function endDrag(): void {
        if (!isDragging) {
            return;
        }

        flushMove();
        isDragging = false;
        verticalGuide = undefined;
        horizontalGuide = undefined;
        horizontalTargetId = undefined;
        verticalTargetId = undefined;
        emitDragState(false);

        const result = dragResult;
        dragResult = undefined;

        if (result) {
            saveAlignment(result);
        }
    }

    function onMouseUp(): void {
        endDrag();
    }

    // The GUI can be closed while a component is being dragged: the drag then ends here instead of being lost unsaved.
    onDestroy(endDrag);

    function generateStyleString(alignment: Alignment): string {
        const translateX = alignment.horizontalAlignment === HorizontalAlignment.CENTER_TRANSLATED ? "-50%" : "0";
        const translateY = alignment.verticalAlignment === VerticalAlignment.CENTER_TRANSLATED ? "-50%" : "0";

        return [
            "position: fixed;",
            getHorizontalStyle(alignment),
            getVerticalStyle(alignment),
            `transform: translate(${translateX}, ${translateY});`
        ].join(" ");
    }

    function getHorizontalStyle(alignment: Alignment): string {
        switch (alignment.horizontalAlignment) {
            case HorizontalAlignment.LEFT:
                return `left: ${alignment.horizontalOffset}px;`;
            case HorizontalAlignment.RIGHT:
                return `right: ${alignment.horizontalOffset}px;`;
            case HorizontalAlignment.CENTER:
            case HorizontalAlignment.CENTER_TRANSLATED:
                return `left: calc(50% + ${alignment.horizontalOffset}px);`;
        }
    }

    function getVerticalStyle(alignment: Alignment): string {
        switch (alignment.verticalAlignment) {
            case VerticalAlignment.TOP:
                return `top: ${alignment.verticalOffset}px;`;
            case VerticalAlignment.BOTTOM:
                return `bottom: ${alignment.verticalOffset}px;`;
            case VerticalAlignment.CENTER:
            case VerticalAlignment.CENTER_TRANSLATED:
                return `top: calc(50% + ${alignment.verticalOffset}px);`;
        }
    }

    // Intro only. With an outro (`transition:`) a component that left the list stayed in the page until its fade-out ended; when that never
    // ended (the page not being painted, a list update in the middle of it) the box stayed for good: invisible, but still on top and taking the mouse.
    function editorFade(node: Element): TransitionConfig {
        return fade(node, {
            duration: inEditor && animateIn ? 200 : 0
        });
    }

    listenSticky("keyboardKey", (e: KeyboardKeyEvent) => {
        if (e.key === "key.keyboard.left.shift") {
            isGridIgnored = e.action === 1;
        }
    });

    // The box lives on when the client gives its component a new id (see Hud.svelte), so the editor's map of boxes (used for snapping to
    // the other components) has to follow the id: under the old one the box would still be found as "another component" and snap to itself.
    let registeredId: string | undefined;

    $: if (inEditor && element && registeredId !== componentId) {
        if (registeredId !== undefined) {
            editorElements.delete(registeredId);
        }

        editorElements.set(componentId, element);
        registeredId = componentId;
    }

    onDestroy(() => {
        if (registeredId !== undefined) {
            editorElements.delete(registeredId);
        }
    });

    onMount(async () => {
        const gameWindow = await getGameWindow();
        scaleFactor = gameWindow.scaleFactor;
    });

    listenSticky("scaleFactorChange", (event: ScaleFactorChangeEvent) => {
        scaleFactor = event.scaleFactor;
    });
</script>

<svelte:window
        on:mouseup={onMouseUp}
        on:mousemove={onMouseMoveFrame}
/>

<div class="draggable-element" data-component-id={componentId} style="{styleString} z-index: {displayedZIndex};" bind:this={element}
     in:editorFade|global>
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
            class="contained-element"
            style={sizeStyleString}
            class:editor-mode={inEditor}
            class:magnetically-referenced={inEditor && magneticallyReferenced}
            on:mousedown={onMouseDown}
    >
        <slot/>
    </div>
    {#if isDragging}
        <div class="position" class:top={positionOnTop} transition:fade={{duration: 100}}>
            {displayPosition.x} &#215; {displayPosition.y}
        </div>
    {/if}
    {#if inEditor && settingsComponent}
        <svelte:component this={settingsComponent}
                name={componentName}
                id={componentId}
                {alignment}
                {onRemoved}
                overlayOffset={isDragging ? POSITION_OVERLAY_OFFSET : 0}
        />
    {/if}
</div>

<style>
    .contained-element {
        min-width: 50px;
        min-height: 50px;
    }

    .editor-mode {
        outline: solid 1px var(--clickgui-hud-editor-draggable-element-outline-color);
        background-color: var(--clickgui-hud-editor-draggable-element-background-color);
        border-radius: var(--clickgui-hud-editor-radius, 0);
        transition: background-color 100ms ease;
    }

    .magnetically-referenced {
        background-color: var(--clickgui-hud-editor-magnetic-reference-background-color);
    }

    .position {
        position: absolute;
        top: calc(100% + 5px);
        left: 0;
        width: max-content;
        height: 14px;
        color: var(--clickgui-text-dimmed-color);
        font-size: 12px;
        text-wrap: nowrap;
        outline: solid 1px var(--clickgui-hud-editor-draggable-element-position-outline-color);
        background-color: var(--clickgui-hud-editor-draggable-element-position-background-color);
        border-radius: var(--clickgui-hud-editor-badge-radius, 0);
        padding: var(--clickgui-hud-editor-badge-padding, 0);
    }

    .position.top {
        top: auto;
        bottom: calc(100% + 5px);
    }
</style>
