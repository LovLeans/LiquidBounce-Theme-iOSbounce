// Dock / app glyphs, extracted unchanged from the prototype.
// Every injected SVG gets unique gradient ids, so the same glyph can appear in the dock,
// in its app window and anywhere else without the gradients colliding.

const G: Record<string, string> = {
sp:'<svg viewBox="0 0 100 100"><defs><linearGradient id="gs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6cc4ff"/><stop offset="1" stop-color="#0a6cff"/></linearGradient></defs><circle cx="50" cy="35" r="14" fill="url(#gs)"/><path d="M23 78c0-16 12-26 27-26s27 10 27 26z" fill="url(#gs)"/></svg>',
mp:'<svg viewBox="0 0 100 100"><defs><linearGradient id="gm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7df08f"/><stop offset="1" stop-color="#1fb84a"/></linearGradient></defs><circle cx="50" cy="34" r="12" fill="url(#gm)"/><path d="M30 76c0-14 8-22 20-22s20 8 20 22z" fill="url(#gm)"/><circle cx="24" cy="43" r="8.5" fill="url(#gm)" opacity=".8"/><path d="M8 74c0-11 6-17 16-17 3 0 6 .8 8 2.2-4 4-6 9-6 14.8z" fill="url(#gm)" opacity=".8"/><circle cx="76" cy="43" r="8.5" fill="url(#gm)" opacity=".8"/><path d="M92 74c0-11-6-17-16-17-3 0-6 .8-8 2.2 4 4 6 9 6 14.8z" fill="url(#gm)" opacity=".8"/></svg>',
st:'<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="37" fill="none" stroke="#c9c9cd" stroke-width="9" stroke-dasharray="4.84 4.84"/><circle cx="50" cy="50" r="33" fill="none" stroke="#d9d9dd" stroke-width="5"/><circle cx="50" cy="50" r="23" fill="#7b7b80"/><circle cx="50" cy="50" r="15" fill="#4a4a4f"/><path d="M50 50V24M50 50L72 63M50 50L28 63" stroke="#f1f1f3" stroke-width="5.5" stroke-linecap="round"/></svg>',
ex:'<svg viewBox="0 0 100 100"><g fill="none" stroke="#ff4a3f" stroke-width="8.5" stroke-linecap="round"><path d="M34 29a30 30 0 1 0 32 0"/><path d="M50 18v31"/></g></svg>'};

const U = (id: string, a: string, b: string, body: string) =>`<svg viewBox="0 0 100 100"><defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="14" y1="14" x2="86" y2="86"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>${body}</svg>`;
Object.assign(G, {
 px:U('gp','#5ee7ff','#2f7bff','<g fill="none" stroke="url(#gp)" stroke-width="7" stroke-linecap="round"><circle cx="50" cy="50" r="31"/><ellipse cx="50" cy="50" rx="13" ry="31"/><path d="M19 50h62"/></g>'),
 cg:U('gc','#ffb340','#ff6a3d','<g stroke-linecap="round" stroke-width="7"><path d="M22 30h56M22 50h56M22 70h56" stroke="#5a5a60"/><path d="M22 30h34M22 50h22M22 70h44" stroke="url(#gc)"/></g><g fill="#fff"><circle cx="56" cy="30" r="9"/><circle cx="44" cy="50" r="9"/><circle cx="66" cy="70" r="9"/></g>'),
 ac:U('ga','#46e0a0','#1296d6','<g fill="url(#ga)"><circle cx="77" cy="38" r="8.5" opacity=".6"/><path d="M62 75c0-9 6-15 15-15s15 6 15 15z" opacity=".6"/><circle cx="38" cy="33" r="13"/><path d="M12 78c0-16 11-26 26-26s26 10 26 26z"/></g>')});

let gid = 0;

export type GlyphId = 'sp' | 'mp' | 'st' | 'ex' | 'px' | 'cg' | 'ac';

export const glyph = (k: GlyphId | string): string => {
	const n = ++gid;
	return G[k].replace(/id="(\w+)"/g, `id="$1_${n}"`).replace(/url\(#(\w+)\)/g, `url(#$1_${n})`);
};
