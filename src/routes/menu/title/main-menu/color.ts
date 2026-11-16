import { cl } from './launcher';

export const h2r = (h: string): [number, number, number] => {
	const n = parseInt(h.slice(1), 16);
	return [n >> 16, (n >> 8) & 255, n & 255];
};
export const r2h = (r: number, g: number, b: number) =>
	'#' + [r, g, b].map((v) => cl(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');

/** rgb 0-255 -> [hue 0-360, saturation 0-1, value 0-1] */
export const r2s = (r: number, g: number, b: number): [number, number, number] => {
	r /= 255;
	g /= 255;
	b /= 255;
	const M = Math.max(r, g, b);
	const d = M - Math.min(r, g, b);
	let h = 0;
	if (d) h = M === r ? ((g - b) / d + 6) % 6 : M === g ? (b - r) / d + 2 : (r - g) / d + 4;
	return [h * 60, M ? d / M : 0, M];
};
export const hsv = (h: number, s: number, v: number) => {
	const f = (n: number) => {
		const k = (n + h / 60) % 6;
		return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255;
	};
	return r2h(f(5), f(3), f(1));
};
export const hl = (h: number, s: number, l: number) => {
	const a = s * Math.min(l, 1 - l);
	const f = (n: number) => {
		const k = (n + h / 30) % 12;
		return (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255;
	};
	return r2h(f(0), f(8), f(4));
};
/** the Grid tab: 12 greys then 9 rows of 12 hues */
export const GD: string[] = (() => {
	const a: string[] = [];
	for (let i = 0; i < 12; i++) a.push(hl(0, 0, 1 - i / 11));
	for (let r = 0; r < 9; r++) for (let i = 0; i < 12; i++) a.push(hl(i * 30, 0.9, 0.92 - r * 0.095));
	return a;
})();
/** a slider track running one channel from 0 to 255 */
export const g3 = (rgb: number[], i: number) => {
	const m = (x: number) => {
		const a = [...rgb];
		a[i] = x;
		return `rgb(${a})`;
	};
	return `linear-gradient(90deg,${m(0)},${m(255)})`;
};
