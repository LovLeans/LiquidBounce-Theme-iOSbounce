<script lang="ts">
    import {afterUpdate, onDestroy} from "svelte";
    import {listenSticky} from "../../../../integration/ws";
    import {bannerMotion} from "../../motion";
    import Notification from "./Notification.svelte";
    import {layoutStack} from "./stackLayout";
    import type {NotificationEvent, NotificationSeverity} from "../../../../integration/events";
    import type {HudNotificationsSettings} from "../../components";

    interface TNotification {
        animationKey: number;
        id: number;
        title: string;
        severity: NotificationSeverity;
        message: string;
        /** playing its exit: no longer part of the stack's layout, removed when the exit is over */
        leaving: boolean;
    }

    export let settings: { [name: string]: any };

    let cSettings: HudNotificationsSettings;

    $: cSettings = settings as HudNotificationsSettings;

    let notifications: TNotification[] = [];
    let box: HTMLElement;

    // Never more than this many at once: a config load toggles ~100 modules in one go, and 100 animated boxes were a lag spike (and
    // taller than the screen anyway). The newest ones stay.
    const MAX_VISIBLE = 20;
    const SHOW_MS = 3000;
    // How long a leaving banner stays in the DOM: its exit (motion.ts, 260 ms) plus a margin. A timer on purpose: an exit that waits for
    // an animation to report that it ended stayed on screen for good whenever the page was not painted.
    const LEAVE_MS = 300;
    // Was Date.now(): two notifications in the same millisecond (exactly what a config load makes) got the same id AND the same key of the
    // keyed each (ghost copies in a production build), and the first one's timer removed both. A counter is unique.
    let nextId = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    onDestroy(() => timers.forEach(clearTimeout));

    // The stack is laid out by hand (stackLayout.ts), after every change of the list.
    afterUpdate(() => {
        if (box) layoutStack(box);
    });

    function later(ms: number, action: () => void) {
        const timer = setTimeout(() => {
            timers.delete(timer);
            action();
        }, ms);
        timers.add(timer);
    }

    // The banner plays its exit and drops out of the layout at once (the others close the gap), then it is removed.
    function retire(id: number) {
        const banner = notifications.find((n) => n.id === id);
        if (!banner || banner.leaving) return;

        notifications = notifications.map((n) => n.id === id ? {...n, leaving: true} : n);
        later(LEAVE_MS, () => {
            notifications = notifications.filter((n) => n.id !== id);
        });
    }

    function addNotification(title: string, message: string, severity: NotificationSeverity) {
        if (!cSettings.severities.includes(severity)) return;

        const id = ++nextId;
        let animationKey = id;
        let sameModuleAt = -1;

        if (severity === "ENABLED" || severity === "DISABLED") {
            // Check if there still exists an enable/disable notification for the same module (one that is already leaving does not count)
            sameModuleAt = notifications.findIndex((n) => !n.leaving && n.message === message)
            if (sameModuleAt !== -1) {
                // The new notification takes over the old one's key, so svelte keeps the element and its switch can slide
                // (a different key would build a new element that is already in its end state).
                animationKey = notifications[sameModuleAt].animationKey;
            }
        }

        const notification = {animationKey, id, title, message, severity, leaving: false};

        if (sameModuleAt !== -1) {
            // Replace it where it is. Moving it to the top would take the element out of the DOM and put it back, and a browser
            // drops the running style state of a re-inserted element, so the switch would jump instead of slide.
            notifications = notifications.map((n, i) => i === sameModuleAt ? notification : n);
        } else {
            // The oldest live ones beyond the limit go at once (leaving ones do not count and finish their exit).
            let live = 0;
            notifications = [notification, ...notifications].filter((n) => n.leaving || ++live <= MAX_VISIBLE);
        }

        later(SHOW_MS, () => retire(id));
    }

    listenSticky("notification", (e: NotificationEvent) => {
        addNotification(e.title, e.message, e.severity);
    });
</script>

<!-- Every banner is a `slot` that stackLayout.ts places (position + height of the box) and a `banner` that plays the entrance / exit
     (motion.ts `bannerMotion`). Two elements because they use `transform` for different things: the slot for where it is in the stack,
     the banner for its own entrance / exit. There is no `animate:`, `in:` or `out:` here on purpose: svelte does not take a leaving item
     that is itself still gliding out of the flow, and the stack jumped when the exits ended (see stackLayout.ts). -->
<div class="notifications" bind:this={box}>
    {#each notifications as {title, message, severity, animationKey, leaving} (animationKey)}
        <div class="slot" data-leaving={leaving ? "" : null}>
            <div use:bannerMotion={leaving}>
                <Notification {title} {message} {severity}/>
            </div>
        </div>
    {/each}
</div>

<style lang="scss">
  // The box is as wide as a banner and as high as the live banners (stackLayout.ts sets the height); the slots are placed inside it.
  .notifications {
    position: relative;
    width: 300px;
  }

  .slot {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    // where the slot goes when the stack changes (stackLayout.ts sets `transform`): ease-out, interruptible by nature
    transition: transform .3s cubic-bezier(.215, .61, .355, 1);
    will-change: transform;
  }
</style>
