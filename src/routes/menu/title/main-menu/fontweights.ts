import { FT } from './lockscreen.svelte';

// Which weights does a clock font REALLY have on this machine?
//
// FT only says what range we would like (e.g. sf: 100-900). What the browser draws depends on the faces behind the
// font stack: a variable font moves smoothly, a static family only has a few files, and a font that is not installed
// falls back to some system font. The only reliable answer is to draw it and compare, which is what this does,
// once per font, on a scratch canvas.
//
// Two details matter, and the first version of this file got both wrong:
//  1. The canvas must be attached to the page with `font-synthesis: none`, like the clock. A detached canvas fakes
//     bold for weights >= 600 on a single-face font, so every such font looked like it had two weights
//     (the "300 / 700" jumps) while the real clock never changed.
//  2. A variable font whose axis is narrower than the slider (say 400-700) is smooth, but only between 400 and 700.
//     So smoothness is checked at every in-between weight (150, 250, ...), not at one spot.

export interface WeightInfo {
	/** the weight axis is continuous (a variable font): in-between values draw differently */
	smooth: boolean;
	/** static font: one weight per distinct look it can draw. Fewer than 2 entries means there is nothing to change. */
	steps: number[];
}

const SAMPLE = '12:30';
const CW = 420;
const CH = 72;
const FULL = [100, 200, 300, 400, 500, 600, 700, 800, 900];

let ctx: CanvasRenderingContext2D | null | undefined;

function context() {
	if (ctx !== undefined) return ctx;
	const cv = document.createElement('canvas');
	cv.width = CW;
	cv.height = CH;
	// off-screen but in the document, so it uses the page's font rules instead of a detached canvas's defaults
	cv.style.cssText = 'position:fixed;left:-10000px;top:0;pointer-events:none;visibility:hidden;font-synthesis:none';
	document.body.appendChild(cv);
	ctx = cv.getContext('2d', { willReadFrequently: true });
	if (ctx) ctx.textBaseline = 'top';
	return ctx;
}

/** a cheap fingerprint of what was drawn; two weights that look the same give the same string */
const draw = (c: CanvasRenderingContext2D, stack: string, w: number) => {
	c.clearRect(0, 0, CW, CH);
	c.font = `${w} 56px ${stack}`;
	c.fillText(SAMPLE, 4, 4);
	const d = c.getImageData(0, 0, CW, CH).data;
	let h1 = 0;
	let h2 = 0;
	let n = 0;
	for (let i = 3; i < d.length; i += 4) {
		const a = d[i];
		h1 = (Math.imul(h1, 31) + a) | 0;
		h2 = (Math.imul(h2 ^ a, 16777619) + 7) | 0;
		n += a;
	}
	return `${h1}:${h2}:${n}`;
};

async function probe(key: string): Promise<WeightInfo> {
	const [stack, , lo, hi] = FT[key];
	const full = FULL.filter((w) => w >= lo && w <= hi);
	if (full.length < 2) return { smooth: false, steps: [lo] };

	const c = context();
	if (!c) return { smooth: true, steps: [] }; // cannot probe: keep the plain slider

	// in-between weights, halfway to the next hundred; all of them are only drawn if a font could use them
	const half = full.slice(0, -1).map((w) => w + 50);
	const all = [...full, ...half];

	// web fonts only load when asked: make sure every face that could apply is in before drawing
	await Promise.all(all.map((w) => document.fonts.load(`${w} 56px ${stack}`, SAMPLE).catch(() => [])));

	const img = new Map<number, string>();
	for (const w of all) img.set(w, draw(c, stack, w));

	// Static fonts map 450 onto the 400 or the 500 face, so 450 looks like one of its neighbours. Only a variable
	// font draws something different from both.
	for (let i = 0; i < half.length; i++) {
		const m = img.get(half[i])!;
		if (m !== img.get(full[i]) && m !== img.get(full[i + 1])) return { smooth: true, steps: [] };
	}

	// static faces: runs of weights that draw the same are one step
	const groups: number[][] = [];
	full.forEach((w, i) => {
		if (i && img.get(w) === img.get(full[i - 1])) groups[groups.length - 1].push(w);
		else groups.push([w]);
	});
	const steps = groups.map((g, i) => {
		// the lowest run is served by its heaviest weight, the highest run by its lightest, so the number shown is
		// the weight of the face the browser really picked
		if (groups.length > 1 && i === 0) return g[g.length - 1];
		if (groups.length > 1 && i === groups.length - 1) return g[0];
		return g[(g.length - 1) >> 1];
	});
	return { smooth: false, steps };
}

const cache = new Map<string, Promise<WeightInfo>>();

/** cached per font key; on any failure it resolves to the old behaviour (a plain smooth slider) */
export function weightInfo(key: string): Promise<WeightInfo> {
	let p = cache.get(key);
	if (!p) {
		p = probe(key).catch(() => ({ smooth: true, steps: [] }));
		cache.set(key, p);
	}
	return p;
}
