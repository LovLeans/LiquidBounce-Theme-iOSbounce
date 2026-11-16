/**
 * The GUI's text is set in Inter (app.scss: @font-face, a web font) on every platform that has no SF (everything but macOS / iOS). A web font
 * is only downloaded when something is first drawn with it, so the first time the GUI opened its text was drawn in the fallback font
 * (Segoe UI / Roboto / sans-serif) and then jumped to Inter a moment later, with different glyph widths (pills and rows re-laid-out).
 * The fix is to have the faces loaded BEFORE the first frame of the GUI:
 *   - main.ts calls `loadGuiFonts()` at startup, so they are normally long loaded when the GUI is first opened;
 *   - ClickGuiRoute.svelte holds the GUI back (at most `maxMs`) while `fontsLoaded()` is still false, e.g. when it is opened right after joining.
 * Weights used by the GUI: 400 (rows), 500, 600 (titles, tab bar). 300 is loaded as well because the HUD uses it.
 */
const FACES = ['300 13px Inter', '400 13px Inter', '500 13px Inter', '600 13px Inter'];

/** true when every face is already available (also true without the Font Loading API, or when there is nothing to load) */
export function fontsLoaded() {
  const f = typeof document !== 'undefined' ? document.fonts : null;
  if (!f || typeof f.check !== 'function') return true;
  try { return FACES.every((face) => f.check(face)); } catch { return true; }
}

let pending = null;

/** start loading the faces; resolves when they are there, or after `maxMs` at the latest (a missing / slow font must never block the GUI) */
export function loadGuiFonts(maxMs = 400) {
  const f = typeof document !== 'undefined' ? document.fonts : null;
  if (!f || typeof f.load !== 'function' || fontsLoaded()) return Promise.resolve();
  pending ??= Promise.allSettled(FACES.map((face) => f.load(face)));
  return Promise.race([pending, new Promise((r) => setTimeout(r, maxMs))]);
}
