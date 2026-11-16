import { writable } from 'svelte/store';
/** name of the module currently flashing after "locate" */
export const flash = writable('');

// ---- what the user left open: windows and module settings drawers ----
// Kept in memory for the session and in localStorage (`<storageKey>:open`, separate from the window layout, so remembering it
// never turns the default grid into a "custom" layout). The GUI is rebuilt every time it is opened, so without this every
// window and drawer would be closed again each time.
let KEY = 'ios-clickgui-layout:open';
let mem = null; // { win: Set | null (null = the user never opened / closed a window: use the default), mods: Set }

function read() {
  if (mem) return mem;
  mem = { win: null, mods: new Set() };
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (j) {
      if (Array.isArray(j.win)) mem.win = new Set(j.win);
      if (Array.isArray(j.mods)) mem.mods = new Set(j.mods);
    }
  } catch { /* unavailable / corrupt: start from the defaults */ }
  return mem;
}
function write() {
  try { localStorage.setItem(KEY, JSON.stringify({ win: mem.win ? [...mem.win] : [], mods: [...mem.mods] })); } catch {}
}

/** call once, before reading anything, with the GUI's storage key */
export function useOpenMemory(storageKey) {
  const k = `${storageKey}:open`;
  if (k !== KEY) { KEY = k; mem = null; }
}
/** names of the windows that were open, or null if the user never changed it */
export const rememberedWindows = () => read().win;
/** the windows that are open now (written only when it changed) */
export function rememberWindows(names) {
  const m = read();
  const next = new Set(names);
  if (m.win && m.win.size === next.size && [...next].every((n) => m.win.has(n))) return;
  m.win = next;
  write();
}
export const drawerWasOpen = (name) => read().mods.has(name);
export function rememberDrawer(name, open) {
  const m = read();
  if (m.mods.has(name) === open) return;
  open ? m.mods.add(name) : m.mods.delete(name);
  write();
}
