// Asking the client for a screen (an app window opened and wants its real screen drawn over it). Kept free of Svelte
// and of the REST layer so the ordering rules can be tested on their own.

export interface ScreenRequestsOpts {
	/** is the window of this app open (or opening) right now? */
	isOpen(id: string): boolean;
	/** ask the client for the screen; resolves when the client has answered the request */
	send(name: string): Promise<void>;
	/** the last screen the client reported, and when (same clock as `now`) */
	seen(): { name: string; at: number };
	now(): number;
}

/** A second request for the same screen within this long is dropped while the client has not said anything else. */
const SAME_SCREEN_MS = 1000;

/**
 * Asking the client for a screen takes a round trip, so requests follow three rules:
 *  - they go out one at a time, in order;
 *  - a request is dropped when its window was closed before its turn, or when a newer request replaced it (closing an
 *    app and opening another quickly): the client would open that screen after its window is already gone;
 *  - the same screen is not asked for twice in a row while the first answer is still on its way (closing and
 *    reopening the same app quickly), because the client rebuilds a screen every time it is asked for it.
 * A screen that still arrives after its window is gone cannot be called back from here: the router recognises it
 * (see `menuLink` in bridge.ts) and sends the client back to the title.
 */
export class ScreenRequests {
	private queue: Promise<void> = Promise.resolve();
	private seq = 0;
	private last = { name: '', at: 0 };
	private dead = false;

	constructor(private o: ScreenRequestsOpts) {}

	/** `force`: ask even when the same screen was asked for a moment ago (a window that was opened again needs its own answer). */
	request(id: string, name: string, force = false) {
		const seq = ++this.seq;
		this.queue = this.queue
			.then(async () => {
				if (this.dead || seq !== this.seq || !this.o.isOpen(id)) return;
				const now = this.o.now();
				const seen = this.o.seen();
				if (!force && this.last.name === name && now - this.last.at < SAME_SCREEN_MS && (seen.at < this.last.at || seen.name === name)) return;
				this.last = { name, at: now };
				await this.o.send(name);
			})
			.catch(() => {}); // one failed request must not block the ones after it
	}

	/** The menu was removed: whatever is still queued must not open screens any more. */
	dispose() {
		this.dead = true;
	}
}
