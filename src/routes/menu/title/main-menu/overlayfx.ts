// Lets the real screen that sits on top of the menu (singleplayer, proxies, ...) follow the app window while it opens
// and while it closes: the screen's layer is scaled and moved onto the window's rectangle every frame and fades
// in / out, so it grows out of its icon and shrinks back into it. App.svelte attaches its layer wrapper with the
// `overlayFx` action, and keeps a screen that was just left mounted until `fx.closed()` says the window is gone.

export interface OverlayFrame {
	/** window rectangle on screen, in px */
	x: number;
	y: number;
	sx: number; // window width / viewport width
	sy: number;
	o: number; // opacity
	r: number; // corner radius in px (screen)
	/** false while the window is shrinking back into its icon (it was told to close) */
	open?: boolean;
}

let el: HTMLElement | null = null;
let cur: OverlayFrame | null = null;
// The window has finished shrinking into its icon and took the screen with it, but the screen is still mounted (the client's
// answer, or the router, is a moment behind). The layer must then stay invisible: clearing it would put the screen back at full
// size over the home screen for that moment. Reset by the next window frame, by `clear()` and by a new layer.
let gone = false;

// While a window carries the layer (moving it, or having just carried it away) the layer is marked with `data-fx-carry`.
// Screens with glass (the ClickGUI) switch their backdrop blurs off for that time: the window already blurs the wallpaper behind
// them, and dozens of backdrop blurs inside a layer that is scaled, clipped and re-laid-out every frame drop out for single
// frames (pink flashes, a window drawn unscaled for a frame). The mark is released two frames after the layer is back to
// normal, so the blurs come back in a frame of their own and not in the one that also switches the layer's layout.
const CARRY = 'data-fx-carry';
let releaseRaf = 0;

// A screen whose window was told to close is on its way into the icon, and has no use for the pointer any more. It is
// still drawn over the dock though (scaled onto the shrinking window), so without this the dock icon of the next app
// that is tapped while it shrinks is covered by it and the tap goes to the screen: opening apps right after each other
// needed a second tap. The mark makes the whole layer, children included, transparent to the pointer (App.svelte).
const CLOSING = 'data-fx-closing';
function markClosing(on: boolean) {
	if (!el) return;
	if (on) {
		if (!el.hasAttribute(CLOSING)) el.setAttribute(CLOSING, '');
	} else if (el.hasAttribute(CLOSING)) {
		el.removeAttribute(CLOSING);
	}
}

function mark() {
	if (!el) return;
	const on = cur !== null || gone;
	if (on) {
		cancelAnimationFrame(releaseRaf);
		releaseRaf = 0;
		if (!el.hasAttribute(CARRY)) el.setAttribute(CARRY, '');
	} else if (el.hasAttribute(CARRY) && !releaseRaf) {
		const node = el;
		releaseRaf = requestAnimationFrame(() => {
			releaseRaf = requestAnimationFrame(() => {
				releaseRaf = 0;
				if (cur === null && !gone) node.removeAttribute(CARRY);
			});
		});
	}
}

function paint() {
	if (!el) return;
	mark();
	markClosing(cur !== null && cur.open === false);
	const S = el.style;
	if (!cur) {
		S.display = S.position = S.inset = S.overflow = S.transform = S.transformOrigin = S.opacity = S.borderRadius = '';
		if (gone) S.display = 'none';
		return;
	}
	S.display = 'block';
	S.position = 'fixed';
	S.inset = '0';
	S.overflow = 'hidden';
	S.transformOrigin = '0 0';
	S.transform = `translate(${cur.x}px,${cur.y}px) scale(${cur.sx},${cur.sy})`;
	S.opacity = String(cur.o);
	S.borderRadius = `${cur.r / cur.sx}px / ${cur.r / cur.sy}px`;
}

const closedListeners = new Set<() => void>();

// Work that must not run while a window is carrying the layer (see `fx.settled`).
const settleChecks = new Set<() => void>();
/** Longest a `settled()` caller waits, in case no window ever reports that it is done. */
const SETTLE_MAX_MS = 2000;
let settleRaf = 0;

// The window is done: let the waiting work run, but not in the frame that puts the layer in its place, nor in the one that
// brings the backdrop blurs back (`mark` releases the carry mark two frames after the layer is back to normal). Three
// frames keeps each of them in a frame of its own.
function releaseSettled() {
	if (settleRaf || settleChecks.size === 0) return;
	let frames = 3;
	const wait = () => {
		if (--frames > 0) {
			settleRaf = requestAnimationFrame(wait);
			return;
		}
		settleRaf = 0;
		for (const check of [...settleChecks]) check();
	};
	settleRaf = requestAnimationFrame(wait);
}

/** Called when an app window has finished closing into its icon (App.svelte then drops the lingering screen). */
export function onFxClosed(cb: () => void): () => void {
	closedListeners.add(cb);
	return () => void closedListeners.delete(cb);
}

export const fx = {
	set(f: OverlayFrame) {
		cur = f;
		gone = false;
		paint();
	},
	clear() {
		if (!cur && !gone) return;
		cur = null;
		gone = false;
		paint();
		releaseSettled();
	},
	/** The window has finished closing: whatever screen is still mounted was carried away, and stays hidden until it is removed. */
	closed() {
		cur = null;
		gone = true;
		paint();
		for (const cb of [...closedListeners]) cb();
		releaseSettled();
	},
	/** Is a window moving the screen layer right now (growing out of / shrinking into its icon)? */
	active(): boolean {
		return cur !== null;
	},
	/** Did a window already carry the screen away (it is hidden and only waiting to be removed)? */
	isGone(): boolean {
		return gone;
	},
	/**
	 * Resolves once no window is moving the screen layer: the open animation is over (or the window was closed on the
	 * way, or no window carries this screen at all). A screen uses it to hold back anything expensive that changes
	 * its content (a burst of server pings turning every row into a rebuilt one, say). The window's animation is driven
	 * from JavaScript every frame, so a long task in the middle of it shows up as a freeze followed by a jump, while the
	 * same task a moment later has nothing to freeze. Never waits longer than SETTLE_MAX_MS.
	 */
	settled(): Promise<void> {
		return new Promise((resolve) => {
			const timer = setTimeout(done, SETTLE_MAX_MS);
			function done() {
				clearTimeout(timer);
				settleChecks.delete(check);
				resolve();
			}
			function check() {
				if (cur === null) done();
			}
			settleChecks.add(check);
			// The screen can arrive before the window has drawn its first frame (and so before it has set `cur`): look again
			// a few frames from now instead of now. A window that is still moving calls `releaseSettled` when it is done.
			releaseSettled();
		});
	}
};

/** Svelte action for the wrapper around the page's screen layer. It is `display: contents` while idle. */
export function overlayFx(node: HTMLElement) {
	el = node;
	// a new layer is a new screen: it is never hidden because of the previous one (an in-game GUI opened after a dock one, ...).
	// The exception is a layer built while a window is moving it (cur is set).
	gone = false;
	paint();
	return {
		destroy() {
			cancelAnimationFrame(releaseRaf);
			releaseRaf = 0;
			if (el === node) el = null;
		}
	};
}
