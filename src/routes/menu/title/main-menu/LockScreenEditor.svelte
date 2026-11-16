<script lang="ts">
	import './lockscreen-editor.css';
	import { onMount, tick } from 'svelte';
	import ColorPicker from './ColorPicker.svelte';
	import DatePopover from './DatePopover.svelte';
	import type { EditorHost } from './editor-types';
	import DeleteSheet from './DeleteSheet.svelte';
	import FontPopover from './FontPopover.svelte';
	import Icon from './Icon.svelte';
	import IconPopover from './IconPopover.svelte';
	import { cl, sm } from './launcher';
	import {
		CK, CY, FT, ICD, SMAX, SMIN, STY, bgv, cc, clockCss, crop, dateCss, dbx, dcol, dropImg, flushWall, fmtN, importPhoto,
		kindOf, save, tcol, vname, wall, type ClockStyle, type LockScreen
	} from './lockscreen.svelte';
	import MorphingMenu from './MorphingMenu.svelte';
	import NewLockScreen from './NewLockScreen.svelte';
	import Popover from './Popover.svelte';
	import PressButton from './PressButton.svelte';
	import { pressPhysics } from './pressPhysics';
	import { PRESETS } from './wallpapers';

	let {
		we = $bindable(0),
		host,
		time,
		date
	}: {
		/** 0 = live lock screen, 1 = carousel of lock screens, 2 = Customize */
		we?: number;
		host: EditorHost;
		time: string;
		date: string;
	} = $props();

	const OFF = 1366 * 0.7 + 30; // card pitch while the carousel is at rest
	const PW = 340; // popover width
	const EASE = 'cubic-bezier(.32,.72,0,1)';

	// ---------- state the template reads ----------
	let pos = $state(wall.cur); // carousel page; pos === n is the "add" card
	let pop = $state(0); // 1 clock, 2 clock colour, 3 icons, 5 icon colour, 6 date, 7 date colour
	let ct = $state(0); // what the colour picker edits: 0 clock, 1 icons, 2 date
	let ctab = $state<'gr' | 'sp' | 'sl'>('sp');
	let cmDown = $state(false);
	let dmDown = $state(false);
	/** where a popover is, where its arrow is (ay: from its top; as: which edge), and what it grows out of (ox / oy: the arrow tip) */
	type PP = { l: number; t: number; ay: number; ad: 'block' | 'none'; as: 'l' | 'r'; ox: string; oy: string };
	const P0: PP = { l: 0, t: 0, ay: 60, ad: 'block', as: 'l', ox: '0', oy: '40%' };
	let pFp = $state<PP>({ ...P0 });
	let pCp = $state<PP>({ ...P0 });
	let pDp = $state<PP>({ ...P0 });
	let glide = $state(false);

	const n = $derived(wall.p.length);
	const p = $derived(wall.p[wall.cur]);
	const title = $derived(pos < n ? kindOf(wall.p[pos]) : 'Add New');
	const styleName = $derived(vname(p));
	const dbox = $derived(dbx(p.ck));

	// ---------- element refs ----------
	let wbgEl: HTMLDivElement;
	let wvEl: HTMLDivElement;
	let carEl: HTMLDivElement;
	let ecEl: HTMLDivElement;
	let cboxEl: HTMLDivElement;
	let edtEl: HTMLDivElement;
	let gxEl: HTMLElement;
	let gyEl: HTMLElement;
	let ttlEl: HTMLDivElement;
	let snEl: HTMLDivElement;
	let addEl: HTMLDivElement;
	let fiEl: HTMLInputElement;
	let pFel: HTMLDivElement | undefined = $state();
	let pCel: HTMLDivElement | undefined = $state();
	let pIel: HTMLDivElement | undefined = $state();
	let pDel: HTMLDivElement | undefined = $state();
	let nls: ReturnType<typeof NewLockScreen>;
	let plusEl: HTMLDivElement;
	let plusMenu: ReturnType<typeof MorphingMenu>;
	let del: ReturnType<typeof DeleteSheet>;

	// carousel cards register themselves here, keyed by their lock screen
	const cards = new Map<object, { el: HTMLElement; dm: HTMLElement }>();
	function card(node: HTMLElement, key: object) {
		cards.set(key, { el: node, dm: node.querySelector('.dm') as HTMLElement });
		return { destroy: () => void cards.delete(key) };
	}

	// ---------- motion: one small set of springs drives everything ----------
	// k = wallpaper scale (1 full screen, .7 carousel), p = carousel scroll position (in cards),
	// c = Customize controls, e = dock exit. Gestures only move a target (or grab p), so nothing ever cuts.
	type Sp = { x: number; v: number; t: number; k: number; c: number; e: number; ve: number };
	const spr = (x: number, k: number, z: number, e: number, ve: number): Sp => ({ x, v: 0, t: x, k, c: 2 * z * Math.sqrt(k), e, ve });
	const aimE = (s: Sp, t: number, k: number, z: number) => {
		s.t = t;
		s.k = k;
		s.c = 2 * z * Math.sqrt(k);
	};
	const E = { k: spr(1, 170, 1, 0.0004, 0.004), p: spr(wall.cur, 210, 0.92, 0.0006, 0.01), c: spr(0, 220, 1, 0.001, 0.01), e: spr(0, 200, 1, 0.001, 0.01), drag: 0 };
	const springs: Sp[] = [E.k, E.p, E.c, E.e];

	let rafE = 0;
	let lastE = 0;
	let kk = 1; // live-screen scale target (.7 in the carousel)
	let dx = 0; // carousel finger offset
	let sl = 1; // show the live screen (instead of the static cards)
	let lbr = '';
	let bgS = '';
	let delBusy = 0;
	let okey = -1;
	let isNew = 0;
	let prevCur = 0;
	let snap: string | null = null;
	let junk: string[] = [];
	let addMode = 0;
	let sdrag = 0;
	const vis: Record<string, string> = {};
	const setS = (el: HTMLElement, prop: 'visibility' | 'display', v: string) => {
		const key = prop + (el.id || el.className);
		if (vis[key] !== v) {
			vis[key] = v;
			el.style[prop] = v;
		}
	};
	const kickE = () => {
		if (!rafE) {
			lastE = performance.now();
			rafE = requestAnimationFrame(tickE);
		}
	};
	let frQ: (() => void) | null = null;
	let frP = false;
	const fr = (f: () => void) => {
		frQ = f;
		if (!frP) {
			frP = true;
			requestAnimationFrame(() => {
				frP = false;
				frQ?.();
			});
		}
	};

	function renderE() {
		if (!host.scr()) return;
		const scr = host.scr();
		const dock = host.dock();
		const k = E.k.x;
		const px = E.p.x;
		const c = cl(E.c.x, 0, 1);
		const e = cl(E.e.x, 0, 1);
		const f = cl((1 - k) / 0.3, 0, 1);
		const O = 1366 * k + 30;
		const sk = k.toFixed(4);
		scr.style.transform = `translate(${((wall.cur - px) * O * f).toFixed(2)}px,0px) scale(${sk})`; // f: carousel-ness, so the live screen is dead centre whenever it is full size
		const br = (34 * f).toFixed(1) + 'px';
		if (br !== lbr) {
			lbr = br;
			scr.style.borderRadius = br;
		}
		scr.style.setProperty('--r', f.toFixed(3));
		// only the carousel dims the live screen when it is not the page in focus; at full size it is never dimmed
		scr.style.setProperty('--dm', f > 0.002 ? (0.5 * cl(Math.abs(wall.cur - px), 0, 1)).toFixed(3) : '0');
		wall.p.forEach((lp, j) => {
			const d = cards.get(lp);
			if (!d) return;
			const q = j - px;
			d.el.style.transform = `translate(${(q * O).toFixed(2)}px,0px) scale(${sk})`;
			d.dm.style.opacity = (0.5 * cl(Math.abs(q), 0, 1)).toFixed(3);
		});
		{
			const q = n - px;
			addEl.style.transform = `translate(${(q * O).toFixed(2)}px,0px) scale(${sk})`;
			(addEl.querySelector('.dm') as HTMLElement).style.opacity = (0.5 * cl(Math.abs(q), 0, 1)).toFixed(3);
		}
		wvEl.style.setProperty('--f', f.toFixed(3));
		ecEl.style.setProperty('--c', c.toFixed(3));
		dock.style.translate = `0 ${(e * 190).toFixed(1)}px`;
		setS(dock, 'visibility', e > 0.995 ? 'hidden' : '');
		const away = f > 0.002 ? 'visible' : 'hidden';
		if (f > 0.002) setBg();
		setS(carEl, 'visibility', away);
		setS(wbgEl, 'visibility', away);
		setS(wvEl, 'visibility', away);
		plusEl.style.setProperty('--f', f.toFixed(3)); // the + menu lives above the cards, outside #wv1, so it gets the fade itself
		setS(plusEl, 'visibility', away);
		setS(ecEl, 'visibility', c > 0.002 ? 'visible' : 'hidden');
		setS(cboxEl, 'display', c > 0.002 ? 'block' : 'none');
		cboxEl.style.opacity = sm(0.35, 1, c).toFixed(3);
		cboxEl.style.scale = (1.05 - 0.05 * sm(0.25, 1, c)).toFixed(4);
	}

	function tickE(now: number) {
		const dt = cl((now - lastE) / 1000, 0.001, 0.05);
		lastE = now;
		const steps = Math.ceil(dt / 0.004);
		const hh = dt / steps;
		let rest = true;
		for (const s of springs) {
			if (s === E.p && E.drag) {
				s.v = 0;
				continue;
			}
			for (let i = 0; i < steps; i++) {
				s.v += (s.k * (s.t - s.x) - s.c * s.v) * hh;
				s.x += s.v * hh;
			}
			if (Math.abs(s.t - s.x) < s.e && Math.abs(s.v) < s.ve) {
				s.x = s.t;
				s.v = 0;
			} else rest = false;
		}
		renderE();
		if (rest) {
			rafE = 0;
			settled();
		} else rafE = requestAnimationFrame(tickE);
	}

	// once everything is at rest: park the carousel (static cards instead of the live screen) or hide it entirely
	function settled() {
		if (!we) {
			carEl.style.display = 'none';
			nls?.settle();
		} else if (we === 1 && sl && !E.drag) {
			sl = 0;
			visAll();
		}
	}
	function lay() {
		kk = we === 1 ? 0.7 : 1;
		aimE(E.k, kk, 170, 1);
		aimE(E.c, we === 2 ? 1 : 0, 220, 1);
		aimE(E.e, we ? 1 : 0, 200, 1);
		if (!E.drag) aimE(E.p, pos, 210, 0.92);
		kickE();
	}
	function visAll() {
		host.scr().style.visibility = sl ? 'visible' : 'hidden';
		wall.p.forEach((lp, j) => {
			const d = cards.get(lp);
			if (d) d.el.style.visibility = sl && j === wall.cur ? 'hidden' : 'visible';
		});
	}
	const st = (v: number) => {
		closeP();
		we = v;
		lay();
	};

	// the dark backdrop behind the carousel wears a blurred, dimmed copy of the wallpaper in focus (cross-fades as you scroll)
	function setBg() {
		if (!n) return;
		const i = cl(Math.round(E.p.x), 0, n - 1);
		const lp = wall.p[i];
		const key = i + '|' + lp.wp + '|' + lp.v;
		if (key === bgS) return;
		const first = !bgS;
		bgS = key;
		const d = document.createElement('div');
		d.className = 'wbl';
		d.style.background = bgv(lp);
		d.style.filter = STY[lp.v][1] + ' blur(11.5px) saturate(1.25) brightness(.55)';
		wbgEl.appendChild(d);
		const drop = () => {
			while (d.previousElementSibling) d.previousElementSibling.remove();
		};
		if (first || !d.animate) drop();
		else d.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 520, easing: EASE }).onfinish = drop;
	}

	// ---------- carousel <-> live screen ----------
	async function build() {
		okey = n;
		await tick(); // new cards exist after Svelte has flushed
		visAll();
		lay();
		renderE();
	}
	function live() {
		if (pos < n && pos !== wall.cur) wall.cur = pos;
		sl = 1;
		visAll();
		renderE();
	}
	export function enter() {
		if (we || host.dockEditing() || host.anyOpen()) return;
		pos = wall.cur;
		dx = 0;
		carEl.style.display = '';
		sl = 1;
		if (!rafE) {
			E.p.x = E.p.t = pos;
			E.p.v = 0;
		}
		void build();
		st(1);
	}
	function exit() {
		if (delBusy) return;
		live();
		st(0);
		flushWall();
	}
	function back() {
		pos = wall.cur;
		sl = 1;
		if (E.k.x > 0.97) {
			E.p.x = E.p.t = pos;
			E.p.v = 0;
		}
		void build();
		st(1);
	}
	function newP(k: 'col' | 'def', g0?: string) {
		let g = 'pre:' + PRESETS[0].id; // placeholder: importing a photo replaces it
		if (k === 'col') {
			if (g0) g = g0;
			else {
				const r = (Math.random() * 360) | 0;
				g = `linear-gradient(${r}deg,hsl(${r} 60% 28%),hsl(${(r + 60) % 360} 65% 45%) 55%,hsl(${(r + 130) % 360} 70% 66%))`;
			}
		}
		isNew = 1;
		prevCur = wall.cur;
		wall.p.push({ wp: g, v: 4, ck: { ...CK }, ic: { ...ICD } });
		pos = wall.p.length - 1;
		void build();
		cust();
	}
	function cust() {
		live();
		snap = JSON.stringify($state.snapshot(wall.p[wall.cur]));
		st(2);
		void tick().then(() => {
			// the outline jumps straight to the clock instead of gliding in from wherever it was last
			cboxEl.classList.add('nt');
			bw = 0;
			box();
			void cboxEl.offsetWidth;
			cboxEl.classList.remove('nt');
		});
	}
	function step(d: number) {
		const lp = wall.p[wall.cur];
		const v = cl(lp.v + d, 0, 4);
		if (v === lp.v) return;
		lp.v = v;
		sty(d);
		applied();
	}
	function sty(a: number) {
		void tick().then(() => a && snEl.animate?.([{ opacity: 0, transform: `translateX(${a * 18}px)` }, { opacity: 1, transform: 'none' }], { duration: 380, easing: EASE }));
	}

	// title cross-fade when the page changes
	let prevTitle = '';
	$effect(() => {
		const t = title;
		if (prevTitle && prevTitle !== t && we === 1) ttlEl?.animate?.([{ opacity: 0, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }], { duration: 340, easing: EASE });
		prevTitle = t;
	});
	// the page / button state follows pos and the list length
	$effect(() => {
		void pos;
		void n;
		lay();
	});

	// ---------- apply: after any style change, re-clamp the clock and re-place the outline ----------
	let bw = 0;
	let bh = 0;
	function box() {
		if (we !== 2) return;
		const tm = host.tm();
		const c = wall.p[wall.cur].ck;
		const q = 10;
		const w = Math.max(tm.offsetWidth + 2 * q, 72);
		const h = Math.max(tm.offsetHeight + 2 * q, 48);
		if (w !== bw || h !== bh) {
			bw = w;
			bh = h;
			cboxEl.style.width = w + 'px';
			cboxEl.style.height = h + 'px';
		}
		cboxEl.style.translate = `${683 + c.x - w / 2}px ${CY + c.y - h / 2}px`;
	}
	/** keep the clock on screen */
	function place() {
		const tm = host.tm();
		const c = wall.p[wall.cur].ck;
		const w = tm.offsetWidth;
		const h = tm.offsetHeight;
		c.x = cl(c.x, Math.min(0, w / 2 - 683), Math.max(0, 683 - w / 2));
		c.y = cl(c.y, Math.min(0, h / 2 - CY), Math.max(0, 768 - CY - h / 2));
		box();
		if (pop === 1 || pop === 2) anchor();
		if (pop === 6 || pop === 7) anchorD();
	}
	/** Svelte re-styles the clock on the next flush; measure after that */
	function applied() {
		void tick().then(() => {
			place();
			if (pop === 6 || pop === 7) anchorD();
		});
		save();
	}
	// the widest the clock may get before it runs off the 1366x768 screen (text width/height scale linearly with size)
	function smax() {
		const tm = host.tm();
		const c = wall.p[wall.cur].ck;
		const w = (tm.offsetWidth || 1) / c.s;
		const h = (tm.offsetHeight || 1) / c.s;
		return cl(Math.min(SMAX, 1340 / w, 740 / h), SMIN, SMAX);
	}
	function fitS() {
		const c = wall.p[wall.cur].ck;
		const m = smax();
		if (c.s > m + 0.001) c.s = m;
	}

	// ---------- popover placement: try right, left, below, above of the thing being edited and take the first spot that does not cover it ----------
	type R = { x: number; y: number; w: number; h: number };
	const ovl = (a: R, b: R) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
	const clkR = (): R => {
		const tm = host.tm();
		const c = wall.p[wall.cur].ck;
		const w = Math.max(tm.offsetWidth + 20, 72);
		const h = Math.max(tm.offsetHeight + 20, 48);
		return { x: 683 + c.x - w / 2, y: CY + c.y - h / 2, w: w + 22, h: h + 22 }; // +22: the resize handle hangs off the corner
	};
	const datB = (): R => {
		const c = wall.p[wall.cur].ck;
		const b = dbx(c);
		return { x: 683 + c.dx - b.w / 2, y: 77 + c.dy - b.h / 2, w: b.w, h: b.h };
	};
	const datR = () => (wall.p[wall.cur].ck.dh ? null : datB());
	type Spot = { k: 'r' | 'l' | 'b' | 't'; l: number; t: number; sc: number };
	function spot(Rr: R, O: R | null, H: number): Spot {
		const G = 16;
		const M = 14;
		const mx = 1366 - PW - M;
		const my = 768 - H - M;
		const ty = cl(Rr.y - 12, M, my);
		const tx = cl(Rr.x + Rr.w / 2 - PW / 2, M, mx);
		let best: Spot | null = null;
		(
			[
				['r', Rr.x + Rr.w + G, ty],
				['l', Rr.x - G - PW, ty],
				['b', tx, Rr.y + Rr.h + G],
				['t', tx, Rr.y - G - H]
			] as ['r' | 'l' | 'b' | 't', number, number][]
		).forEach(([k, l, t], i) => {
			l = cl(l, M, mx);
			t = cl(t, M, my);
			const r = { x: l, y: t, w: PW, h: H };
			const sc = ovl(r, Rr) * 10 + (O ? ovl(r, O) : 0) + i * 40;
			if (!best || sc < best.sc) best = { k, l, t, sc };
		});
		return best!;
	}
	const toPP = (sp: { k: 'r' | 'l' | 'b' | 't'; l: number; t: number }, Rr: R, H: number): PP => {
		const ay = cl(Rr.y + Rr.h / 2 - sp.t, 36, H - 36);
		const side = sp.k === 'r' || sp.k === 'l'; // beside the thing: it has an arrow, on the edge that faces it
		return {
			l: sp.l,
			t: sp.t,
			ay,
			ad: side ? 'block' : 'none',
			as: sp.k === 'l' ? 'r' : 'l',
			// the popover grows out of its arrow tip (10px outside its edge)
			ox: { r: '-10px', l: 'calc(100% + 10px)', b: '50%', t: '50%' }[sp.k],
			oy: sp.k === 'b' ? '0' : sp.k === 't' ? '100%' : `${ay}px`
		};
	};
	/** stage y of the middle of the custom-colour swatch of a popover (offsetTop is layout, so it does not move while the popover grows) */
	const swatchY = (par: HTMLElement | undefined, top: number, H: number) => {
		const sw = par?.querySelector<HTMLElement>('.sq i:last-child');
		return top + (sw ? sw.offsetTop + sw.offsetHeight / 2 : H / 2);
	};
	// The colour picker opens BESIDE the popover it came from, never on it, with its arrow on the custom-colour swatch it was opened
	// with: on the outer side if there is room, otherwise on the other one. It keeps the top of its parent. Then, as little of the
	// thing being edited as possible is covered.
	function posC(Rr: R, O: R | null) {
		if (ct === 1) return posCI();
		const par = ct === 2 ? pDel : pFel;
		const pp = ct === 2 ? pDp : pFp;
		const Hp = par?.offsetHeight || 440;
		const H = pCel?.offsetHeight || 480;
		const G = 14;
		const M = 14;
		const P: R = { x: pp.l, y: pp.t, w: PW, h: Hp };
		const t = cl(P.y, M, 768 - H - M);
		let best = { s: 'r' as 'l' | 'r', l: 0, sc: Infinity };
		(['r', 'l'] as const).forEach((s, i) => {
			const l = cl(s === 'r' ? P.x + PW + G : P.x - PW - G, M, 1366 - PW - M);
			const r = { x: l, y: t, w: PW, h: H };
			const sc = ovl(r, P) * 100 + ovl(r, Rr) * 10 + (O ? ovl(r, O) : 0) + i * 40;
			if (sc < best.sc) best = { s, l, sc };
		});
		const ay = cl(swatchY(par, P.y, Hp) - t, 36, H - 36);
		pCp = {
			l: best.l,
			t,
			ay,
			ad: 'block',
			as: best.s === 'r' ? 'l' : 'r',
			ox: best.s === 'r' ? '-10px' : 'calc(100% + 10px)',
			oy: `${ay}px`
		};
	}
	// the dock icon popover sits in the corner (right 22, bottom 80, 380 wide): its picker is the one to the left of it, same bottom
	function posCI() {
		const H = pCel?.offsetHeight || 480;
		const Hp = pIel?.offsetHeight || 330;
		const sw = pIel?.querySelector<HTMLElement>('.sq i:last-child');
		// both hang from the same line, so measure up from it: that does not change when the swatch row opens
		const fromBottom = sw ? Hp - (sw.offsetTop + sw.offsetHeight / 2) : 40;
		const ay = cl(H - fromBottom, 36, H - 36);
		pCp = { l: 0, t: 0, ay, ad: 'block', as: 'r', ox: 'calc(100% + 10px)', oy: `${ay}px` };
	}
	function anchor() {
		if (sdrag) return;
		const Rr = clkR();
		const O = datR();
		const H = pFel?.offsetHeight || 440;
		pFp = toPP(spot(Rr, O, H), Rr, H);
		posC(Rr, O);
	}
	function anchorD() {
		if (sdrag) return;
		const Rr = datB();
		const O = clkR();
		const H = pDel?.offsetHeight || 330;
		pDp = toPP(spot(Rr, O, H), Rr, H);
		posC(Rr, O);
	}
	/** keep the arrow/top in step while a row expands */
	function trk(ms: number, fn: () => void = anchor) {
		const t0 = performance.now();
		(function f() {
			fn();
			if (performance.now() - t0 < ms) requestAnimationFrame(f);
		})();
	}
	function sdEnd() {
		if (!sdrag) return;
		sdrag = 0;
		glide = true;
		if (pop === 1 || pop === 2) anchor();
		else if (pop === 6 || pop === 7) anchorD();
		glide = false;
	}

	function openF() {
		pop = 1;
		void tick().then(anchor);
		anchor();
	}
	// the colour swatch of a popover opens its picker, and closes it again when it is used once more (the popover itself stays)
	function openC() {
		if (pop === 2) {
			pop = 1;
			return;
		}
		ct = 0;
		pop = 2;
		anchor();
	}
	function openCI() {
		if (pop === 5) {
			pop = 3;
			return;
		}
		ct = 1;
		pop = 5;
		posCI();
		void tick().then(posCI);
	}
	function openD() {
		pop = 6;
		anchorD();
	}
	function openCD() {
		if (pop === 7) {
			pop = 6;
			return;
		}
		ct = 2;
		pop = 7;
		anchorD();
	}
	function openI() {
		if (we !== 2) return;
		if (pop === 3) return closeP();
		closeP();
		pop = 3;
	}
	function closeP() {
		if (pop) pop = 0;
	}

	const curC = () => (ct === 1 ? tcol(p) : ct === 2 ? dcol(p) : cc(p));
	function setC(h: string) {
		const lp = wall.p[wall.cur];
		if (ct === 1) lp.ic.c = h;
		else if (ct === 2) lp.ck.dc = h;
		else lp.ck.c = h;
		save();
	}
	const fontPopChanged = () => {
		save();
		void tick()
			.then(() => {
				fitS();
				return tick();
			})
			.then(() => {
				place();
				anchor();
			});
	};
	const datePopChanged = () => {
		applied();
		void tick().then(anchorD);
	};

	// ---------- + menu ----------
	// the open menu's size (MorphingMenu: W x H); it grows up and to the left from the corner of the 48px + button at (1262, 698)
	const PLUS_MENU = { w: 260, h: 160 };
	/** Photos asks for a picture; Colors grows the colour screen out of the menu's box */
	function pickNew(item: { id: string }) {
		if (item.id === 'photos') {
			addMode = 1;
			fiEl.click();
		} else {
			nls.openColor({ cx: 1262 + 48 - PLUS_MENU.w / 2, cy: 698 + 48 - PLUS_MENU.h / 2, w: PLUS_MENU.w, h: PLUS_MENU.h });
		}
	}
	// leaving the carousel (Customize, the live screen) takes the open menu with it
	$effect(() => {
		if (we !== 1) plusMenu?.hide();
	});

	// ---------- photo import ----------
	async function onFile() {
		const f = fiEl.files?.[0];
		fiEl.value = '';
		if (!f) {
			addMode = 0;
			return;
		}
		if (addMode) {
			addMode = 0;
			newP('def');
		}
		const lp = wall.p[wall.cur];
		try {
			const old = lp.wp;
			const wp = await importPhoto(f, {
				stillUsed: (w) => wall.p.some((q) => q.wp === w) && !junk.includes(w),
				onTooLarge: () => host.toast('Photo is too large to be saved')
			});
			lp.wp = wp;
			junk.push(old);
			save();
		} catch {
			host.toast("Couldn't load that image");
		}
	}

	// ---------- delete a lock screen: confirmation window, then the card slides up and its neighbours close the gap ----------
	// The slide is a set of Web Animations with fill: 'forwards' on the card elements. Svelte keeps the elements of the
	// cards that stay (the each block is keyed), so those animations would keep shifting them after the list has been
	// rebuilt: every card after the deleted one ended up one slot too far to the left (or right), on top of its
	// neighbour. They are cancelled in the same frame as the layout is rebuilt.
	let delAnims: Animation[] = [];
	const dropDelAnims = () => {
		for (const a of delAnims) a.cancel();
		delAnims = [];
	};
	async function delPage() {
		const i = pos;
		const cnt = wall.p.length;
		if (!del.isOpen() || delBusy || cnt < 2 || !(i >= 0 && i < cnt) || we !== 1) return; // the last lock screen can never be deleted
		delBusy = 1;
		// Nothing may move the carousel while the card leaves (new gestures are refused while delBusy is set): a gesture
		// that is already running (a second finger, a drag that was still held) is dropped here, and the carousel is
		// handed back to its spring.
		wd = null;
		E.drag = 0;
		dx = 0;
		del.close(); // the sheet flies up and out while the card does the same
		try {
			const target = wall.p[i];
			const O = 1366 * E.k.x + 30;
			const last = i === cnt - 1;
			const an = (el: Element | undefined, kf: Keyframe[], opt: KeyframeAnimationOptions) => {
				const a = el?.animate?.(kf, { fill: 'forwards', ...opt });
				if (a) delAnims.push(a);
			};
			// the card flies up and away...
			an(cards.get(target)?.el, [{ translate: '0 0', opacity: 1 }, { translate: '0 -820px', opacity: 0 }], { duration: 520, easing: 'cubic-bezier(.5,0,.75,0)' });
			// ...and the neighbours slide into the gap: the cards after it step left, or (if it was the last one) the cards before it step right
			wall.p.forEach((lp, j) => {
				if (j === i) return;
				if (last ? j < i : j > i) an(cards.get(lp)?.el, [{ translate: '0 0' }, { translate: `${last ? O : -O}px 0` }], { duration: 600, delay: 140, easing: EASE });
			});
			// Rebuild exactly when the slide has ended (a timer could fire early when frames are late), with a cap so a
			// browser that never finishes an animation cannot leave the carousel locked.
			await Promise.race([Promise.all(delAnims.map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 1200))]);
			const at = wall.p[i] === target ? i : wall.p.indexOf(target);
			if (at < 0) return; // already gone: only the clean-up below is left
			const w = wall.p[at].wp;
			const wasLast = at === wall.p.length - 1;
			wall.p.splice(at, 1);
			dropImg(w);
			pos = wasLast ? at - 1 : at;
			wall.cur = pos;
			await tick(); // Svelte has removed the card, the others have their new index
			// the slide they played is part of the layout now: drop it and place every card in this same frame, so nothing jumps
			dropDelAnims();
			E.p.x = E.p.t = pos;
			E.p.v = 0;
			visAll();
			lay();
			renderE();
			save();
		} finally {
			dropDelAnims();
			delBusy = 0;
		}
	}
	function openDelete() {
		if (we !== 1 || delBusy || pos >= n) return;
		if (n < 2) {
			host.toast('You need at least one lock screen');
			return;
		}
		const lp = wall.p[pos];
		del.open(lp);
	}
	function onDone() {
		if (we !== 2) return;
		junk.forEach(dropImg);
		junk = [];
		isNew = 0;
		snap = null;
		flushWall();
		back();
	}
	function onCancel() {
		if (we !== 2) return;
		const lp = wall.p[wall.cur];
		const w = lp.wp;
		if (isNew) {
			wall.p.pop();
			wall.cur = cl(prevCur, 0, wall.p.length - 1);
			okey = -1;
		} else if (snap) Object.assign(lp, JSON.parse(snap));
		[w, ...junk].forEach(dropImg);
		junk = [];
		isNew = 0;
		snap = null;
		back();
	}

	// ---------- gestures ----------
	// snapping: within 8 units a value locks to its target and stays locked until you pull 14 away (so it feels magnetic, not jittery)
	type Snap = { k: string; v: number; g?: number; my?: number };
	const buzz = (el: HTMLElement = cboxEl) => {
		navigator.vibrate?.(7);
		el.animate?.([{ scale: 1.016 }, { scale: 1 }], { duration: 220, easing: EASE });
	};
	type Ink = { cx: number; cy: number; w: number; h: number };
	const inkK = (): Ink => {
		const c = wall.p[wall.cur].ck;
		const z = 230 * c.s;
		return { cx: 683 + c.x, cy: CY + c.y, w: host.tm().offsetWidth || 1, h: c.st ? z * 1.56 : z * 0.72 };
	};
	const inkD = (): Ink => {
		const c = wall.p[wall.cur].ck;
		const r = document.createRange();
		r.selectNodeContents(dtNode());
		return { cx: 683 + c.dx, cy: 77 + c.dy, w: Math.max(r.getBoundingClientRect().width / host.sr().s / E.k.x, 1), h: 22 * c.ds * 0.8 };
	};
	const dtNode = () => host.tm().parentElement!.querySelector('.dt') as HTMLElement;
	function snapSets(who: 'c' | 'd', X: Ink, Y: Ink | null) {
		const c = wall.p[wall.cur].ck;
		const sx: Snap[] = [{ k: 'S', v: 0, g: 683 }];
		const sy: Snap[] = who === 'c' ? [{ k: 'S0', v: 0, g: CY }, { k: 'S1', v: 64, g: 384 }] : [{ k: 'S0', v: 0, g: 77 }, { k: 'S1', v: 307, g: 384 }];
		if (Y) {
			const G = Math.round(cl(c.s * 46, 10, 46));
			const ox = (x: number) => x - 683;
			const oX = (y: number) => (who === 'c' ? y - CY : y - 77);
			const oY = (y: number) => (who === 'c' ? y - 77 : y - CY);
			const gw = X.w + G + Y.w;
			const gh = X.h + G + Y.h;
			const yr = Y.cx + Y.w / 2;
			const yl = Y.cx - Y.w / 2;
			const yb = Y.cy + Y.h / 2;
			const yt = Y.cy - Y.h / 2;
			const a = 683 - gw / 2;
			const b = 384 - gh / 2;
			sx.push(
				{ k: 'R', v: ox(yr + G + X.w / 2), g: yr + G / 2 },
				{ k: 'L', v: ox(yl - G - X.w / 2), g: yl - G / 2 },
				{ k: 'Cx', v: ox(Y.cx), g: Y.cx },
				{ k: 'RP', v: ox(a + Y.w + G + X.w / 2), g: 683, my: ox(a + Y.w / 2) },
				{ k: 'LP', v: ox(a + X.w / 2), g: 683, my: ox(a + X.w + G + Y.w / 2) }
			);
			sy.push(
				{ k: 'Cy', v: oX(Y.cy), g: Y.cy },
				{ k: 'B', v: oX(yb + G + X.h / 2), g: yb + G / 2 },
				{ k: 'T', v: oX(yt - G - X.h / 2), g: yt - G / 2 },
				{ k: 'BP', v: oX(b + Y.h + G + X.h / 2), g: 384, my: oY(b + Y.h / 2) },
				{ k: 'TP', v: oX(b + X.h / 2), g: 384, my: oY(b + X.h + G + Y.h / 2) }
			);
		}
		return { x: sx, y: sy };
	}
	function pickS(v: number, list: Snap[], held?: string): Snap | null {
		let best: Snap | null = null;
		let bd = 1e9;
		for (const t of list) {
			const d = Math.abs(v - t.v);
			if (d < bd) {
				bd = d;
				best = t;
			}
		}
		if (held) {
			const h = list.find((t) => t.k === held);
			if (h && Math.abs(v - h.v) < 14) return h;
		}
		return bd < 8 ? best : null;
	}
	type Drag = {
		x: number; y: number; x0: number; y0: number; mv: number; sx: Snap | null; sy: Snap | null; X: Ink; Y: Ink | null; yx0: number; yy0: number;
		s0?: number; r?: boolean; bw?: number; mx?: number; ss?: boolean;
	};
	function dragSnap(s: Drag, who: 'c' | 'd', rx: number, ry: number) {
		const c = wall.p[wall.cur].ck;
		const S = snapSets(who, s.X, s.Y);
		const sx = pickS(rx, S.x, s.sx?.k);
		const sy = pickS(ry, S.y, s.sy?.k);
		if ((sx && (!s.sx || sx.k !== s.sx.k)) || (sy && (!s.sy || sy.k !== s.sy.k))) buzz(who === 'c' ? cboxEl : edtEl);
		s.sx = sx;
		s.sy = sy;
		if (s.Y) {
			// a pair-centring snap moves the other element too; leaving the snap puts it back
			const mx = sx && sx.my != null ? sx.my : s.yx0;
			const my = sy && sy.my != null ? sy.my : s.yy0;
			if (who === 'c') {
				c.dx = cl(mx, -488, 488);
				c.dy = cl(my, -49, 664);
			} else {
				c.x = mx;
				c.y = my;
			}
		}
		return { x: sx ? sx.v : rx, y: sy ? sy.v : ry };
	}
	function gset(sx: Snap | null | undefined, sy: Snap | null | undefined) {
		const a = !!sx && sx.g != null;
		const b = !!sy && sy.g != null;
		gxEl.classList.toggle('on', a);
		gyEl.classList.toggle('on', b);
		if (a) gxEl.style.translate = `${sx!.g! - 683}px 0`;
		if (b) gyEl.style.translate = `0 ${sy!.g}px`;
	}

	type Wd = { x: number; m: number; lx: number; lt: number; h: number[]; v: number; d0: number; p0: number; k0: number };
	let wd: Wd | null = null;
	let wl: ReturnType<typeof setTimeout> | null = null;
	let wp0 = { x: 0, y: 0 };
	let cm: Drag | null = null;
	let dm: Drag | null = null;
	let sw2: { x: number } | null = null;

	export function onStageDown(e: PointerEvent) {
		if (delBusy) return;
		const t = e.target as Element;
		if (del.isOpen()) {
			if (!del.contains(t)) del.close(); // a tap outside the popup = Cancel
			return;
		}
		if (nls.isOpen()) return; // the colour screen owns the stage
		if (plusMenu?.isOpen()) return; // a press while the + menu is open only closes it (the menu does that itself)
		if (we === 1) {
			if (t.closest('#cbtn,#plusm,#trash,.pop')) return;
			if (pop) return closeP();
			const d0 = (pos - E.p.x) * OFF; // grabbing a carousel that is still moving catches it exactly where it is
			wd = { x: e.clientX, m: 0, lx: e.clientX, lt: performance.now(), h: [performance.now(), e.clientX], v: 0, d0, p0: E.p.x, k0: E.k.x };
			E.drag = 1;
			E.p.v = 0;
			dx = cl(d0, -OFF, OFF);
			return;
		}
		if (we === 2) {
			if (t.closest('.pop,.pb,#cbox')) return;
			if (pop) return closeP();
			sw2 = { x: e.clientX };
			return;
		}
		if (host.dockEditing() || host.anyOpen() || !host.isWallpaper(t)) return;
		wp0 = { x: e.clientX, y: e.clientY };
		wl = setTimeout(() => {
			wl = null;
			enter();
		}, 550);
	}
	function edtDown(e: PointerEvent) {
		if (we !== 2) return;
		const c = wall.p[wall.cur].ck;
		e.stopPropagation();
		host.measure();
		dm = { x: e.clientX, y: e.clientY, x0: c.dx, y0: c.dy, mv: 0, sx: null, sy: null, X: inkD(), Y: inkK(), yx0: c.x, yy0: c.y };
		dmDown = true;
	}
	function cboxDown(e: PointerEvent) {
		if (we !== 2) return;
		const c = wall.p[wall.cur].ck;
		e.stopPropagation();
		host.measure();
		cm = {
			x: e.clientX, y: e.clientY, x0: c.x, y0: c.y, s0: c.s, r: !!(e.target as Element).closest('.rz'), bw: host.tm().offsetWidth, mx: smax(),
			mv: 0, sx: null, sy: null, ss: false, X: inkK(), Y: c.dh ? null : inkD(), yx0: c.dx, yy0: c.dy
		};
		cmDown = true;
	}

	export function onMove(e: PointerEvent) {
		if (wl && Math.hypot(e.clientX - wp0.x, e.clientY - wp0.y) > 10) {
			clearTimeout(wl);
			wl = null;
		}
		const S = host.sr();
		if (wd) {
			const t = performance.now();
			const fd = (e.clientX - wd.x) / S.s;
			const h = wd.h;
			h.push(t, e.clientX);
			while (h.length > 4 && t - h[0] > 100) h.splice(0, 2);
			const hd = t - h[0];
			wd.v = hd > 4 ? (e.clientX - h[1]) / S.s / hd : wd.v;
			wd.lx = e.clientX;
			wd.lt = t;
			let d = fd + wd.d0;
			if ((pos === 0 && d > 0) || (pos === n && d < 0)) d *= 0.3;
			dx = cl(d, -OFF, OFF);
			if (Math.abs(fd) > 6) wd.m = 1;
			E.p.x = pos - dx / OFF;
			E.p.v = 0;
			fr(renderE);
		}
		if (dm) {
			if (Math.hypot(e.clientX - dm.x, e.clientY - dm.y) > 6) dm.mv = 1;
			if (!dm.mv) return;
			const c = wall.p[wall.cur].ck;
			const u = kk * S.s;
			const rx = cl(dm.x0 + (e.clientX - dm.x) / u, -488, 488);
			const ry = cl(dm.y0 + (e.clientY - dm.y) / u, -49, 664);
			const r = dragSnap(dm, 'd', rx, ry);
			c.dx = cl(r.x, -488, 488);
			c.dy = cl(r.y, -49, 664);
			gset(dm.sx, dm.sy);
			fr(() => {
				place();
				if (pop === 6 || pop === 7) anchorD();
			});
			return;
		}
		if (cm) {
			if (Math.hypot(e.clientX - cm.x, e.clientY - cm.y) > 6) cm.mv = 1;
			if (!cm.mv) return;
			const c = wall.p[wall.cur].ck;
			const u = kk * S.s;
			const a = (e.clientX - cm.x) / u; // client px -> stage units
			const b = (e.clientY - cm.y) / u;
			if (cm.r) {
				let z = cl(cm.s0! * (cm.bw! + 2 * a) / cm.bw!, SMIN, Math.max(cm.mx!, cm.s0!));
				const on = Math.abs(z - 1) < (cm.ss ? 0.045 : 0.03);
				if (on !== cm.ss) {
					cm.ss = on;
					if (on) buzz();
				}
				if (on) z = 1;
				c.s = z;
				fr(() => void tick().then(place));
			} else {
				const rx = cm.x0 + a;
				const ry = cm.y0 + b;
				const r = dragSnap(cm, 'c', rx, ry);
				c.x = r.x;
				c.y = r.y;
				gset(cm.sx, cm.sy);
				fr(() => {
					place();
					if (pop === 6 || pop === 7) anchorD();
				});
			}
		}
	}

	export function onUp(e: PointerEvent | null, cancel = false) {
		sdEnd();
		if (wl) {
			clearTimeout(wl);
			wl = null;
		}
		if (cm) {
			const tap = !cm.mv && !cm.r && !cancel;
			cm = null;
			cmDown = false;
			gset(null, null);
			save();
			if (tap) {
				if (pop === 1 || pop === 2) closeP();
				else openF();
			}
		}
		if (dm) {
			const tap = !dm.mv && !cancel;
			dm = null;
			dmDown = false;
			gset(null, null);
			save();
			if (tap) {
				if (pop === 6 || pop === 7) closeP();
				else openD();
			}
		}
		if (sw2) {
			const d = e ? (e.clientX - sw2.x) / host.sr().s : 0;
			sw2 = null;
			if (!cancel && Math.abs(d) > 60) step(d < 0 ? 1 : -1);
		}
		if (!wd) return;
		const w = wd;
		const S = host.sr();
		const x = e ? (e.clientX - S.left) / S.s : 683;
		wd = null;
		E.drag = 0;
		if (cancel) {
			dx = 0;
			lay();
			visAll();
			return;
		}
		const v = performance.now() - w.lt > 90 ? 0 : w.v; // a finger that stopped before lifting is not a fling
		if (!w.m) {
			if (Math.abs(w.d0) > 24) {
				// the touch caught a moving carousel: a tap on a card flies straight into it
				const O = 1366 * w.k0 + 30;
				const hw = (1366 * w.k0) / 2;
				let j = -1;
				let bd = 1e9;
				for (let i = 0; i <= n; i++) {
					const dd = Math.abs(x - 683 - (i - w.p0) * O);
					if (dd < hw && dd < bd) {
						bd = dd;
						j = i;
					}
				}
				dx = 0;
				if (j < 0) {
					lay();
					return;
				}
				pos = j;
				if (j === n) {
					lay();
					visAll();
					plusMenu.show();
					return;
				}
				E.p.v = 0;
				exit();
				return;
			}
			const d = Math.abs(x - 683) < (1366 * kk) / 2 ? 0 : Math.sign(x - 683);
			if (d) pos = cl(pos + d, 0, n);
			else if (pos === n) {
				dx = 0;
				lay();
				plusMenu.show();
				return;
			} else {
				dx = 0;
				exit();
				return;
			}
		} else {
			if (Math.abs(dx) > OFF * 0.22 || Math.abs(v) > 0.45) pos = cl(pos + (dx + v * 120 < 0 ? 1 : -1), 0, n);
			E.p.v = (-v * 1000) / OFF; // hand the finger's velocity to the spring
		}
		dx = 0;
		lay();
		visAll();
	}

	/** Escape handling; returns true when the editor used the key */
	export function onKey(e: KeyboardEvent): boolean {
		if (e.key !== 'Escape') return false;
		if (del?.isOpen()) {
			del.close();
			return true;
		}
		if (nls?.isOpen()) {
			nls.close();
			return true;
		}
		if (plusMenu?.isOpen()) {
			plusMenu.hide();
			return true;
		}
		if (pop) {
			closeP();
			return true;
		}
		if (we === 2) {
			onCancel();
			return true;
		}
		if (we === 1) {
			exit();
			return true;
		}
		return false;
	}
	export const isActive = () => we !== 0;

	// ---------- lifecycle ----------
	onMount(() => {
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(CSS as any).registerProperty({ name: '--nx', syntax: '<number>', inherits: false, initialValue: '1' });
		} catch {
			/* already registered */
		}
		// the live screen's selection outline lives inside it, so it scales with it
		host.scr().appendChild(cboxEl);
		const fonts = () => {
			if (we === 2) fitS();
			void tick().then(place);
		};
		document.fonts?.addEventListener?.('loadingdone', fonts);
		carEl.style.display = 'none';
		const lowP = (ev: PointerEvent) => {
			if ((ev.target as Element).closest?.('.pop .slw')) sdrag = 1;
		};
		addEventListener('pointerdown', lowP, true);
		return () => {
			document.fonts?.removeEventListener?.('loadingdone', fonts);
			removeEventListener('pointerdown', lowP, true);
			cancelAnimationFrame(rafE);
			cboxEl.remove();
			if (wl) clearTimeout(wl);
		};
	});
</script>

<div id="wbg" bind:this={wbgEl}></div>
<div id="wv1" bind:this={wvEl}>
	<div id="ttl" bind:this={ttlEl}>{title}</div>
	<div id="pgd">
		{#each { length: n + 1 } as _, i}<i class:on={i === pos}></i>{/each}
	</div>
	<!-- The three divs stay as positioning / fade / disabled-state wrappers; the look and the press physics are PressButton's.
	     `inert` keeps an invisible (nx) button out of the tab order. -->
	<div id="cbtn" class:nx={pos >= n} inert={pos >= n}>
		<PressButton
			width={183}
			glass
			label="Customize"
			onpress={() => {
				if (we === 1 && !delBusy && pos < n) cust();
			}}
		>
			<span class="pbt-label">Customize</span>
		</PressButton>
	</div>
	<div id="trash" class:nx={pos >= n} class:dis={n < 2} inert={pos >= n}>
		<PressButton width={48} glass label="Delete lock screen" onpress={openDelete}>
			<svg class="pbt-ico" viewBox="0 0 24 24">
				<path d="M4 7h16" />
				<path d="M9.5 7V5.3A1.3 1.3 0 0 1 10.8 4h2.4a1.3 1.3 0 0 1 1.3 1.3V7" />
				<path d="M6 7l.8 11.2A2 2 0 0 0 8.8 20h6.4a2 2 0 0 0 2-1.8L18 7" />
				<path d="M10 11v5.2M14 11v5.2" />
			</svg>
		</PressButton>
	</div>
</div>

<!-- The + button is the morphing menu. It sits in its own layer ABOVE the cards (#wv1 is behind the live screen and the carousel, and the
     menu grows up over them). Same box as the old #plus wrapper (48 x 48 at 1262 / 698) and the same fade (--f). Escape is closed by onKey. -->
<div id="plusm" bind:this={plusEl}>
	<MorphingMenu
		bind:this={plusMenu}
		title="New Lock Screen"
		icon="plus"
		glass
		escape={false}
		canOpen={() => we === 1 && !delBusy}
		onselect={pickNew}
	/>
</div>

<div id="car" bind:this={carEl}>
	{#each wall.p as lp (lp)}
		<div class="cd" use:card={lp}>
			<div class="cw" style:background={bgv(lp)} style:filter={STY[lp.v][1]} style:transform={crop(lp) || undefined}></div>
			<div class="cc"><i style={dateCss(lp)}>{date}</i><span style={clockCss(lp)}>{fmtN(time, lp.ck)}</span></div>
			<div class="dm"></div>
		</div>
	{/each}
	<div class="cd add" bind:this={addEl}>
		<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width=".8" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
		<div class="dm"></div>
	</div>
</div>

<div id="wui">
	<div id="ec" bind:this={ecEl}>
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<b id="ecn" class="pb" use:pressPhysics onclick={onCancel}><span data-press-label>Cancel</span></b>
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<b id="edn" class="pb" use:pressPhysics onclick={onDone}><span data-press-label>Done</span></b>
		<i id="gx" bind:this={gxEl}></i>
		<i id="gy" bind:this={gyEl}></i>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			id="edt"
			class="ln"
			class:hid={!!p.ck.dh}
			class:rs={dmDown}
			bind:this={edtEl}
			style:--dxo="{p.ck.dx}px"
			style:--dyo="{p.ck.dy}px"
			style:--dw="{dbox.w}px"
			style:--dh="{dbox.h}px"
			onpointerdown={edtDown}
		></div>
		<div id="sn" bind:this={snEl}>{styleName}</div>
		<div id="sdt">
			{#each STY as _, i}<i class:on={i === p.v}></i>{/each}
		</div>
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div id="abtn" class="pb" onclick={openI}><Icon name="ap" /></div>
	</div>
</div>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div id="cbox" class="ln" class:rs={cmDown} bind:this={cboxEl} onpointerdown={cboxDown}>
	<i class="rz"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M8 20L20 8M13 20L20 13" /></svg></i>
</div>

<Popover id="pF" on={pop === 1 || pop === 2} left={pFp.l} top={pFp.t} ay={pFp.ay} ad={pFp.ad} aside={pFp.as} ox={pFp.ox} oy={pFp.oy} {glide} bind:el={pFel}>
	<FontPopover
		changed={fontPopChanged}
		fontChanged={() => host.tm().animate?.([{ opacity: 0.2, scale: 0.97 }, { opacity: 1, scale: 1 }], { duration: 320, easing: EASE })}
		openColor={openC}
		track={() => trk(500)}
	/>
</Popover>
<Popover
	id="pC"
	on={pop === 2 || pop === 5 || pop === 7}
	left={ct === 1 ? undefined : pCp.l}
	top={ct === 1 ? undefined : pCp.t}
	right={ct === 1 ? 22 + 380 + 14 : undefined}
	bottom={ct === 1 ? 80 : undefined}
	ay={pCp.ay}
	ad={pCp.ad}
	aside={pCp.as}
	ox={pCp.ox}
	oy={pCp.oy}
	{glide}
	bind:el={pCel}
>
	<div class="ph">
		<span style="width:28px"></span>
		<b>Colors</b><span style="width:28px"></span>
	</div>
	<ColorPicker color={curC()} onpick={setC} bind:tab={ctab} />
</Popover>
<Popover id="pI" on={pop === 3 || pop === 5} na right={22} bottom={80} width={380} ox="100%" oy="100%" bind:el={pIel}>
	<IconPopover changed={applied} openColor={openCI} track={() => {}} />
</Popover>
<Popover id="pD" on={pop === 6 || pop === 7} left={pDp.l} top={pDp.t} ay={pDp.ay} ad={pDp.ad} aside={pDp.as} ox={pDp.ox} oy={pDp.oy} {glide} bind:el={pDel}>
	<DatePopover changed={datePopChanged} openColor={openCD} track={() => trk(500, anchorD)} />
</Popover>

<NewLockScreen
	bind:this={nls}
	{we}
	ek={() => E.k.x}
	{time}
	{date}
	onadd={(g) => newP('col', g)}
	locked={() => !!delBusy}
/>
<DeleteSheet bind:this={del} {we} {time} {date} onconfirm={delPage} locked={() => !!delBusy} />
<input type="file" accept="image/*" hidden bind:this={fiEl} onchange={onFile} />
