// Everything the main menu needs from the outside world lives in this one file.
// Wired to the LiquidBounce REST API and the theme's persistent storage.

import { writable } from 'svelte/store';
import { exitClient, getVirtualScreen, openScreen } from '../../../../integration/rest';
import { updatePersistentData } from '../../../../integration/persistent_storage';

/**
 * Set when an app hands over to a screen that lives outside this page (the client's native options). The menu is
 * rebuilt when you come back, and reads this to play the closing animation of that app.
 */
export const resume: { id: string | null } = { id: null };

/**
 * How long a screen the menu asked for can still arrive afterwards. The client answers a request some time later, and
 * App.svelte uses this to recognise a screen whose window is already gone (see `menuLink`).
 */
const ASK_TTL = 4000;

/**
 * Lets App.svelte (the router) and the main menu agree on which client screens belong to an open app window.
 *
 * Opening an app asks the client for a screen, and the client reports it back some time later. If the window was
 * closed in the meantime (Esc, or switching apps quickly) that screen is a stray: nobody wants it any more. The router
 * asks `expects` before it shows a screen on top of the menu and drops the strays instead.
 */
export const menuLink = {
	/** Set by the mounted menu: is an app window open (or opening) that shows this client screen? */
	expects: null as ((screen: string) => boolean) | null,
	/** Set by the mounted menu: is a window open (or opening) that is going to ask the client for its own screen? */
	busy: null as (() => boolean) | null,
	/**
	 * Set by the mounted menu: shrink the window that shows this client screen back into its icon right now (a no-op when that
	 * window is not open). Used by `LB.leaveScreen`.
	 */
	closeNow: null as ((screen: string) => void) | null,
	/** Set by the mounted menu: is the window of this screen on its way out (told to close, still fading / shrinking)? */
	closing: null as ((screen: string) => boolean) | null,
	/**
	 * Windows that grow out of a button of a page screen (the alts button, Create New World) and sit on top of that screen.
	 * They are told when the app window of the screen itself is told to close, so they shrink back into their button on the
	 * way out instead of being carried off as a full-size screen.
	 */
	closingListeners: new Set<() => void>(),
	/** The screens the menu asked for, with the time of the request. */
	asked: new Map<string, number>(),
	/** The last screen the client reported (set by the router), with the time. */
	seen: { name: '', at: 0 },

	ask(screen: string) {
		this.asked.set(screen, performance.now());
	},

	/** Subscribe to "the app window of the screen on top is closing". Returns the way to unsubscribe. */
	onClosing(cb: () => void): () => void {
		this.closingListeners.add(cb);
		return () => void this.closingListeners.delete(cb);
	},

	/** Set by the mounted menu when a window that shows a page screen is told to close. */
	notifyClosing() {
		for (const cb of [...this.closingListeners]) cb();
	},

	/**
	 * The client has opened this screen: the request is answered and no longer pending. Without this a request stayed "pending" for
	 * ASK_TTL after its answer had arrived, so a screen the client opened again on its own within that time (Esc / Cancel on the
	 * connecting screen, back to the multiplayer screen it was started from) was taken for a late answer and dropped.
	 */
	answered(screen: string) {
		this.asked.delete(screen);
	},

	/** True if the menu asked for this screen a moment ago and the client has not answered yet. */
	wasAsked(screen: string): boolean {
		const now = performance.now();
		for (const [name, at] of this.asked) if (now - at > ASK_TTL) this.asked.delete(name);
		return this.asked.has(screen);
	}
};

/**
 * A page screen (Singleplayer) asks the client for one of its OWN screens (Edit World, Create New World). The client then closes the
 * page's screen to open it, and the router must not take that close for an Esc (it would shrink the window and ask for the title, which
 * replaces the screen that was just opened). There is no fade any more: the page stays as it is until the client takes over.
 * What is left of the handover is bookkeeping: `at` lets the router tell the close from an Esc, and `pending` keeps a second click
 * from asking for the screen twice while the first request is still on its way.
 */
const HANDOFF_WINDOW = 6000; // a close of the page screen this soon after the request is the handover, not an Esc
const HANDOFF_MAX = 2500; // the client never took over: the page is usable again

let handoffTimer: ReturnType<typeof setTimeout> | undefined;

export const nativeHandoff = {
	/** a native screen was asked for and the client has not taken over yet: the page takes no clicks */
	pending: writable(false),
	busy: false,
	at: -1e9,

	/** true while a close of the page's screen is the handover to a native screen (see App.svelte `closeScreen`) */
	recent(): boolean {
		return performance.now() - this.at < HANDOFF_WINDOW;
	},

	/** the client has taken over (or the screen is back, or the request failed): the page is usable again */
	release(): void {
		clearTimeout(handoffTimer);
		this.busy = false;
		this.pending.set(false);
	}
};

export const LB = {
	/** Open one of the client's own screens, e.g. 'proxymanager', 'clickgui', 'altmanager'. */
	openScreen(name: string): Promise<void> {
		return openScreen(name).catch(() => {});
	},

	/**
	 * Leave a screen through one of the page's own buttons (Cancel, Back). The window shrinks into its icon on the click, and the
	 * request to the client runs next to it; the router follows when the client's answer arrives. Before, the shrink only began
	 * once that answer was back (REST call -> client -> websocket event -> router -> menu), which is the delay felt on every close.
	 */
	leaveScreen(screen: string, request: () => Promise<unknown>): Promise<void> {
		menuLink.closeNow?.(screen);
		return request().then(
			() => {},
			() => {}
		);
	},

	/**
	 * Open one of the client's own screens from a page screen (Edit World, Create New World). There is no fade: the page stays as it is
	 * and the client replaces it when it is ready. The router is told that the close of the page's screen is the handover and not an Esc
	 * (App.svelte). Coming back to the page's screen is handled by the router as well (`adoptScreen`).
	 *
	 * Resolves with false when the request could not be made, so the caller can undo what it showed for it. A second call while the first
	 * one is still on its way does nothing and resolves with true.
	 */
	async openNative(request: () => Promise<unknown>): Promise<boolean> {
		if (nativeHandoff.busy) return true;

		nativeHandoff.busy = true;
		nativeHandoff.at = performance.now();
		nativeHandoff.pending.set(true);
		// if the client never takes over, the page must not stay locked
		clearTimeout(handoffTimer);
		handoffTimer = setTimeout(() => nativeHandoff.release(), HANDOFF_MAX);

		try {
			await request();
			return true;
		} catch {
			nativeHandoff.release();
			nativeHandoff.at = -1e9;
			return false;
		}
	},

	/** Name of the screen the client shows right now ('' when unknown). */
	async screenName(): Promise<string> {
		try {
			return (await getVirtualScreen()).name || '';
		} catch {
			return '';
		}
	},

	/** Quit button in the "Quit game?" window. */
	exit(): void {
		void exitClient();
	},

	/**
	 * Persistence: dock order, dock size, lock-screen styles.
	 * Reads come from localStorage (App.svelte fills it from the client before any route mounts);
	 * writes hit localStorage synchronously (so a full quota still reports failure) and then sync everything back
	 * to the client's persistent storage.
	 */
	storage: {
		get<T = unknown>(key: string): T | null {
			try {
				return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
			} catch {
				return null;
			}
		},
		set(key: string, value: unknown): boolean {
			try {
				localStorage.setItem(key, JSON.stringify(value));
				void updatePersistentData();
				return true;
			} catch {
				return false;
			}
		},
		del(key: string): void {
			try {
				localStorage.removeItem(key);
				void updatePersistentData();
			} catch {
				/* ignore */
			}
		}
	}
};
