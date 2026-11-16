<!--
    The window of the dialogs of an iOS-style screen (Add Server, Edit Server, Direct Connect, ViaFabricPlus): an ExpandWindow
    that comes to rest as a centred window instead of a full screen. It grows out of the button that opened it and shrinks back
    into it with the jelly motion of the lock-screen + menu (ExpandWindow motion="morph"; the alts window keeps the app launch), over a dimmed screen. A tap outside, the close
    button at the top right and Esc shrink it back.

    It lays out a title bar and gives its children the rest of the window (a flex column, 22px from the sides). Everything is
    laid out at `size`, in the units of the iOS stage (45 = the height of an IosButton), and scaled with the window, so a dialog is
    exactly as big as the buttons around it at any window size and GUI scale. The size has to be fixed: the window is animated
    at that size, so a dialog whose height changes while it is open would jump (give the part that can grow, a list, `flex: 1`).

        {#if open}
            <IosDialog bind:this={dialog} title="Direct Connect" anchor={() => button} size={{width: 540, height: 290}}
                       onopened={focusTheField} onclosed={() => (open = false)}>
                ...fields and buttons...
            </IosDialog>
        {/if}

    `close()` shrinks it into the button; `onclosed` comes when it is back there and the owner removes it. Place it inside an
    IosScreen (see ExpandWindow).
-->
<script lang="ts">
    import type {Snippet} from "svelte";
    import ExpandWindow from "./ExpandWindow.svelte";
    import {pressPhysics} from "../title/main-menu/pressPhysics";

    interface Props {
        title: string;
        /** What the button it grows out of says. Defaults to the title. */
        label?: string;
        /** The button the window grows out of. */
        anchor: () => HTMLElement | undefined;
        /** Size of the window in stage units. */
        size: {width: number; height: number};
        /** The window has finished growing. */
        onopened?: () => void;
        /** The window was told to close. */
        onclosing?: () => void;
        /** A press turned the window around while it shrank: it grows again (undo what `onclosing` did). */
        onreopening?: () => void;
        /** The window is back in its button: remove it. */
        onclosed?: () => void;
        children?: Snippet;
    }

    let {title, label, anchor, size, onopened, onclosing, onreopening, onclosed, children}: Props = $props();

    let win: ReturnType<typeof ExpandWindow> | undefined = $state();
    // Once the window shrinks away its content takes no more input (and gives up the keyboard focus): a form cannot be sent
    // twice, and what is typed while it is leaving does not end up in it.
    let closing = $state(false);


    function onWindowClosing() {
        closing = true;
        onclosing?.();
    }

    function onWindowReopening() {
        closing = false;
        onreopening?.();
    }

    /** Shrinks the window back into its button. */
    export function close() {
        win?.close();
    }

    function onKeyDown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            close();
        }
    }
</script>

<svelte:window onkeydown={onKeyDown}/>

{#snippet face()}
    {label ?? title}
{/snippet}

<ExpandWindow bind:this={win} {anchor} {size} motion="morph" label={face} {onopened} onclosing={onWindowClosing} onreopening={onWindowReopening} {onclosed}>
    <div class="dialog" role="dialog" aria-modal="true" aria-label={title} inert={closing}>
        <header>
            <h2>{title}</h2>
            <button class="close"
                    type="button"
                    title="Close"
                    aria-label="Close"
                    use:pressPhysics
                    onclick={close}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.2"
                     stroke-linecap="round" aria-hidden="true">
                    <path d="M2.5 2.5l9 9M11.5 2.5l-9 9"></path>
                </svg>
            </button>
        </header>

        <div class="body">
            {@render children?.()}
        </div>
    </div>
</ExpandWindow>

<style>
    .dialog {
        width: 100%;
        height: 100%;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        color: var(--ios-text);
    }

    header {
        flex: none;
        height: 68px;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 64px;
    }

    h2 {
        margin: 0;
        font-size: 20px;
        line-height: 24px;
        font-weight: 700;
        letter-spacing: -0.2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .close {
        position: absolute;
        top: 18px;
        right: 18px;
        width: 32px;
        height: 32px;
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
        /* swell / squeeze / brightness come from the spring action (transform + filter) */
        transition: color 0.15s;
        will-change: scale;
    }

    .close:hover {
        color: var(--ios-text);
    }

    .close:focus-visible {
        outline: 3px solid #ffffff;
        outline-offset: 2px;
    }

    .body {
        flex: 1;
        min-height: 0;
        box-sizing: border-box;
        padding: 4px 22px 22px;
        display: flex;
        flex-direction: column;
        gap: 14px;
    }
</style>
