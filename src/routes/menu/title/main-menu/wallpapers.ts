// The 6 built-in lock screens. Order = carousel order on a fresh install.
// Each entry is a ready-made lock screen: the wallpaper plus its clock / date / icon settings
// (only what differs from CK / ICD in lockscreen.svelte.ts is listed).
// Type-only import on purpose: lockscreen.svelte.ts imports this file, so no runtime import back.
import type { ClockStyle, IconStyle } from './lockscreen.svelte';

import graphite from '../../../../assets/wallpapers/graphite.jpg?inline';
import lumen from '../../../../assets/wallpapers/lumen.jpg?inline';
import crater from '../../../../assets/wallpapers/crater.jpg?inline';
import moonlight from '../../../../assets/wallpapers/moonlight.jpg?inline';
import glade from '../../../../assets/wallpapers/glade.jpg?inline';
import starfall from '../../../../assets/wallpapers/starfall.jpg?inline';

export interface Preset {
	id: string;
	name: string;
	url: string;
	v?: number; // wallpaper style (STY index), 4 = natural
	ck: Partial<ClockStyle>;
	ic: Partial<IconStyle>;
}

export const PRESETS: Preset[] = [
	{
		id: 'graphite', name: 'Graphite', url: graphite, // grey swirl
		ck: { w: 330, c: '#b8b8b8', y: -186.99, s: 0.36, dy: 2.82, ds: 0.68, dc: '#a3a3a3' },
		ic: {}
	},
	{
		id: 'lumen', name: 'Lumen', url: lumen, // warm light
		ck: { f: 'tall', w: 250, c: '#fdfdd8', o: 1, st: 1, y: -64.11, s: 0.74, dh: 1 },
		ic: { m: 'tnt', a: 'l', c: '#fdfdd8' }
	},
	{
		id: 'crater', name: 'Crater', url: crater, // lake
		ck: { f: 'hand', w: 700, c: '#b2fffb', x: -27.75, dy: 172.17 },
		ic: { a: 'l' }
	},
	{
		id: 'moonlight', name: 'Moonlight', url: moonlight, // watercolor trees
		ck: { f: 'script', w: 640, c: '#005e4b', o: 1, y: -70.47, dy: 97.94, dh: 1 },
		ic: { m: 'tnt', c: '#b6ecab' }
	},
	{
		id: 'glade', name: 'Glade', url: glade, // fox and dragon scene
		ck: { f: 'soft', w: 900, c: '#005868', o: 1, y: -184.98, s: 0.74, dh: 1 },
		ic: { m: 'tnt', a: 'l', c: '#005868' }
	},
	{
		id: 'starfall', name: 'Starfall', url: starfall, // gold wave
		ck: { f: 'tech', w: 400, c: '#fffcd8', o: 0.85, y: -144.69, s: 0.69, dy: 196.62 },
		ic: {}
	}
];

export const presetUrl = (id: string) => PRESETS.find((p) => p.id === id)?.url;
