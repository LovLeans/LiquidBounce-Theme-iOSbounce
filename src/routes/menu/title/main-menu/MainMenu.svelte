<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { pressPhysics } from './pressPhysics';
	import AppScreen from './AppScreen.svelte';
	import { LB, resume, menuLink } from './bridge';
	import { glyph } from './glyphs';
	import type { EditorHost } from './editor-types';
	import { Launcher, cl, mkSpring, sm as smooth, type AppEls } from './launcher';
	import { ScreenRequests } from './screens';
	import { warmUp } from './warmup';
	import { fx } from './overlayfx';
	import { setTypingBaseline } from '../../../../integration/rest';
	import LockScreenEditor from './LockScreenEditor.svelte';
	import Slider from '../../../../components/Slider.svelte';
	import { wall, reloadWall, STY, bgv, crop, tcol, lum, fmtN, clockCss, dateCss } from './lockscreen.svelte';

	/**
	 * True while one of the client's real screens (singleplayer, multiplayer) is drawn on top of this menu.
	 * The menu stays mounted underneath so the app window can shrink back into its icon when that screen closes.
	 */
	let {
		overlayActive = false,
		overlayScreen = null,
		adoptScreen = null
	}: { overlayActive?: boolean; overlayScreen?: string | null; adoptScreen?: string | null } = $props();

	reloadWall(); // pick up what the client's persistent storage restored after this module was first evaluated

	// Esc on the home screen must not reach the client: it closes its title screen and opens it again, which blanks the wallpaper for a
	// moment and centres the mouse. So while the menu itself owns the keyboard (no real screen on top of it) the client is told to leave
	// the keyboard to the page; Esc then only closes an app window (onKey). A real screen on top (singleplayer, ...) gets Esc as before.
	$effect(() => {
		setTypingBaseline(!overlayActive).catch(() => {});
	});
	onDestroy(() => {
		setTypingBaseline(false).catch(() => {});
	});

	// ---------- apps ----------
	const FIX = ['sp', 'mp', 'st', 'ex'] as const; // always in the dock
	const WINS = ['sp', 'mp', 'st', 'ex', 'px', 'cg', 'ac'] as const; // every app opens a window
	const APPS: Record<string, { r?: boolean; n?: string }> = {
		sp: {},
		mp: {},
		st: {},
		ex: {},
		px: { r: true, n: 'Proxies' }, // r = removable, lives in the tray while editing
		cg: { r: true, n: 'ClickGUI' },
		ac: { r: true, n: 'Accounts' }
	};
	const IDS = Object.keys(APPS);
	const TW: Record<string, number> = { sp: 1366, mp: 1366, st: 1366, ex: 1160, px: 1366, cg: 1366, ac: 1366 };
	const TH: Record<string, number> = { sp: 768, mp: 768, st: 768, ex: 650, px: 768, cg: 768, ac: 768 };

	/**
	 * Hand a window over to one of the client's real screens once it has finished opening.
	 * Empty = keep the demo screens. Example: { sp: 'singleplayer', mp: 'multiplayer', st: 'options' }
	 */
	const REAL_SCREEN: Partial<Record<string, string>> = { sp: 'singleplayer', mp: 'multiplayer', st: 'options', px: 'proxymanager', cg: 'clickgui', ac: 'altmanager' };
	/** real screens the page itself cannot keep drawing over the menu (they are the client's own) */
	const NATIVE_SCREEN = new Set(['st']);
	/** page screens that open together with the window animation */
	const early = (id: string) => !!REAL_SCREEN[id] && !NATIVE_SCREEN.has(id);
	/** which app window a page screen belongs to, by the client's name for the screen */
	const SCREEN_APP: Record<string, string> = Object.fromEntries(Object.keys(REAL_SCREEN).filter(early).map((id) => [REAL_SCREEN[id]!, id]));

	// dock geometry (stage units, before the dock scale is applied)
	const dW = (n: number) => 47 + n * 108; // width for n apps
	const SEP = 27; // extra room for the hairline between dock and tray
	const eW = (n: number, m: number) => (m ? dW(n + m) + SEP : dW(n));
	const WMAX = dW(IDS.length) + SEP;
	const DMIN = 0.4;
	const DMAX = 1;

	// real spring curves as CSS linear() easings; bezier fallbacks if unsupported
	const linear = typeof CSS !== 'undefined' && !!CSS.supports?.('transition-timing-function', 'linear(0,1)');
	const SPR = linear ? mkSpring(0.66) : 'cubic-bezier(.3,1.3,.5,1)';
	const SPM = linear ? mkSpring(0.8) : '';

	// every glyph instance needs its own gradient ids
	const dockGlyph = Object.fromEntries(IDS.map((id) => [id, glyph(id)]));
	const winGlyph = Object.fromEntries(WINS.map((id) => [id, glyph(id)]));

	// ---------- state ----------
	function loadOrder(): string[] {
		const a = LB.storage.get<string[]>('lb.dock');
		const o = Array.isArray(a) ? a.filter((k, i) => APPS[k] && a.indexOf(k) === i) : [];
		for (const k of FIX) if (!o.includes(k)) o.push(k);
		return o;
	}
	let order = $state(loadOrder());
	let dks = $state(cl(+(LB.storage.get<number>('lb.dks') ?? 0) || 0.6, DMIN, DMAX)); // dock + icon scale
	let ed = $state(false); // editing the dock
	let edx = $state(false); // edit mode is easing out (keeps the jiggle alive while it fades)
	let dz = $state(false); // size slider is being dragged: the dock follows it 1:1
	let editN = $state(4);
	let vl = $state<string[] | null>(null); // virtual dock order while an icon is being dragged
	let drag = $state<{ id: string; x: number; y: number } | null>(null); // lifted icon, dock-local translate
	let jig = $state<Record<string, { d: string; p: string }>>({});
	let appActive = $state<Record<string, boolean>>({});
	let toastText = $state('');
	let toastOn = $state(false);
	let warm = $state(false); // one-time invisible warm-up of the open animation's effects (warmup.ts)
	let scale = $state(1);
	let TS = $state('');
	let we = $state(0); // lock-screen editor mode: 0 off, 1 carousel, 2 customize (owned by LockScreenEditor)
	let editor: ReturnType<typeof LockScreenEditor> | undefined;
	let DS = $state('');

	const p = $derived(wall.p[wall.cur]);
	const clockText = $derived(fmtN(TS, p.ck));
	const tint = $derived(tcol(p));

	// ---------- dock layout (derived: no manual measuring or re-parenting) ----------
	const layoutList = $derived(vl ?? order);
	const tray = $derived(IDS.filter((k) => !layoutList.includes(k)));
	const n = $derived(layoutList.length);
	const m = $derived(tray.length);
	const dockW = $derived(ed ? eW(n, m) : dW(n));
	// idle: centred. editing: the left edge stays put and the dock grows to the right to make room for the tray
	const dockL = $derived.by(() => {
		let l = (1366 - dW(ed ? editN : n) * dks) / 2;
		if (ed) l = Math.min(l, 1350 - WMAX * dks);
		return l;
	});
	const pos = $derived.by(() => {
		const o: Record<string, { x: number; y: number; tr: boolean; i: number }> = {};
		layoutList.forEach((id, i) => (o[id] = { x: 36 + i * 108, y: 24, tr: false, i }));
		tray.forEach((id, i) => (o[id] = { x: 36 + n * 108 + SEP + i * 108, y: 24, tr: true, i }));
		return o;
	});
	/** where an icon sits on screen, in stage units */
	const slotOf = (id: string) => ({ cx: dockL + (pos[id].x + 41.5) * dks, cy: 760 - 66.5 * dks });

	// ---------- element refs ----------
	let rootEl: HTMLDivElement;
	let stageEl: HTMLDivElement;
	let scrEl: HTMLDivElement;
	let wpgEl: HTMLDivElement;
	let wpEl: HTMLDivElement;
	let wpbEl: HTMLDivElement;
	let wpdEl: HTMLDivElement;
	let fillEl: HTMLDivElement;
	let clockEl: HTMLDivElement;
	let dockEl: HTMLDivElement;
	let tmEl: HTMLSpanElement;
	const wins: Record<string, HTMLDivElement> = {};
	const cts: Record<string, HTMLDivElement> = {};
	const icos: Record<string, HTMLDivElement> = {};
	const iconEls: Record<string, HTMLDivElement> = {};
	let launcher: Launcher | undefined;

	// ---------- stage metrics (measured on pointerdown / resize, never per pointermove) ----------
	const SR = { left: 0, top: 0, s: 1 };
	/** the whole page in stage units: the stage is 16:9 and scaled to fit, so in any other window shape one of these is bigger than 1366 / 768 */
	let pageW = 1366;
	let pageH = 768;
	function fit() {
		const s = Math.min(rootEl.clientWidth / 1366, rootEl.clientHeight / 768);
		scale = SR.s = s || 1;
		pageW = Math.max(1366, rootEl.clientWidth / SR.s);
		pageH = Math.max(768, rootEl.clientHeight / SR.s);
		launcher?.refit();
	}
	function measure() {
		const r = stageEl.getBoundingClientRect();
		SR.left = r.left;
		SR.top = r.top;
	}
	const toStage = (cx: number, cy: number) => ({ x: (cx - SR.left) / SR.s, y: (cy - SR.top) / SR.s });

	/** what the lock-screen editor needs from this component */
	const host: EditorHost = {
		stage: () => stageEl,
		scr: () => scrEl,
		dock: () => dockEl,
		tm: () => tmEl,
		isWallpaper: (t) => t === scrEl || t === stageEl || t === wpEl,
		sr: () => SR,
		measure: () => measure(),
		dockEditing: () => ed,
		anyOpen: () => !!launcher?.anyOpen(),
		toast: (t) => toast(t)
	};

	// ---------- persistence ----------
	const saveOrder = () => LB.storage.set('lb.dock', $state.snapshot(order));
	function setDks(v: number, quiet = false) {
		v = cl(Math.round(v * 100) / 100, DMIN, DMAX);
		dks = v;
		if (!quiet) LB.storage.set('lb.dks', v);
	}

	// ---------- toast ----------
	let toastT: ReturnType<typeof setTimeout> | undefined;
	function toast(t: string) {
		toastText = t;
		toastOn = true;
		clearTimeout(toastT);
		toastT = setTimeout(() => (toastOn = false), 1600);
	}

	// ---------- edit mode: long-press to edit, drag to rearrange / add / remove ----------
	let sup = 0; // timestamp: swallow the click that follows an edit gesture
	let edxT: ReturnType<typeof setTimeout> | undefined;
	function setEd(on: boolean) {
		if (on === ed) return;
		ed = on;
		sup = Date.now();
		clearTimeout(edxT);
		if (on) {
			editN = order.length;
			edx = false;
			const next: Record<string, { d: string; p: string }> = {};
			for (const k of IDS) next[k] = { d: `${-Math.random() * 0.27}s`, p: `${(0.24 + Math.random() * 0.07).toFixed(3)}s` };
			jig = next;
		} else {
			edx = true;
			edxT = setTimeout(() => (edx = false), 800);
		}
		saveOrder();
	}

	type Press = { id: string; el: HTMLElement; x: number; y: number; lx?: number; ly?: number; t?: ReturnType<typeof setTimeout> };
	let pd: Press | null = null;
	let dr: { id: string; el: HTMLElement; gx: number; gy: number } | null = null; // gx/gy: pointer -> icon centre, stage units
	let vj = '';

	const LIFT = 'inset 0 0 0 1px rgba(255,255,255,.1),0 18px 36px rgba(0,0,0,.4)';
	const REST = 'inset 0 0 0 1px rgba(255,255,255,.07),0 1px 3px rgba(0,0,0,.25)';

	function begin(clientX: number, clientY: number) {
		if (!pd) return;
		measure();
		const { x: px, y: py } = toStage(clientX, clientY);
		const id = pd.id;
		const ps = pos[id];
		// the icon's current centre on screen: that is what the pointer is measured against while dragging
		const ccx = dockL + (ps.x + 41.5) * dks;
		const ccy = 760 - (132 - ps.y - 41.5) * dks;
		dr = { id, el: pd.el, gx: px - ccx, gy: py - ccy };
		drag = { id, x: ps.x, y: ps.y };
		pd.el.animate?.([{ transform: 'scale(1)', boxShadow: REST }, { transform: 'scale(1.14)', boxShadow: LIFT }], { duration: 420, easing: SPR });
	}

	function onStageDown(e: PointerEvent) {
		if (e.button || !e.isPrimary) return;
		measure();
		const t = e.target as HTMLElement;

		// dock icons: hold to edit, drag to rearrange; tap empty space to leave edit mode
		if (!we && !t.closest('.rm, .done, .dsz')) {
			const el = t.closest<HTMLElement>('.ic');
			if (!el || el.classList.contains('off')) {
				if (ed) setEd(false);
			} else {
				const me: Press = { id: el.dataset.k!, el, x: e.clientX, y: e.clientY };
				pd = me;
				if (!ed)
					me.t = setTimeout(() => {
						setEd(true);
						begin(me.lx ?? me.x, me.ly ?? me.y);
					}, 450);
			}
		}

		// small windows (quit) close when you press outside them
		launcher?.dismissOutside(t);

		// lock-screen editor: wallpaper long-press, carousel and Customize gestures
		editor?.onStageDown(e);
	}

	function onMove(e: PointerEvent) {
		if (!pd) return;
		pd.lx = e.clientX;
		pd.ly = e.clientY;
		if (!dr) {
			if (Math.hypot(e.clientX - pd.x, e.clientY - pd.y) > 6) {
				if (ed) begin(pd.x, pd.y);
				else clearTimeout(pd.t);
			}
			return;
		}
		const { x: px, y: py } = toStage(e.clientX, e.clientY);
		const id = dr.id;
		const cx = px - dr.gx; // icon centre, stage units
		const cy = py - dr.gy;
		// the lifted icon lives inside the dock, so convert to dock-local units (the dock is scaled from its bottom-left corner)
		drag = { id, x: (cx - dockL) / dks - 41.5, y: 132 - (760 - cy) / dks - 41.5 };

		const rest = order.filter((k) => k !== id);
		let L: string[];
		if (py > 760 - 132 * dks - 48 && px > dockL - 70 && px < dockL + dW(rest.length + 1) * dks + 20) {
			const i = cl(Math.round(((cx - dockL) / dks - 77.5) / 108), 0, rest.length);
			L = [...rest.slice(0, i), id, ...rest.slice(i)];
		} else L = APPS[id].r ? rest : [...order]; // dragging a removable icon out of the dock removes it
		if (L.join() !== vj) {
			vl = L;
			vj = L.join();
		}
	}

	function onUp() {
		if (!pd) return;
		clearTimeout(pd.t);
		if (dr) {
			const el = dr.el;
			if (vl) order = [...vl];
			vl = null;
			vj = '';
			dr = null;
			drag = null;
			sup = Date.now();
			saveOrder();
			el.animate?.([{ transform: 'scale(1.14)', boxShadow: LIFT }, { transform: 'scale(1)', boxShadow: REST }], { duration: 520, easing: SPR });
		}
		pd = null;
	}

	function onIconClick(e: MouseEvent, id: string) {
		if ((e.target as Element).closest('.rm')) {
			order = order.filter((k) => k !== id);
			saveOrder();
			return;
		}
		if (Date.now() - sup < 350) return;
		if (ed) {
			if (pos[id].tr) {
				order = [...order, id];
				saveOrder();
			}
			return;
		}
		// A window that is still shrinking back can be tapped open again: it turns around from where it is, so rapid
		// open / close never waits for the icon to come back. That holds for the windows that show a screen of the client as
		// well: the screen is asked for again right away (`onOpen`), and the router knows that the answers of the close that
		// was just cancelled are not meant for the new window (`menuLink.wasAsked`, see App.svelte).
		launcher?.open(id);
	}

	// ---------- interrupting the opening / closing animation ----------
	// A press on the spot of the icon (its own size, where it sits in the dock) turns a window around from where it is, so tapping the
	// same icon again and again opens and closes it with no waiting: while the window has only just started to grow (the same as Esc),
	// and while it is shrinking back (it grows again). The icon is under the window by then, so a second tap on the same spot lands
	// on the window. A press anywhere else while the window has only just started to grow does nothing (the screen on it is not
	// drawn yet). After 80% of its way the press belongs to the screen on it again: its buttons must be usable as soon as they are drawn.
	const CANCEL_BELOW = 0.8;
	let cancelAt = -1e9;
	// the click that follows a press that turned a window around is not for what is under it; only that one click, so the next tap
	// (a quick tap again) is a tap of its own
	let swallowClick = false;
	function onCancelPress(e: PointerEvent) {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		swallowClick = false; // a new press: the click of the one before is over
		const id = launcher?.frontId();
		if (!id) return;
		const k = launcher!.openingProgress(id);
		const young = k !== null && k < CANCEL_BELOW;
		const closing = launcher!.isClosing(id);
		if (!young && !closing) return;

		measure();
		const at = toStage(e.clientX, e.clientY);
		const slot = slotOf(id);
		const half = (83 * dks) / 2;
		const onIcon = Math.abs(at.x - slot.cx) <= half && Math.abs(at.y - slot.cy) <= half;

		if (closing) {
			// the icon may be tapped open again while its window is still shrinking back; elsewhere the screen is for the rest of the menu
			if (!onIcon || ed) return;
			e.preventDefault();
			e.stopPropagation();
			swallowClick = true;
			cancelAt = performance.now();
			launcher!.open(id);
			return;
		}

		// the press must not also act on what is under it (the click that follows it is swallowed below)
		e.preventDefault();
		e.stopPropagation();
		swallowClick = true;
		cancelAt = performance.now();
		if (onIcon) closeApp();
	}
	function onCancelClick(e: MouseEvent) {
		if (swallowClick && performance.now() - cancelAt < 600) {
			e.preventDefault();
			e.stopPropagation();
		}
		swallowClick = false;
	}

	function onSize(percent: number) {
		dz = true;
		setDks(percent / 100);
	}

	// window-level pointer / key events feed both the dock and the editor
	const winMove = (e: PointerEvent) => {
		onMove(e);
		editor?.onMove(e);
	};
	const winUp = (e: PointerEvent) => {
		onUp();
		editor?.onUp(e, false);
	};
	const winCancel = (e: PointerEvent) => {
		onUp();
		editor?.onUp(e, true);
	};
	const winBlur = () => {
		onUp();
		editor?.onUp(null, true);
	};
	function onKey(e: KeyboardEvent) {
		if (overlayActive) return; // the real screen on top owns the keyboard
		const t = e.target as HTMLInputElement;
		if (t.tagName === 'INPUT' && t.type !== 'range' && e.key !== 'Escape') return;
		if (editor?.onKey(e)) return;
		if (e.key === 'Escape') {
			setEd(false);
			closeApp();
		} else if (e.key === 'ArrowUp' || e.key === 'h' || e.key === 'H') closeApp();
	}

	/** shrink the front window back into its icon */
	function closeApp() {
		resume.id = null; // nothing is handed over to the client any more
		launcher?.close();
	}

	// The real screen on top went away (Cancel, Escape): shrink the window that screen belonged to back into its icon.
	// Only that window: if another app was opened in the meantime, this late message must not close it.
	let lastOverlay: string | null = null;
	$effect(() => {
		const now = overlayScreen;
		const was = lastOverlay;
		lastOverlay = now;
		if (!was || now) return;
		const id = SCREEN_APP[was];
		if (id && launcher?.isOpen(id)) {
			resume.id = null;
			launcher.close(id);
		}
	});

	const quit = () => {
		LB.exit();
		launcher?.close();
	};

	// ---------- clock: re-renders only when the minute (or day) changes ----------
	const tf = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', hourCycle: 'h23' });
	const dfm = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
	let clockT: ReturnType<typeof setTimeout> | undefined;
	function tickClock() {
		const now = new Date();
		TS = tf.format(now);
		DS = dfm
			.formatToParts(now)
			.filter((x) => x.type !== 'literal')
			.map((x) => x.value)
			.join(' ');
		clockT = setTimeout(tickClock, 60000 - (Date.now() % 60000) + 30);
	}

	/** Asking the client for a screen: ordering rules in screens.ts. The router drops screens that arrive too late. */
	const requests = new ScreenRequests({
		isOpen: (id) => !!launcher?.isOpen(id),
		send: (name) => {
			menuLink.ask(name);
			return LB.openScreen(name);
		},
		seen: () => menuLink.seen,
		now: () => performance.now()
	});
	const requestScreen = (id: string, name: string) => requests.request(id, name);

	// ---------- handing a window over to one of the client's own screens (Settings) ----------
	// The client's screens cannot be drawn by the page, so a window of that kind (Settings) asks for its screen as soon as it has finished
	// opening. There is no fade: the window plate stays on screen until the client's screen takes over, and nothing is left to undo if
	// it never does (Esc closes the window as usual).

	/** is a window open (or opening) that shows a screen of the page? */
	const earlyOpen = () => !!launcher && WINS.some((id) => early(id) && launcher!.isOpen(id));
	/** is a window that shows a screen of the page still on screen at all, including one that is shrinking back into its icon? */
	const earlyActive = () => !!launcher && WINS.some((id) => early(id) && launcher!.isActive(id));

	onMount(() => {
		// lets the jiggle strength (--amp) ease in and out instead of snapping
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(CSS as any).registerProperty({ name: '--amp', syntax: '<number>', inherits: false, initialValue: '0' });
		} catch {
			/* already registered */
		}

		const apps: Record<string, AppEls> = {};
		for (const id of WINS)
			apps[id] = {
				win: wins[id],
				ct: cts[id],
				ico: icos[id],
				tw: TW[id],
				th: TH[id],
				full: !!REAL_SCREEN[id],
				// page screens are drawn over the whole page, so their window grows to the whole page as well (see AppEls.fit)
				fit: early(id) ? () => ({ w: pageW, h: pageH }) : undefined
			};
		launcher = new Launcher({
			apps,
			wpg: wpgEl,
			wpb: wpbEl,
			wpd: wpdEl,
			fill: fillEl,
			clock: clockEl,
			dock: dockEl,
			slot: slotOf,
			dks: () => dks,
			setActive: (id, on) => (appActive[id] = on),
			// page screens are opened as the window starts to grow and follow it (see overlayfx.ts), like on an iPad
			onOpen: (id, resumed) => {
				if (!early(id)) return;
				// A window that is still shrinking may still have its screen on top. That screen is not this window's: drop
				// it now, instead of letting it grow out of this icon until the right one arrives.
				// Not when this very window turned around and the screen on top is its own (the client has not replaced it
				// yet): that screen simply goes along with the window again, with no gap in between.
				if (!(resumed && overlayScreen === REAL_SCREEN[id])) fx.closed();
				measure();
				requestScreen(id, REAL_SCREEN[id]!);
			},
			// A window that was shown as already open has no measurement of the stage, and at mount the stage is not scaled to the
			// window yet either (the scale is applied after this): measure when the close starts, the stage is in place by then.
			onClose: (id) => {
				if (!early(id)) return;
				measure();
				// windows on top of that screen (the alts button, Create New World) shrink back into their buttons on the way out
				menuLink.notifyClosing();
			},
			onFrame: (f) => {
				if (!early(f.id)) return;
				// There is one screen layer: the front window owns it, so a window that is still shrinking cannot fight
				// the one that is opening (or closing) over it.
				const front = launcher?.frontId();
				if (front && front !== f.id && early(front)) return;
				// follows the window both ways: growing out of the icon and shrinking back into it
				const s = SR.s;
				fx.set({
					x: SR.left + (f.cx - f.w / 2) * s,
					y: SR.top + (f.cy - f.h / 2) * s,
					sx: (f.w * s) / rootEl.clientWidth,
					sy: (f.h * s) / rootEl.clientHeight,
					o: smooth(0.05, 0.45, f.m) * f.op,
					r: f.r * s,
					open: f.open
				});
			},
			onClosed: (id) => {
				// The screen layer belongs to the page-screen windows. It may only be cleared once the last of them is gone:
				// a window that finishes first (the quit window, or an older app) must not wipe the screen of another
				// window that is still shrinking, or that screen vanishes in the middle of its animation.
				if (!earlyActive()) fx.closed();
			},
			onOpened: (id) => {
				if (early(id)) fx.clear();
				// the client's own screens cannot be drawn over the page: those open once the window is fully open
				const s = REAL_SCREEN[id];
				if (s && NATIVE_SCREEN.has(id)) {
					resume.id = id;
					requestScreen(id, s);
				}
			}
		});

		// the client re-opened the title (back from a native screen) while this menu stayed mounted
		// Only the window that was handed over to a native screen is closed by this. The title also opens for other
		// reasons (the client going back to it after a screen it did not want), and that must not close an app the
		// user has just opened.
		const onTitleOpen = () => {
			const id = resume.id;
			if (overlayActive || !id || !launcher?.isOpen(id)) return;
			resume.id = null;
			launcher.close(id);
		};
		window.addEventListener('lb:title-open', onTitleOpen);
		window.addEventListener('pointerdown', onCancelPress, true);
		window.addEventListener('click', onCancelClick, true);

		menuLink.expects = (screen) => {
			const id = SCREEN_APP[screen];
			return !!id && !!launcher?.isOpen(id);
		};
		menuLink.busy = earlyOpen;
		// the page's own Cancel / Back buttons: start the shrink on the click instead of when the client has answered
		menuLink.closeNow = (screen) => {
			const id = SCREEN_APP[screen];
			if (!id || !launcher?.isOpen(id)) return;
			resume.id = null;
			launcher.close(id);
		};
		// the window of this screen was told to close and is still shrinking
		menuLink.closing = (screen) => {
			const id = SCREEN_APP[screen];
			return !!id && !!launcher?.isClosing(id);
		};

		const ro = new ResizeObserver(fit);
		ro.observe(rootEl);
		fit();
		tickClock();

		if (resume.id) {
			const id = resume.id;
			resume.id = null;
			launcher.restore(id);
		} else if (adoptScreen) {
			// This menu was mounted for a screen the client opened on its own (back from a game, Cancel on the connecting screen, see
			// App.svelte): the screen is already there, so the menu just shows its window as open (the page fades in as a whole), and
			// closing it shrinks the window and the screen into its icon like any other window (the stage position the screen layer
			// follows is measured when the window is told to close, see `onClose`: not here, the stage is not scaled yet at mount).
			const id = SCREEN_APP[adoptScreen];
			if (id) launcher.show(id);
		}

		// Draw the effects of the first app open once, invisibly, while the lock screen is idle (see warmup.ts). Off with
		// localStorage 'lb.nowarm' = '1' (for comparing in the client).
		const stopWarm = LB.storage.get('lb.nowarm')
			? () => {}
			: warmUp({
					host: stageEl,
					set: (on) => (warm = on),
					idle: () => !!launcher && !WINS.some((id) => launcher!.isActive(id)) && !we && !ed && !pd && !dr && !overlayActive,
					image: () => /^url\("([^"]+)"\)/.exec(bgv(p))?.[1] ?? ''
				});

		return () => {
			stopWarm();
			requests.dispose();
			if (menuLink.busy === earlyOpen) {
				menuLink.busy = null;
				menuLink.expects = null;
				menuLink.closeNow = null;
				menuLink.closing = null;
			}
			launcher?.destroy();
			fx.clear();
			window.removeEventListener('lb:title-open', onTitleOpen);
			window.removeEventListener('pointerdown', onCancelPress, true);
			window.removeEventListener('click', onCancelClick, true);
			ro.disconnect();
			clearTimeout(clockT);
			clearTimeout(toastT);
			clearTimeout(edxT);
			if (pd) clearTimeout(pd.t);
		};
	});
</script>

<svelte:window onpointermove={winMove} onpointerup={winUp} onpointercancel={winCancel} onblur={winBlur} onkeydown={onKey} />

<div
	class="lb-menu"
	class:ed
	class:edx
	class:dz
	class:warm
	bind:this={rootEl}
	data-we={we}
	data-m={p.ic.m}
	data-a={p.ic.a}
	data-l={lum(tint) > 0.6 ? '1' : '0'}
	style:--tc={tint}
	style:--vf={STY[p.v][1]}
	style:--dks={dks}
	style:--sp={linear ? SPR : undefined}
	style:--sm={linear ? SPM : undefined}
>
	<!-- The stage is a fixed 16:9 (1366x768) design that is scaled to fit, so any other window shape leaves room around it.
	     This layer paints the same wallpaper (softly blurred) across the whole window so that room is never black. -->
	<div class="fill" aria-hidden="true" bind:this={fillEl}>
		<div class="fw" style:background={bgv(p)}></div>
		<div class="fd"></div>
	</div>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="stage"
		bind:this={stageEl}
		style:transform="scale({scale})"
		onpointerdown={onStageDown}
		oncontextmenu={(e) => e.preventDefault()}
	>
		<div class="scr" bind:this={scrEl}>
			<div class="wpg" bind:this={wpgEl}>
				<div class="wp" bind:this={wpEl} style:background={bgv(p)} style:transform={crop(p) || undefined}></div>
				<div class="wpb" bind:this={wpbEl} style:background={bgv(p)} style:transform={crop(p) || undefined}></div>
				<div class="wpd" bind:this={wpdEl}></div>
			</div>
			<div class="clock" bind:this={clockEl}>
				<span class="tm" bind:this={tmEl} style={clockCss(p)}>{clockText}</span>
				<div class="dt" style={dateCss(p)}>{DS}</div>
			</div>

			<div class="dock" bind:this={dockEl} style:left="{dockL}px" style:width="{dockW}px">
				<i class="dsep" data-e={m ? undefined : ''} style:translate="{36 + n * 108}px 0"></i>
				{#each IDS as id (id)}
					{@const ps = drag?.id === id ? drag : pos[id]}
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
					<div
						class="ic s"
						class:r={APPS[id].r}
						class:tr={pos[id].tr}
						class:lift={drag?.id === id}
						class:off={appActive[id]}
						data-k={id}
						bind:this={iconEls[id]}
						style:translate="{ps.x}px {ps.y}px"
						style:--i={pos[id].i}
						style:--jd={jig[id]?.d}
						style:--jp={jig[id]?.p}
						onclick={(e) => onIconClick(e, id)}
					>
						<div class="g">{@html dockGlyph[id]}</div>
						<b class="rm" use:pressPhysics>&minus;</b>
						{#if APPS[id].n}<span class="lbl">{APPS[id].n}</span>{/if}
					</div>
				{/each}
			</div>
		</div>

		<div class="dsz">
			<i class="a"></i>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="dszw"
				onkeydown={(e) => {
					if (e.key !== 'Escape') e.stopPropagation();
				}}
			>
				<Slider label="Dock size" min={Math.round(DMIN * 100)} max={Math.round(DMAX * 100)} step={1} big={1.5} value={Math.round(dks * 100)} oninput={onSize} ondone={() => (dz = false)} />
			</div>
			<i class="b"></i>
		</div>
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div class="done" use:pressPhysics onclick={() => setEd(false)}><span data-press-label>Done</span></div>
		<div class="toast" class:on={toastOn}>{toastText}</div>

		{#each WINS as id (id)}
			<div class="win" data-w={id} bind:this={wins[id]}>
				<div class="ct" bind:this={cts[id]} style:width="{TW[id]}px" style:height="{TH[id]}px">
					{#if REAL_SCREEN[id]}
						<!-- the real screen is drawn over this by the page; this is the blurred wallpaper it sits on -->
						<div class="rw" style:background={bgv(p)} style:transform={crop(p) || undefined}></div>
					{:else}
						<AppScreen kind={id} onclose={() => launcher?.close()} onquit={quit} />
					{/if}
				</div>
				<div class="ico" bind:this={icos[id]}><div class="g">{@html winGlyph[id]}</div></div>
			</div>
		{/each}

		<LockScreenEditor bind:this={editor} bind:we {host} time={TS} date={DS} />
	</div>
</div>

<style>
	.lb-menu {
		--ui: 'Inter', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
		--ease: cubic-bezier(0.32, 0.72, 0, 1);
		--spring: cubic-bezier(0.34, 1.32, 0.4, 1);
		--card-shadow: 0 2px 6px rgba(0, 0, 0, 0.3), 0 20px 44px -10px rgba(0, 0, 0, 0.6);
		position: fixed;
		inset: 0;
		overflow: hidden;
		background: #000;
		color: #fff;
		font-family: var(--ui);
		font-synthesis: none;
		-webkit-font-smoothing: antialiased;
		text-rendering: optimizeLegibility;
		-webkit-user-select: none;
		user-select: none;
		-webkit-touch-callout: none;
		touch-action: none;
	}
	.lb-menu * {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	}
	/* ===== ambient fill: wallpaper behind the stage, visible only in the space the 16:9 stage leaves in other window shapes ===== */
	.fill {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
		--u: 0; /* app-open dimming, driven by the launcher */
	}
	.fw {
		position: absolute;
		inset: -80px; /* bleed, so the blur never fades to black at the window edge */
		filter: var(--vf, brightness(1)) blur(36px) saturate(1.2);
		transition: filter 0.5s;
		transform: translateZ(0);
	}
	.fd {
		position: absolute;
		inset: 0;
		background: #000;
		opacity: calc(0.26 * var(--u));
	}
	/* the lock-screen editor has a dark backdrop of its own: match it */
	.lb-menu:not([data-we='0']) .fw {
		filter: var(--vf, brightness(1)) blur(36px) saturate(1.25) brightness(0.55);
	}
	.stage {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 1366px;
		height: 768px;
		margin: -384px 0 0 -683px;
		overflow: hidden;
		background: #3a3532;
	}

	/* ===== shared frosted glass ===== */
	.dock,
	.dsz,
	.done {
		background: rgba(138, 138, 148, 0.3);
		-webkit-backdrop-filter: blur(30px) saturate(1.5);
		backdrop-filter: blur(30px) saturate(1.5);
		box-shadow:
			inset 0 0 0 1px rgba(255, 255, 255, 0.16),
			inset 0 1px 0 rgba(255, 255, 255, 0.28),
			0 10px 30px rgba(0, 0, 0, 0.16);
	}

	/* ===== lock-screen layers =====
	   the wallpaper blur is a pre-blurred copy that fades in (opacity/transform = compositor only),
	   instead of re-blurring a full-screen image every frame */
	.scr {
		position: absolute;
		inset: 0;
		overflow: hidden;
		will-change: transform;
		box-shadow: var(--card-shadow);
	}
	.wpg {
		position: absolute;
		inset: 0;
		pointer-events: none;
		will-change: transform;
	}
	.wp,
	.wpb,
	.wpd {
		position: absolute;
		inset: 0;
	}
	.wp,
	.wpb {
		transition:
			transform 0.55s var(--ease),
			filter 0.5s;
	}
	.wp {
		filter: var(--vf, brightness(1));
	}
	.wpb {
		filter: var(--vf, brightness(1)) blur(var(--wbl, 30px));
		opacity: 0;
		visibility: hidden;
	}
	.wpd {
		background: #000;
		opacity: 0;
	}
	/* while the lock-screen editor is open the live screen and dock are not interactive; the editor's own layers are */
	.lb-menu:not([data-we='0']) .scr,
	.lb-menu:not([data-we='0']) .dock {
		pointer-events: none;
	}
	.scr:after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		box-shadow: var(--card-ring);
		pointer-events: none;
		z-index: 50;
		opacity: var(--r, 0);
		will-change: opacity;
	}
	.scr:before {
		content: '';
		position: absolute;
		inset: 0;
		background: #000;
		pointer-events: none;
		z-index: 49;
		opacity: var(--dm, 0);
		will-change: opacity;
	}
	.clock {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		pointer-events: none;
		z-index: 2;
		will-change: transform, opacity;
	}
	.tm {
		font:
			200 230px/1 'Inter Variable',
			Inter,
			sans-serif;
		letter-spacing: -6px;
		font-variant-numeric: tabular-nums;
		color: rgba(255, 255, 255, 0.93);
		text-shadow: 0 4px 40px rgba(0, 0, 0, 0.22);
		position: relative;
		top: -64px;
		will-change: translate;
		white-space: pre;
		text-align: center;
		transition: color 0.25s;
	}
	.dt {
		position: absolute;
		left: 0;
		right: 0;
		top: 66px;
		text-align: center;
		font: 600 22px/22px var(--ui);
		font-style: normal;
		color: rgba(255, 255, 255, 0.93);
		text-shadow: 0 2px 14px rgba(0, 0, 0, 0.22);
	}
	/* ===== dock + icons ===== */
	.dock {
		position: absolute;
		left: 443px;
		top: 628px;
		width: 480px;
		height: 132px;
		border-radius: 46px;
		scale: var(--dks, 0.6);
		transform-origin: 0 100%;
		will-change: transform;
		z-index: 5;
		transition:
			left 0.4s var(--ease),
			width 0.4s var(--ease),
			background 0.5s var(--ease),
			box-shadow 0.5s var(--ease);
	}
	.dz .dock {
		transition:
			background 0.5s var(--ease),
			box-shadow 0.5s var(--ease);
	}
	.ic {
		position: relative;
		width: 83px;
		height: 83px;
		border-radius: 19px;
		background: var(--pl, linear-gradient(#1f1f21, #0c0c0d));
		box-shadow:
			inset 0 0 0 1px rgba(255, 255, 255, 0.07),
			0 1px 3px rgba(0, 0, 0, 0.25);
		cursor: pointer;
		transition:
			transform 0.18s cubic-bezier(0.3, 0.7, 0.3, 1),
			filter 0.18s,
			--amp 0.6s cubic-bezier(0.32, 0.72, 0, 1);
	}
	.ic:active {
		transform: scale(0.9);
		filter: brightness(0.75);
		transition-duration: 0.06s;
	}
	/* The icon is covered by its own window while that is alive. It is made invisible with opacity, not visibility:
	   an element with visibility:hidden cannot be tapped, which made the icon dead for the whole time the window was
	   shrinking back (the window itself ignores the pointer). */
	.ic.off {
		opacity: 0;
	}
	.g {
		position: absolute;
		inset: 0;
		filter: var(--gf, none);
	}
	.g :global(svg) {
		width: 100%;
		height: 100%;
		display: block;
	}
	/* icons are positioned with the individual `translate` property: compositor-friendly, no layout per frame */
	.ic.s {
		position: absolute;
		left: 0;
		top: 0;
		translate: 0 0;
		transition:
			translate 0.32s cubic-bezier(0.3, 0.7, 0.3, 1),
			transform 0.18s cubic-bezier(0.3, 0.7, 0.3, 1),
			filter 0.18s,
			--amp 0.6s cubic-bezier(0.32, 0.72, 0, 1);
	}
	/* the lifted icon follows the pointer with no translate transition, and springs up */
	.ic.lift {
		transition:
			transform 0.34s var(--sp, cubic-bezier(0.3, 0.7, 0.3, 1)),
			box-shadow 0.3s;
		transform: scale(1.14);
		z-index: 40;
		box-shadow:
			0 18px 36px rgba(0, 0, 0, 0.4),
			inset 0 0 0 1px rgba(255, 255, 255, 0.1);
	}

	/* ---- rearrange mode ----
	   The jiggle is one calm animation whose strength (--amp) eases in and out, instead of a stack of pops and bobs.
	   .edx = exit: keeps the jiggle alive while --amp eases back to 0. */
	@keyframes jg {
		from {
			rotate: calc(var(--amp) * -1.7deg);
		}
		to {
			rotate: calc(var(--amp) * 1.7deg);
		}
	}
	@keyframes rmin {
		from {
			scale: 0.3;
			opacity: 0;
		}
		to {
			scale: 1;
			opacity: 1;
		}
	}
	@keyframes rmout {
		to {
			scale: 0.3;
			opacity: 0;
		}
	}
	.ed .ic {
		--amp: 1;
	}
	.ed .ic:not(.lift),
	.edx .ic:not(.lift) {
		animation: jg var(--jp, 0.27s) ease-in-out var(--jd, 0s) infinite alternate;
	}
	.ed .ic:nth-child(even):not(.lift),
	.edx .ic:nth-child(even):not(.lift) {
		animation-direction: alternate-reverse;
	}
	.ed .dock {
		background: rgba(150, 150, 162, 0.38);
		box-shadow:
			inset 0 0 0 1px rgba(255, 255, 255, 0.26),
			inset 0 1px 0 rgba(255, 255, 255, 0.36),
			0 16px 44px rgba(0, 0, 0, 0.22);
	}
	.ed .ic:active {
		transform: none;
		filter: none;
	}
	.rm {
		display: none;
		position: absolute;
		left: -9px;
		top: -9px;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: rgba(72, 72, 76, 0.95);
		box-shadow:
			0 0 0 1px rgba(255, 255, 255, 0.18),
			0 2px 6px rgba(0, 0, 0, 0.35);
		color: #fff;
		font: 700 22px/26px var(--ui);
		text-align: center;
		z-index: 3;
	}
	.ed .dock .r:not(.tr) .rm {
		display: block;
		animation: rmin 0.3s cubic-bezier(0.3, 0.7, 0.3, 1) backwards;
	}
	.edx:not(.ed) .dock .r:not(.tr) .rm {
		display: block;
		animation: rmout 0.22s cubic-bezier(0.5, 0, 0.75, 0) forwards;
	}
	.lbl {
		display: none;
		position: absolute;
		left: 50%;
		top: calc(100% + 8px);
		transform: translateX(-50%);
		white-space: nowrap;
		font: 600 13px var(--ui);
		text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
		pointer-events: none;
	}
	.tr .lbl {
		display: block;
	}
	.lift .lbl {
		display: none;
	}

	/* ---- the rest of the apps: one strip with the dock, behind a hairline (like Recents in the iPadOS dock).
	   idle they are hidden; in edit mode the dock widens from its left edge and they fade in as it grows ---- */
	.ic.tr:not(.lift) {
		opacity: 0;
		visibility: hidden;
		pointer-events: none;
		transition:
			translate 0.32s cubic-bezier(0.3, 0.7, 0.3, 1),
			transform 0.18s cubic-bezier(0.3, 0.7, 0.3, 1),
			filter 0.18s,
			--amp 0.6s cubic-bezier(0.32, 0.72, 0, 1),
			opacity 0.16s,
			visibility 0s 0.16s;
	}
	.ed .ic.tr:not(.lift) {
		opacity: 1;
		visibility: visible;
		pointer-events: auto;
		transition:
			translate 0.32s cubic-bezier(0.3, 0.7, 0.3, 1),
			transform 0.18s cubic-bezier(0.3, 0.7, 0.3, 1),
			filter 0.18s,
			--amp 0.6s cubic-bezier(0.32, 0.72, 0, 1),
			opacity 0.26s ease calc(0.12s + var(--i, 0) * 36ms),
			visibility 0s;
	}
	.dsep {
		position: absolute;
		left: 0;
		top: 32px;
		width: 2px;
		height: 67px;
		border-radius: 1px;
		background: rgba(255, 255, 255, 0.3);
		opacity: 0;
		pointer-events: none;
		transition:
			translate 0.32s cubic-bezier(0.3, 0.7, 0.3, 1),
			opacity 0.2s;
	}
	.ed .dsep:not([data-e]) {
		opacity: 1;
		transition:
			translate 0.32s cubic-bezier(0.3, 0.7, 0.3, 1),
			opacity 0.26s ease 0.12s;
	}

	/* dock size: one slider scales the dock and its icons together */
	.dsz {
		position: absolute;
		left: 50%;
		top: calc(760px - 132px * var(--dks, 0.6) - 76px);
		width: 272px;
		height: 44px;
		margin-left: -136px;
		padding: 0 18px;
		display: flex;
		align-items: center;
		gap: 13px;
		border-radius: 22px;
		z-index: 6;
		opacity: 0;
		visibility: hidden;
		transform: translateY(8px);
		pointer-events: none;
		transition:
			opacity 0.2s,
			transform 0.3s cubic-bezier(0.5, 0, 0.75, 0),
			visibility 0s 0.3s;
	}
	.ed .dsz {
		opacity: 1;
		visibility: visible;
		transform: none;
		pointer-events: auto;
		transition:
			opacity 0.25s ease 0.1s,
			transform 0.45s cubic-bezier(0.32, 0.72, 0, 1) 0.1s,
			visibility 0s;
	}
	.dsz i {
		flex: none;
		display: block;
		border-radius: 30%;
		box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.85);
	}
	.dsz .a {
		width: 12px;
		height: 12px;
	}
	.dsz .b {
		width: 22px;
		height: 22px;
	}
	.dszw {
		flex: 1;
		min-width: 0;
		/* the shared spring slider: white fill and thumb on the glass */
		--sl-track: rgba(255, 255, 255, 0.22);
		--sl-fill: rgba(255, 255, 255, 0.92);
		--sl-focus: #fff;
	}
	.done {
		background: rgba(138, 138, 148, 0.3);
		-webkit-backdrop-filter: blur(30px) saturate(1.5);
		backdrop-filter: blur(30px) saturate(1.5);
		box-shadow:
			inset 0 0 0 1px rgba(255, 255, 255, 0.16),
			inset 0 1px 0 rgba(255, 255, 255, 0.28),
			0 10px 30px rgba(0, 0, 0, 0.16);
	}

	.done {
		position: absolute;
		right: 28px;
		top: 52px;
		padding: 10px 22px;
		border-radius: 22px;
		font: 600 17px var(--ui);
		z-index: 31;
		opacity: 0;
		visibility: hidden;
		transform: translateY(-14px) scale(0.86);
		transform-origin: 100% 0;
		pointer-events: none;
		transition:
			opacity 0.2s,
			transform 0.3s cubic-bezier(0.5, 0, 0.75, 0),
			visibility 0s 0.3s;
		cursor: pointer;
	}
	.done > :global([data-press-label]) {
		display: block;
	}
	.ed .done {
		opacity: 1;
		visibility: visible;
		transform: none;
		pointer-events: auto;
		transition:
			opacity 0.3s ease-out 0.14s,
			transform 0.8s var(--sm, cubic-bezier(0.22, 1, 0.36, 1)) 0.14s,
			visibility 0s;
	}
	.toast {
		position: absolute;
		left: 50%;
		top: 56px;
		transform: translate(-50%, -14px);
		padding: 12px 22px;
		border-radius: 24px;
		background: rgba(30, 30, 32, 0.82);
		-webkit-backdrop-filter: blur(24px);
		backdrop-filter: blur(24px);
		font: 600 16px var(--ui);
		opacity: 0;
		visibility: hidden;
		transition:
			opacity 0.3s,
			transform 0.3s,
			visibility 0s 0.3s;
		pointer-events: none;
		z-index: 50;
	}
	.toast.on {
		opacity: 1;
		visibility: visible;
		transform: translate(-50%, 0);
		transition-delay: 0s;
	}

	/* ===== app windows (size / position / radius are driven per frame by the launcher) ===== */
	.win {
		position: absolute;
		left: 0;
		top: 0;
		overflow: hidden;
		display: none;
		z-index: 10;
		background: #000;
		box-shadow:
			0 14px 50px rgba(0, 0, 0, 0.45),
			inset 0 0 0 1px rgba(255, 255, 255, 0.08);
		will-change: transform;
		contain: layout style;
	}
	.ct {
		position: absolute;
		left: 0;
		top: 0;
		transform-origin: 0 0;
		background: #000;
	}
	/* warm-up (warmup.ts): the pre-blurred wallpaper and ONE window are drawn once at 0.4 % opacity so the first real open finds the
	   decoded image, the layers and the blur programs ready. Inline styles from the launcher win over these as soon as an app opens. */
	.lb-menu.warm .wpb {
		visibility: visible;
		opacity: 0.004;
	}
	.lb-menu.warm .win[data-w='sp'] {
		display: block;
		width: 1366px;
		height: 768px;
		opacity: 0.004;
		filter: blur(8px);
		pointer-events: none;
	}
	.rw {
		position: absolute;
		inset: -60px;
		filter: var(--vf, brightness(1)) blur(var(--wbl, 30px)) brightness(0.74);
	}
	.ico {
		position: absolute;
		inset: 0;
		pointer-events: none; /* it fades out but sits over the window content: it must not eat clicks */
		background: var(--pl2, linear-gradient(#1f1f21, #0c0c0d));
	}
	/* ===== icon styles (driven by data-m / data-a / --tc on the root) ===== */
	.lb-menu[data-m] {
		--pl: linear-gradient(#1f1f21, #0c0c0d);
		--pl2: var(--pl);
		--gf: none;
	}
	.lb-menu[data-a='l'] {
		--pl: linear-gradient(#fbfbfd, #d9d9df);
	}
	.lb-menu[data-a='l'][data-m='def'] .ic[data-k='st'] .g {
		filter: brightness(0.6);
	}
	.lb-menu[data-m='tnt'] {
		--pl: linear-gradient(var(--tc), color-mix(in srgb, var(--tc) 70%, #000));
		--pl2: var(--pl);
		--gf: grayscale(1) brightness(10);
	}
	.lb-menu[data-m='tnt'][data-a='d'] {
		--pl: linear-gradient(color-mix(in srgb, var(--tc) 40%, #000), color-mix(in srgb, var(--tc) 22%, #000));
		--gf: grayscale(1) brightness(1.5);
	}
	/* light tints get a dark glyph so it never vanishes */
	.lb-menu[data-m='tnt'][data-a='l'][data-l='1'] {
		--gf: grayscale(1) brightness(0) opacity(0.82);
	}
</style>
