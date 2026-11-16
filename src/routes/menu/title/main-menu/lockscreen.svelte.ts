// Lock-screen data model: wallpaper, clock style, date style, icon tint. Same shape and storage keys
// as the prototype ('lb.wall', 'lb.img.<id>'), so saved data keeps working and the editor can be ported on top.

import { PRESETS, presetUrl } from './wallpapers';
import { LB } from './bridge';
import { cl } from './launcher';

export interface ClockStyle {
	f: string; // font key, see FT
	w: number; // weight
	c: string; // colour: 'auto' or #rrggbb
	o: number; // opacity
	st: 0 | 1; // stacked (hours over minutes)
	x: number;
	y: number;
	s: number; // size multiplier
	dx: number; // date offset
	dy: number;
	ds: number; // date size multiplier
	dc: string; // date colour: 'auto' or #rrggbb
	dh: 0 | 1; // date hidden
}
export interface IconStyle {
	m: 'def' | 'tnt'; // default plates or tinted
	a: 'd' | 'l'; // dark or light
	c: string; // tint: 'auto' or #rrggbb
}
export interface LockScreen {
	wp: string; // 'pre:<id>' (built-in, see wallpapers.ts) | 'img:<id>' | any CSS background
	v: number; // wallpaper style index into STY
	ck: ClockStyle;
	ic: IconStyle;
}
export interface WallState {
	p: LockScreen[];
	cur: number;
	ic: IconStyle;
	fav: string[];
}

/**
 * Clock fonts. key: [css stack, default weight, min weight, max weight].
 *
 * Every entry is a VARIABLE font that the theme ships itself (src/fonts.ts, the @fontsource-variable packages, all SIL OFL),
 * so each one really draws every weight in its range, on every machine. The stacks name only that family, then a plain
 * generic fallback: no font that has to be installed, and nothing from Apple (no SF Pro / SF Rounded / SF Mono / New York).
 * The min / max are the axis range of the shipped file (check them when you change a family).
 */
export const FT: Record<string, [string, number, number, number]> = {
	sans: ['"Inter Variable",Inter,sans-serif', 200, 100, 900],
	cond: ['"Oswald Variable",Oswald,sans-serif', 500, 200, 700],
	rounded: ['"Nunito Variable",Nunito,sans-serif', 300, 200, 900],
	serif: ['"Source Serif 4 Variable","Source Serif 4",Georgia,serif', 300, 200, 900],
	mono: ['"JetBrains Mono Variable","JetBrains Mono",Consolas,monospace', 200, 100, 800],
	geo: ['"Outfit Variable",Outfit,sans-serif', 200, 100, 900],
	wide: ['"Unbounded Variable",Unbounded,sans-serif', 300, 200, 900],
	tall: ['"Big Shoulders Display Variable","Big Shoulders Display",sans-serif', 400, 100, 900],
	soft: ['"Fraunces Variable",Fraunces,Georgia,serif', 300, 100, 900],
	tech: ['"Orbitron Variable",Orbitron,sans-serif', 500, 400, 900],
	grot: ['"Space Grotesk Variable","Space Grotesk",sans-serif', 300, 300, 700],
	slab: ['"Roboto Slab Variable","Roboto Slab",Georgia,serif', 300, 100, 900],
	hand: ['"Caveat Variable",Caveat,cursive', 500, 400, 700],
	narrow: ['"Antonio Variable",Antonio,sans-serif', 400, 100, 700],
	script: ['"Dancing Script Variable","Dancing Script",cursive', 500, 400, 700]
};

/** font keys that were renamed or replaced; saved lock screens that still use one of the old keys are moved over */
const FT_LEGACY: Record<string, string> = { sf: 'sans', bebas: 'narrow' };

/** wallpaper styles: [name, css filter, "auto" clock tint] */
export const STY: [string, string, string][] = [
	['Ember', 'hue-rotate(-50deg) saturate(1.25)', '#ffc7a3'],
	['Shadow', 'hue-rotate(160deg) brightness(.62) saturate(1.4)', '#9db4ff'],
	['Haze', 'saturate(.45) brightness(1.18)', '#f3eeff'],
	['Mono', 'grayscale(1) contrast(1.1)', '#ffffff'],
	['Dusk', 'brightness(1)', '#c4a9ff']
];

/** colour swatches shared by the clock, date and icon popovers ('auto' follows the wallpaper, 'custom' opens the picker) */
export const CS = ['auto', '#ffffff', '#7be7ff', '#a5b8ff', '#d7bcff', '#e57bff', '#ffa3b5', '#ffcba3', '#ffe38f', '#eef7a6', '#b6ecab', 'custom'];
export const FN: Record<string, string> = {
	sans: 'Sans', cond: 'Cond', rounded: 'Round', serif: 'Serif', mono: 'Mono', geo: 'Geo', wide: 'Wide', tall: 'Tall',
	soft: 'Soft', tech: 'Tech', grot: 'Grot', slab: 'Slab', hand: 'Hand', narrow: 'Narrow', script: 'Script'
};
/** the clock rests 64px above the stage centre */
export const CY = 320;
export const SMIN = 0.05;
export const SMAX = 2.4;

export const CK: ClockStyle = { f: 'sans', w: 200, c: 'auto', o: 0.9, st: 0, x: 0, y: 0, s: 1, dx: 0, dy: 0, ds: 1, dc: 'auto', dh: 0 };
export const ICD: IconStyle = { m: 'def', a: 'd', c: '#0a84ff' };
/** a fresh lock screen from a built-in preset (wallpaper + its clock / date / icon settings) */
export const presetScreen = (id: string): LockScreen => {
	const p = PRESETS.find((x) => x.id === id) ?? PRESETS[0];
	return { wp: 'pre:' + p.id, v: p.v ?? 4, ck: { ...CK, ...p.ck }, ic: { ...ICD, ...p.ic } };
};
/** the 6 built-in presets are the defaults */
export const DEFP = (): LockScreen[] => PRESETS.map((p) => presetScreen(p.id));

// ---------- stored photos: base64 in storage -> a short blob: URL, created once ----------
const IMG: Record<string, string> = {};
const b64u = (b64: string, type: string) => {
	try {
		const s = atob(b64);
		const u = new Uint8Array(s.length);
		for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
		return URL.createObjectURL(new Blob([u], { type }));
	} catch {
		return `data:${type};base64,${b64}`;
	}
};
const durl = (d: string | null | undefined) => {
	const m = /^data:([^;,]+);base64,(.*)$/s.exec(d || '');
	return m ? b64u(m[2], m[1]) : '';
};
const imgUrl = (id: string) => IMG[id] || (IMG[id] = durl(LB.storage.get<string>('lb.img.' + id)));

function load(): WallState {
	const saved = LB.storage.get<Partial<WallState>>('lb.wall') || {};
	const W = { p: DEFP(), cur: 0, ic: { ...ICD }, fav: [] as string[], ...saved } as WallState;
	if (!Array.isArray(W.p) || !W.p.length) W.p = DEFP();
	if (!Array.isArray(W.fav)) W.fav = [];
	// the favourites are a keyed list in the colour picker: a duplicate in what was saved (older build, hand-edited storage) would break it
	else W.fav = [...new Set(W.fav.filter((x) => typeof x === 'string'))];
	let migrated = false;
	W.p = W.p.map((p0, i) => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const p: any = p0 || {};
		let w: string = typeof p.wp === 'string' ? p.wp : 'def';
		// legacy inline photos move out of the main save
		const m = /^url\(["']?(data:[^"')]+)["']?\)/.exec(w);
		if (m) {
			const id = 'm' + Date.now().toString(36) + i;
			if (LB.storage.set('lb.img.' + id, m[1])) {
				IMG[id] = durl(m[1]);
				w = 'img:' + id;
				migrated = true;
			}
		}
		// the old built-in wallpaper, or a preset that no longer exists, becomes the first preset
		if (w === 'def' || (w.startsWith('pre:') && !presetUrl(w.slice(4)))) w = 'pre:' + PRESETS[0].id;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const c: any = { ...CK, ...p.ck };
		delete c.fx;
		delete c.n; // the Arabic-Indic numerals option is gone
		c.f = FT_LEGACY[c.f] ?? c.f;
		if (!FT[c.f]) c.f = 'sans';
		c.o = cl(+c.o || CK.o, 0.15, 1);
		c.s = cl(+c.s || 1, SMIN, SMAX);
		c.dx = cl(+c.dx || 0, -488, 488);
		c.dy = cl(+c.dy || 0, -49, 664);
		c.w = cl(+c.w || CK.w, FT[c.f][2], FT[c.f][3]);
		c.ds = cl(+c.ds || 1, 0.4, 2.5);
		if (typeof c.dc !== 'string') c.dc = 'auto';
		c.dh = c.dh ? 1 : 0;
		const ic: IconStyle = { ...ICD, ...(p.ic || W.ic) };
		if (ic.m !== 'tnt') ic.m = 'def';
		if (ic.a !== 'l') ic.a = 'd';
		return { wp: w, v: Number.isInteger(p.v) && p.v >= 0 && p.v < 5 ? p.v : 4, ck: c as ClockStyle, ic };
	});
	if (!(W.cur >= 0 && W.cur < W.p.length)) W.cur = 0;
	if (migrated) LB.storage.set('lb.wall', W);
	return W;
}

/** Reactive lock-screen state. Read-only in the main menu; an editor would mutate it and call save(). */
export const wall = $state<WallState>(load());

/**
 * Re-read the saved lock screens. This module is evaluated at app start, before the client's persistent storage has
 * been copied into localStorage, so the menu calls this each time it mounts.
 */
export function reloadWall() {
	Object.assign(wall, load());
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
export const save = () => {
	clearTimeout(saveTimer);
	saveTimer = setTimeout(() => LB.storage.set('lb.wall', $state.snapshot(wall)), 250);
};

// ---------- derived presentation ----------
export const rg = (h: string, a: number) => {
	const n = parseInt(h.slice(1), 16);
	return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};
export const lum = (h: string) => {
	const n = parseInt(h.slice(1), 16);
	return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};

/** 'auto' is white */
const auto = (_p: LockScreen) => '#ffffff';
export const cc = (p: LockScreen) => (p.ck.c === 'auto' ? auto(p) : p.ck.c);
export const dcol = (p: LockScreen) => (p.ck.dc === 'auto' ? cc(p) : p.ck.dc);
export const tcol = (p: LockScreen) => (p.ic.c === 'auto' ? auto(p) : p.ic.c);

export const bgv = (p: LockScreen) =>
	(p.wp.startsWith('pre:')
		? `url("${presetUrl(p.wp.slice(4)) ?? ''}")`
		: p.wp.startsWith('img:')
			? `url("${imgUrl(p.wp.slice(4))}")`
			: p.wp) + ' center/cover';

/** no wallpaper re-crops itself any more (that was only for the old built-in photo); kept so callers stay as they are */
export const crop = (_p: LockScreen) => '';

export const fmtN = (s: string, c: ClockStyle) => (c.st ? s.replace(':', '\n') : s);

export const clockCss = (p: LockScreen) => {
	const c = p.ck;
	const f = FT[c.f];
	const z = 230 * c.s;
	return (
		`font-family:${f[0]};font-weight:${cl(c.w, f[2], f[3])};font-size:${z}px;letter-spacing:${-0.026 * z}px;` +
		`line-height:${c.st ? 0.84 : 1};translate:${c.x - 0.013 * z}px ${c.y}px;color:${rg(cc(p), c.o)};` +
		`text-shadow:0 4px 40px rgba(0,0,0,.18)`
	);
};

export const dateCss = (p: LockScreen) => {
	const c = p.ck;
	const z = 22 * c.ds;
	return (
		`color:${rg(dcol(p), Math.min(1, 0.5 + 0.5 * c.o))};font-size:${z}px;line-height:${z}px;` +
		`translate:${c.dx}px ${c.dy - 11 * (c.ds - 1)}px;${c.dh ? 'display:none;' : ''}`
	);
};

// ---------- editor helpers ----------
export const kindOf = (p: LockScreen) => (p.wp.startsWith('pre:') ? 'Wallpaper' : p.wp.startsWith('img:') ? 'Photo' : 'Color');
export const vname = (p: LockScreen) => (p.v === 4 ? 'Natural' : STY[p.v][0]);
/** the date's selection outline */
export const dbx = (c: ClockStyle) => ({ w: cl(390 * c.ds, 170, 1000), h: Math.max(30, 22 * c.ds + 17) });

export const flushWall = () => {
	clearTimeout(saveTimer);
	LB.storage.set('lb.wall', $state.snapshot(wall));
};

/** forget a stored photo once no lock screen uses it any more */
export function dropImg(w: unknown) {
	if (typeof w !== 'string' || !w.startsWith('img:') || wall.p.some((p) => p.wp === w)) return;
	const id = w.slice(4);
	if (IMG[id]) {
		URL.revokeObjectURL(IMG[id]);
		delete IMG[id];
	}
	LB.storage.del('lb.img.' + id);
}

/**
 * Photo import: decode off-thread, downscale, keep the working copy as a blob: URL and persist the
 * data: copy separately and asynchronously. Resolves to the new wallpaper value ('img:<id>').
 */
export async function importPhoto(f: File, opts: { stillUsed(wp: string): boolean; onTooLarge(): void }): Promise<string> {
	const bm = await createImageBitmap(f);
	const r = Math.min(1, 3840 / Math.max(bm.width, bm.height));
	const c = document.createElement('canvas');
	c.width = Math.round(bm.width * r);
	c.height = Math.round(bm.height * r);
	c.getContext('2d')!.drawImage(bm, 0, 0, c.width, c.height);
	bm.close?.();
	const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.82));
	if (!blob) throw new Error('encode failed');
	const id = 'p' + Date.now().toString(36);
	IMG[id] = URL.createObjectURL(blob);
	const wp = 'img:' + id;
	const rd = new FileReader();
	rd.onload = () => {
		if (!opts.stillUsed(wp)) {
			URL.revokeObjectURL(IMG[id]);
			delete IMG[id];
			return;
		}
		if (!LB.storage.set('lb.img.' + id, rd.result)) opts.onTooLarge();
	};
	rd.readAsDataURL(blob);
	return wp;
}
