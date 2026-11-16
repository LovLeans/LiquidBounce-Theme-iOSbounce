// Spring-driven "app launch" animation: an icon grows into a window (and back), the wallpaper
// scales/blurs behind it and the dock slides away. Ported 1:1 from the prototype; the physics are
// intentionally imperative (direct style writes per frame) so Svelte reactivity never sits in the hot path.

export const cl = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export const sm = (a: number, b: number, x: number) => {
	x = cl((x - a) / (b - a), 0, 1);
	return x * x * (3 - 2 * x);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A damped-oscillator step response as a CSS linear() easing. */
export function mkSpring(z: number, n = 64): string {
	const w = Math.log(500) / z;
	const wd = w * Math.sqrt(1 - z * z);
	const a: number[] = [];
	for (let i = 0; i <= n; i++) {
		const t = i / n;
		a.push(i === n ? 1 : +(1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t))).toFixed(4));
	}
	return `linear(${a.join(',')})`;
}

export interface Spring {
	x: number;
	v: number;
	t: number;
	k: number;
	c: number;
	e: number;
	ve: number;
}
type Channel = 'cx' | 'cy' | 'w' | 'h' | 'm' | 'op';

export const spring = (e: number, ve: number): Spring => ({ x: 0, v: 0, t: 0, k: 200, c: 28, e, ve });
export const aim = (s: Spring, t: number, k: number, z: number) => {
	s.t = t;
	s.k = k;
	s.c = 2 * z * Math.sqrt(k);
};
const mkch = (): Record<Channel, Spring> => ({
	cx: spring(0.4, 4),
	cy: spring(0.4, 4),
	w: spring(0.4, 4),
	h: spring(0.4, 4),
	m: spring(0.002, 0.03),
	op: spring(0.002, 0.03)
});

export interface AppEls {
	win: HTMLElement;
	ct: HTMLElement;
	ico: HTMLElement;
	/** window size once fully open, in stage units */
	tw: number;
	th: number;
	/** the window ends up covering the whole stage, so it has square corners once open */
	full?: boolean;
	/**
	 * The size the window grows to when it is open, in stage units, when that is not tw x th. Windows that hand over to
	 * a page screen use the whole page (the stage is 16:9 and scaled to fit, so in any other window shape the page is
	 * bigger than the stage): the screen is scaled onto the window every frame, so the window has to end up exactly
	 * where the screen is drawn when it is done, or the screen pops from one size to the other.
	 */
	fit?: () => { w: number; h: number };
}

interface AppRt extends AppEls {
	id: string;
	ch: Record<Channel, Spring>;
	isOpen: boolean;
	active: boolean;
	opened: boolean;
	bf: string;
}

export interface LauncherOpts {
	apps: Record<string, AppEls>;
	wpg: HTMLElement;
	wpb: HTMLElement;
	wpd: HTMLElement;
	/** ambient wallpaper that fills the window around the 16:9 stage; it follows the same dimming (--u: 0 .. 1) */
	fill?: HTMLElement;
	clock: HTMLElement;
	dock: HTMLElement;
	/** where the icon currently sits, in stage units */
	slot(id: string): { cx: number; cy: number };
	dks(): number;
	/** the icon hides while its window is alive */
	setActive(id: string, on: boolean): void;
	/**
	 * fired when a window starts opening. `resumed` is true when the window was still on screen shrinking back into its icon
	 * and has turned around from where it was (a fresh open starts from the icon).
	 */
	onOpen?(id: string, resumed: boolean): void;
	/** fired when an open window is told to close (before it starts moving) */
	onClose?(id: string): void;
	/** every frame a window is drawn: its centre and size in stage units, progress m (0 icon .. 1 open), corner radius */
	onFrame?(f: { id: string; cx: number; cy: number; w: number; h: number; m: number; r: number; op: number; open: boolean }): void;
	/** fired once when a window has finished opening */
	onOpened?(id: string): void;
	/** fired once when a window has finished closing into its icon */
	onClosed?(id: string): void;
}

export class Launcher {
	private apps: Record<string, AppRt> = {};
	private bg = spring(0.002, 0.03);
	private dk = spring(0.002, 0.03);
	private raf = 0;
	private last = 0;
	private front: string | null = null;
	private pdk = 0;
	private blurOn = false;
	private clockFilter = '';

	constructor(private o: LauncherOpts) {
		this.bg.k = 150;
		this.bg.c = 24;
		this.dk.k = 340;
		this.dk.c = 37;
		for (const [id, el] of Object.entries(o.apps)) {
			this.apps[id] = { ...el, id, ch: mkch(), isOpen: false, active: false, opened: false, bf: '' };
		}
	}

	private get isz() {
		return 83 * this.o.dks();
	}

	/** where a window ends up when it is open, in stage units */
	private size(a: AppRt) {
		return a.fit?.() ?? { w: a.tw, h: a.th };
	}

	/**
	 * The page was resized: a window that is fully open takes the new size right away, one that is still moving just
	 * aims at it. Nothing is redrawn through onFrame, so the screen that is on top of an open window is left alone.
	 */
	refit() {
		for (const a of Object.values(this.apps)) {
			if (!a.active || !a.isOpen || !a.fit) continue;
			const { w, h } = this.size(a);
			const c = a.ch;
			if (a.opened) {
				Object.assign(c.w, { x: w, t: w, v: 0 });
				Object.assign(c.h, { x: h, t: h, v: 0 });
				this.renderApp(a, true);
			} else {
				aim(c.w, w, 300, 1);
				aim(c.h, h, 185, 1);
			}
		}
	}

	anyOpen() {
		return Object.values(this.apps).some((a) => a.isOpen);
	}

	/** true while `id` is open or opening (false once it was told to close, even if it is still shrinking) */
	isOpen(id: string) {
		return !!this.apps[id]?.isOpen;
	}

	/** true while the window of `id` is on screen in any state: opening, open, or still shrinking back into its icon */
	isActive(id: string) {
		return !!this.apps[id]?.active;
	}

	/**
	 * How far `id` has grown while it is opening: 0 = still the icon, 1 = full size. null when it is not opening (it was told to
	 * close, or it has settled open). Used to let a press on a window that has only just started to grow cancel it.
	 */
	openingProgress(id: string): number | null {
		const a = this.apps[id];
		if (!a || !a.isOpen || a.opened) return null;
		const z = this.size(a);
		const c = a.ch;
		const kw = (c.w.x - this.isz) / Math.max(1, z.w - this.isz);
		const kh = (c.h.x - this.isz) / Math.max(1, z.h - this.isz);
		return cl(Math.min(kw, kh), 0, 1);
	}

	/** true while `id` was told to close but is still shrinking back into its icon */
	isClosing(id: string) {
		const a = this.apps[id];
		return !!a && a.active && !a.isOpen;
	}

	/** Small windows (the quit confirmation) close when you press outside them. */
	dismissOutside(target: Node) {
		const a = this.front ? this.apps[this.front] : null;
		if (a && a.isOpen && a.tw < 1366 && !a.win.contains(target)) this.close();
	}

	/** Set by destroy(): frames queued before it (restore() below) must not drive a launcher that is gone. */
	private dead = false;

	destroy() {
		this.dead = true;
		cancelAnimationFrame(this.raf);
		this.raf = 0;
	}

	open(id: string) {
		const a = this.apps[id];
		if (!a || a.isOpen || this.anyOpen()) return;
		const s = this.o.slot(id);
		const c = a.ch;
		const resumed = a.active;
		if (!a.active) {
			a.active = true;
			this.o.setActive(id, true);
			Object.assign(c.cx, { x: s.cx, v: 0 });
			Object.assign(c.op, { x: 1, v: 0 });
			Object.assign(c.cy, { x: s.cy + 160 * cl(this.dk.x, 0, 1), v: -500 });
			Object.assign(c.w, { x: this.isz, v: 2200 });
			Object.assign(c.h, { x: this.isz, v: 1900 });
			Object.assign(c.m, { x: 0, v: 0 });
			a.win.style.display = 'block';
		}
		// The window that opens goes on top of every window that is still shrinking back into its icon. (An alternating
		// z-index put it under the closing one every other time, so the two crossed in the wrong order.)
		for (const r of Object.values(this.apps)) if (r !== a && r.active) r.win.style.zIndex = '10';
		a.win.style.zIndex = '11';
		a.win.style.pointerEvents = '';
		a.isOpen = true;
		a.opened = false;
		this.front = id;
		this.targets(a);
		this.o.onOpen?.(id, resumed);
	}

	/**
	 * Show `id` as already open, with no opening animation. Used when the client opens a screen of the page on its own (back from
	 * the game, Cancel on the connecting screen): that screen is already there, so it is neither asked for again nor grown out of
	 * its icon. The caller fades the page in (App.svelte). Closing it is the normal close: the window (and the screen on it) shrinks
	 * into its icon while the dock and the wallpaper come back, exactly like a window that was opened from the dock.
	 */
	show(id: string) {
		const a = this.apps[id];
		if (!a || this.anyOpen()) return;
		a.active = true;
		this.o.setActive(id, true);
		a.win.style.display = 'block';
		a.win.style.zIndex = '11';
		a.win.style.pointerEvents = '';
		a.isOpen = true;
		a.opened = true;
		this.front = id;
		this.targets(a);
		for (const q of Object.values(a.ch)) {
			q.x = q.t;
			q.v = 0;
		}
		for (const g of [this.bg, this.dk]) {
			g.x = g.t;
			g.v = 0;
		}
		this.pdk = cl(this.dk.x, 0, 1);
		this.renderApp(a, true); // quiet: the screen layer stays as it is, there is nothing to carry
		this.renderG();
		// targets() asked for a frame; its settle step would draw this window through onFrame and leave the screen layer scaled,
		// clipped and without glass blur for as long as it is open (nothing would ever clear it: the window never "finishes opening")
		cancelAnimationFrame(this.raf);
		this.raf = 0;
	}

	/**
	 * Show `id` as already open and close it again. Used when the menu is rebuilt while coming back from a screen
	 * that lives outside the page (the client's native options), so the return still animates.
	 */
	restore(id: string) {
		const a = this.apps[id];
		if (!a || this.anyOpen()) return;
		a.active = true;
		this.o.setActive(id, true);
		a.win.style.display = 'block';
		a.win.style.zIndex = '11';
		a.win.style.pointerEvents = '';
		a.isOpen = true;
		a.opened = true;
		this.front = id;
		this.targets(a);
		for (const q of Object.values(a.ch)) {
			q.x = q.t;
			q.v = 0;
		}
		for (const g of [this.bg, this.dk]) {
			g.x = g.t;
			g.v = 0;
		}
		this.pdk = cl(this.dk.x, 0, 1);
		this.renderApp(a);
		this.renderG();
		// let the open frame paint once, then close
		requestAnimationFrame(() => requestAnimationFrame(() => { if (!this.dead) this.close(); }));
	}

	/** The window that was opened last, while it is still on screen (open, opening or closing). */
	frontId(): string | null {
		const a = this.front ? this.apps[this.front] : null;
		return a?.active ? a.id : null;
	}

	/**
	 * Close the front window. With `id` it only closes that window: a late "screen is gone" message about an app that
	 * was closed a moment ago must not close the app that has been opened since.
	 */
	close(id?: string) {
		const a = this.front ? this.apps[this.front] : null;
		if (!a || !a.isOpen || (id !== undefined && a.id !== id)) return;
		this.o.onClose?.(a.id);
		a.isOpen = false;
		a.opened = false;
		a.win.style.pointerEvents = 'none';
		this.targets(a);
	}

	private targets(a: AppRt) {
		const s = this.o.slot(a.id);
		const c = a.ch;
		if (a.isOpen) {
			const z = this.size(a);
			aim(c.cx, 683, 210, 1);
			aim(c.cy, 384, 210, 1);
			aim(c.w, z.w, 300, 1);
			aim(c.h, z.h, 185, 1);
			aim(c.m, 1, 330, 1);
		} else {
			const K = 240;
			aim(c.cx, s.cx, K, 1);
			aim(c.cy, s.cy, K, 1);
			aim(c.w, this.isz, K, 1);
			aim(c.h, this.isz, K, 1);
			aim(c.m, 0, K, 1);
		}
		const any = this.anyOpen();
		for (const r of Object.values(this.apps)) if (r.active) aim(r.ch.op, 1, 260, 1);
		aim(this.bg, any ? 1 : 0, any ? 150 : 190, 1);
		aim(this.dk, any ? 1 : 0, any ? 340 : 240, 1);
		this.kick();
	}

	private kick() {
		if (!this.raf) {
			this.last = performance.now();
			this.raf = requestAnimationFrame(this.tick);
		}
	}

	private renderApp(a: AppRt, quiet = false) {
		const c = a.ch;
		const w = c.w.x;
		const h = c.h.x;
		const m = cl(c.m.x, 0, 1);
		const S = a.win.style;
		S.width = w + 'px';
		S.height = h + 'px';
		S.translate = `${c.cx.x - w / 2}px ${c.cy.x - h / 2}px`;
		S.opacity = String(cl(c.op.x, 0, 1));
		S.boxShadow = `0 ${lerp(1, 16, m)}px ${lerp(3, 56, m)}px rgba(0,0,0,${lerp(0.25, 0.42, m)}),inset 0 0 0 1px rgba(255,255,255,.07)`;
		const rad = lerp(0.23 * Math.min(w, h), a.full ? 0 : a.tw < 1366 ? 46 : 38, m);
		S.borderRadius = rad + 'px';
		// in-flight blur peaks mid-flight and is gone by the time the window has settled
		const bl = 14 * 4 * m * (1 - m) * (1 - sm(0.7, 0.95, m));
		const bf = bl > 0.4 ? `blur(${bl.toFixed(1)}px)` : '';
		if (a.bf !== bf) {
			a.bf = bf;
			S.filter = bf;
		}
		const isz = this.isz;
		const fs = cl((w - isz) / (this.size(a).w - isz), 0, 1);
		S.transform = `perspective(1500px) rotateX(${-40 * fs * (1 - fs)}deg)`;
		a.ct.style.transform = `scale(${w / a.tw},${h / a.th})`;
		a.ct.style.opacity = String(sm(0.1, 0.6, m));
		a.ico.style.opacity = String(1 - sm(0, 0.4, m));
		if (!quiet) this.o.onFrame?.({ id: a.id, cx: c.cx.x, cy: c.cy.x, w, h, m, r: rad, op: cl(c.op.x, 0, 1), open: a.isOpen });
	}

	// the background "blur" is a pre-blurred layer fading in + a black dim layer: compositor-only, no per-frame filter
	private renderG() {
		const { wpg, wpb, wpd, fill, dock, clock } = this.o;
		const u = cl(this.bg.x, 0, 1);
		const on = u > 0.001;
		wpg.style.transform = on ? `scale(${1 + 0.07 * u})` : '';
		if (on !== this.blurOn) {
			this.blurOn = on;
			wpb.style.visibility = on ? 'visible' : 'hidden';
		}
		const bo = Math.min(1, u * 1.6);
		wpb.style.opacity = String(bo);
		wpb.style.scale = on ? String(1 + 0.08 * bo) : '';
		wpd.style.opacity = String(0.26 * u);
		fill?.style.setProperty('--u', u.toFixed(3));
		dock.style.transform = `translateY(${(160 / this.o.dks()) * cl(this.dk.x, 0, 1)}px)`;
		clock.style.opacity = String(1 - u);
		clock.style.transform = `scale(${1 - 0.08 * u})`;
		const cf = u > 0.02 && u < 0.98 ? `blur(${(18 * Math.min(1, u * 1.6)).toFixed(1)}px)` : '';
		if (this.clockFilter !== cf) {
			this.clockFilter = cf;
			clock.style.filter = cf;
		}
	}

	private finish(a: AppRt) {
		this.o.setActive(a.id, false);
		a.win.style.display = 'none';
		a.win.style.filter = '';
		a.bf = '';
		a.active = false;
		a.opened = false;
		a.ch.op.x = 1;
		a.ch.op.v = 0;
		this.o.onClosed?.(a.id);
	}

	private tick = (now: number) => {
		const dt = cl((now - this.last) / 1000, 0.001, 0.05);
		this.last = now;
		const n = Math.ceil(dt / 0.004);
		const hh = dt / n;
		let rest = true;
		const step = (c: Spring) => {
			for (let i = 0; i < n; i++) {
				c.v += (c.k * (c.t - c.x) - c.c * c.v) * hh;
				c.x += c.v * hh;
			}
			return Math.abs(c.t - c.x) <= c.e && Math.abs(c.v) <= c.ve;
		};
		for (const g of [this.bg, this.dk]) if (!step(g)) rest = false;

		const dkx = cl(this.dk.x, 0, 1);
		const dd = 160 * (dkx - this.pdk);
		this.pdk = dkx;

		for (const a of Object.values(this.apps)) {
			if (!a.active) continue;
			if (!a.isOpen) {
				// a closing window keeps aiming at its icon while the dock slides back up
				a.ch.cy.x += dd * (1 - sm(0.05, 0.45, cl(a.ch.m.x, 0, 1)));
				a.ch.cy.t = this.o.slot(a.id).cy + 160 * dkx;
			}
			let settled = true;
			for (const q of Object.values(a.ch)) if (!step(q)) settled = false;
			if (settled) {
				for (const q of Object.values(a.ch)) {
					q.x = q.t;
					q.v = 0;
				}
				this.renderApp(a);
				if (!a.isOpen) this.finish(a);
				else if (!a.opened) {
					a.opened = true;
					this.o.onOpened?.(a.id);
				}
			} else {
				rest = false;
				this.renderApp(a);
			}
		}
		if (rest)
			for (const g of [this.bg, this.dk]) {
				g.x = g.t;
				g.v = 0;
			}
		this.renderG();
		if (rest) {
			this.raf = 0;
			return;
		}
		this.raf = requestAnimationFrame(this.tick);
	};
}
