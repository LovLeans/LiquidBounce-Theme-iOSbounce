// One-time warm-up of everything the FIRST app open would otherwise create in the middle of its animation.
//
// Why: the open animation is the first thing that ever shows the pre-blurred wallpaper (.wpb is visibility:hidden at rest), a
// window's blurred wallpaper plate (.rw sits in a display:none window), the in-flight blur of the window and the blur of the
// clock. The browser builds each of those lazily: it decodes the (inlined) wallpaper again for each new layer and scale, allocates
// the layers and render surfaces, and compiles the blur / colour-matrix programs for every new blur size the animation sweeps
// through. All of it landed inside the first open, as one stutter that never came back (everything is cached afterwards).
//
// What this does: draws exactly those things once, at an opacity of 0.4 % (not 0: a fully transparent layer is skipped by the
// compositor and warms nothing; 0.4 % is below one colour step, so nothing can be seen), while the lock screen is idle, one step
// per frame so no two of them land in the same frame. Nothing is ever kept: every step puts the page back as it found it.
// It never competes with the user: any press, any open window, the editor or a hidden tab cancels it on the spot.
//
// To compare in the real client (A / B): run  localStorage.setItem('lb.nowarm', '1')  and restart the theme to switch it off.

export interface WarmOpts {
	/** the element the probe is added to (the stage: it is clipped to the visible area) */
	host: HTMLElement;
	/** show / hide the warm layers (a class on the menu root, see `.warm` in MainMenu.svelte) */
	set(on: boolean): void;
	/** false while anything else owns the screen: an app window, the editor, the dock editor, a press in progress */
	idle(): boolean;
	/** the wallpaper as a CSS url (data: or blob:), empty for a gradient: it is decoded ahead of the first paint */
	image(): string;
}

/** The blur sizes the open animation passes through: the window's in-flight blur (0 .. 14 px) and the clock's (0 .. 18 px). */
const SWEEP = [0.8, 1.6, 2.6, 3.8, 5.2, 6.8, 8.6, 10.8, 13.2, 15.6, 18];

/**
 * The window's content is scaled from icon size up to full size while it opens, and the browser decodes the wallpaper once per
 * size step it is drawn at (1, 1/2, 1/4, ...). Each of those decodes is new on the first open. The plate is 1486 x 888 (the window
 * plus its 60 px bleed), drawn at these scales.
 */
const SCALES = [1, 0.5, 0.25, 0.125, 0.0625, 0.03125];

export function warmUp(o: WarmOpts): () => void {
	let dead = false;
	let raf = 0;
	let probe: HTMLDivElement | null = null;
	let decodeProbes: HTMLDivElement | null = null;
	let started = false;

	const off = () => {
		cancelAnimationFrame(raf);
		raf = 0;
		o.set(false);
		probe?.remove();
		probe = null;
		decodeProbes?.remove();
		decodeProbes = null;
	};
	const stop = () => {
		if (dead) return;
		dead = true;
		off();
		window.removeEventListener('pointerdown', stop, true);
		window.removeEventListener('keydown', stop, true);
		document.removeEventListener('visibilitychange', onVis);
	};
	const onVis = () => {
		if (document.visibilityState !== 'visible') stop();
	};
	// whatever the user does first wins: no warm-up frame is ever in the way of an input
	window.addEventListener('pointerdown', stop, true);
	window.addEventListener('keydown', stop, true);
	document.addEventListener('visibilitychange', onVis);

	const frame = (fn: () => void) => {
		raf = requestAnimationFrame(() => {
			raf = 0;
			if (dead) return;
			if (!o.idle()) return stop();
			fn();
		});
	};

	let i = 0;
	const sweep = () => {
		if (!probe) {
			// A small element is enough: the programs do not depend on the size of what they blur. It sits inside the stage, where it
			// is on screen (an off-screen layer is not drawn, so it would warm nothing).
			probe = document.createElement('div');
			probe.setAttribute('aria-hidden', 'true');
			probe.style.cssText = 'position:absolute;left:0;top:0;width:160px;height:160px;opacity:.004;pointer-events:none;will-change:filter;background:linear-gradient(135deg,#fff,#555);z-index:1';
			o.host.appendChild(probe);
		}
		if (i >= SWEEP.length) return stop();
		probe.style.filter = `blur(${SWEEP[i++]}px)`;
		frame(sweep);
	};

	const layers = () => {
		// the real .wpb and one window's .rw: same elements, same sizes, so the decode / raster / render-surface work is theirs
		o.set(true);
		// the same wallpaper drawn at every size step the opening window passes through (see SCALES)
		const url = o.image();
		if (url) {
			decodeProbes = document.createElement('div');
			decodeProbes.setAttribute('aria-hidden', 'true');
			decodeProbes.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:1';
			for (const sc of SCALES) {
				const d = document.createElement('div');
				d.style.cssText = `position:absolute;left:0;top:0;width:1486px;height:888px;transform-origin:0 0;transform:scale(${sc});opacity:.004;background:url("${url}") center/cover`;
				decodeProbes.appendChild(d);
			}
			o.host.appendChild(decodeProbes);
		}
		frame(() => {
			o.set(false);
			decodeProbes?.remove();
			decodeProbes = null;
			frame(sweep);
		});
	};

	const begin = async () => {
		if (dead || started) return;
		started = true;
		// 1) decode the wallpaper off the main thread, so the first paint that needs it finds it ready
		const url = o.image();
		if (url) {
			try {
				const img = new Image();
				img.decoding = 'async';
				img.src = url;
				await img.decode();
			} catch {
				/* a wallpaper that cannot be decoded is not this function's problem */
			}
		}
		if (dead) return;
		frame(layers);
	};

	// start once the first paint is done and the main thread is quiet; never later than 1.5 s after mount
	const ric: (cb: () => void, opts?: { timeout: number }) => number = (window as any).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 300));
	requestAnimationFrame(() =>
		requestAnimationFrame(() => {
			if (!dead) ric(() => void begin(), { timeout: 1500 });
		})
	);

	return stop;
}
