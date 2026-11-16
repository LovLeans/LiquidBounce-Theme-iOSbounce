/**
 * Small helpers shared by the settings renderer of the GUI tabs (Setting.svelte and its editors).
 */
import { convertToSpacedString } from '../../../../theme/theme_config';
import { setTyping } from '../../../../integration/rest';

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** "HintCount" -> "Hint Count" (the theme's own setting, `spaceSeperatedNames`) */
export function spaced(name) {
  try { return convertToSpacedString(String(name)); } catch { return String(name); }
}
/** lets a long camelCase name wrap between its words instead of pushing the control out of the row */
export const soft = (name) => String(name).replace(/([a-z0-9])([A-Z])/g, '$1\u200b$2');

/** Step of a float slider: the same rule as the classic GUI (finer for small ranges, coarser for big ones). */
export function floatStep(range, value) {
  const min = Math.min(range.from, value), max = Math.max(range.to, value);
  const basis = range.to + ((max - min) - (range.to - range.from));
  if (basis > 100) return 0.1;
  if (basis <= 0.1) return 0.0001;
  if (basis <= 1) return 0.001;
  return 0.01;
}
/** 12.3400000001 -> 12.34 */
export const num = (v) => (Number.isFinite(v) ? +Number(v).toFixed(4) : 0);

/** What the user typed into a number field: " 4,5 " -> 4.5. Anything that is not a number -> null. */
export function parseNumber(text) {
  const t = String(text).trim().replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}
/** A typed number made valid: rounded for an int, kept inside [min, max], without float noise (4.1999999 -> 4.2). */
export const fitNumber = (n, min = -Infinity, max = Infinity, int = false) => num(Math.min(max, Math.max(min, int ? Math.round(n) : n)));

// ---- which groups / pickers the user left open, kept for the session (a tab is rebuilt every time it is shown) ----
const open = new Map();
export const wasOpen = (key) => open.get(key) ?? false;
export const rememberOpen = (key, on) => { open.set(key, on); };

/** Tell the client that keys are meant for the page (key capture / text fields): never throws, works without a client. */
export function typing(on) {
  try { Promise.resolve(setTyping(on)).catch(() => {}); } catch { /* no client */ }
}

// ---- colors: the client sends ARGB as one int ----
export const hex2 = (n) => Math.round(n).toString(16).padStart(2, '0');

export function hsvToRgb(h, s, v) {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}
export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d + 6) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, mx ? d / mx : 0, mx];
}
/** "#rrggbb" or "#rrggbbaa" (also without the #) -> [r, g, b, a] or null */
export function parseHex(text) {
  const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(String(text).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, m[2] ? parseInt(m[2], 16) : 255];
}
export const cssRgba = ([r, g, b, a]) => `rgba(${r}, ${g}, ${b}, ${+(a / 255).toFixed(3)})`;
