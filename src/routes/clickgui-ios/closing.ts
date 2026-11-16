import {writable} from "svelte/store";

/**
 * True while the GUI is being left towards the game (the client closed the screen and nothing carries the GUI away).
 * Only App.svelte writes it; ClickGui.svelte and TabBar.svelte read it and play the swipe animation backwards (lib/menuSwipe.ts).
 * A GUI that is opened from the dock is carried away by the app window shrinking into its icon, so it never plays an animation
 * of its own (see README).
 */
export const closing = writable(false);

/**
 * How long App.svelte keeps the GUI mounted after `closing` was set, so the swipe animation can play out before the route is
 * removed. The fly-out of lib/menuSwipe.ts takes ~0.48 s at the default config (`tRev / (speed * closeSpeed)`); the rest is margin
 * for bigger layouts (expanded windows move the farthest item, which lengthens it a little). If you slow the animation down
 * (`speed`, `closeSpeed`), raise this too.
 */
export const LEAVE_MS = 640;
