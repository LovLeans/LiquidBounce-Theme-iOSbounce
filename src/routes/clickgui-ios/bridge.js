/**
 * LiquidBounce theme <-> iOS ClickGUI bridge.
 *
 * Everything that knows about the client lives in THIS file. The UI components in ./lib only
 * ever see the plain `categories` shape documented in lib/demo.js.
 *
 * It uses the theme's own REST helpers (src/integration/rest.ts), so base URL and endpoints stay in one place:
 *   getModules / getCategories / getModuleSettings  -> load
 *   setModuleEnabled(name, enabled)                 -> toggle
 *   setModuleSettings(name, settingsTree)           -> save
 *
 * When the client is not reachable (e.g. `vite dev` in a normal browser) the demo data is used instead.
 */
import { getModules, getCategories, getModuleSettings, setModuleSettings, setModuleEnabled } from '../../integration/rest';
import { icons, fallbackIcon } from './lib/icons.js';
import { categories as demoCategories } from './lib/demo.js';
import { applyThemeComponentChanges } from './themeComponents';
 
/** module name -> settings tree exactly as the client sent it (never reactive, source of truth for saving) */
const raws = new Map();
export let connected = false;
/** why the demo data is shown instead of real modules (null = real data); the route shows it on screen */
export let loadError = null;
 
// ------------------------------------------------------------------ keys
// UI key name (what the bind row shows / KeyboardEvent.key) <-> suffix of `key.keyboard.<suffix>`
 
const KEY_ALIASES = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  ' ': 'space', Shift: 'left.shift', Control: 'left.control', Alt: 'left.alt', Meta: 'left.win',
  PageUp: 'page.up', PageDown: 'page.down', CapsLock: 'caps.lock', NumLock: 'num.lock',
  ScrollLock: 'scroll.lock', PrintScreen: 'print.screen', ContextMenu: 'menu',
  ';': 'semicolon', '=': 'equal', ',': 'comma', '-': 'minus', '.': 'period', '/': 'slash',
  '`': 'grave.accent', '[': 'left.bracket', '\\': 'backslash', ']': 'right.bracket', "'": 'apostrophe'
};
const KEY_ALIASES_REV = Object.fromEntries(Object.entries(KEY_ALIASES).map(([k, v]) => [v, k]));
const pretty = (s) => s.split('.').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
 
export function keyToUi(id) {
  if (typeof id !== 'string' || !id || id.endsWith('.unknown')) return 'None';
  const tail = id.replace(/^key\.(keyboard|mouse)\./, '');
  const mouse = id.startsWith('key.mouse.');
  if (mouse) return 'Mouse ' + pretty(tail);
  if (KEY_ALIASES_REV[tail]) {
    const k = KEY_ALIASES_REV[tail];
    return k.length === 1 && k !== ' ' ? k : pretty(tail);
  }
  return tail.length === 1 ? tail.toUpperCase() : pretty(tail);
}
export function uiToKey(name) {
  if (name === 'None') return 'key.keyboard.unknown';
  return 'key.keyboard.' + (KEY_ALIASES[name] ?? name.toLowerCase());
}
 
// ------------------------------------------------------------------ settings: client -> UI
//
// `valueType` is only typed as `string` in types.ts, so settings are recognised by their SHAPE
// (see ModuleSetting in types.ts) with valueType as a tie-breaker where the shape is ambiguous.
 
const norm = (t) => String(t ?? '').toUpperCase().replace(/[\s_-]/g, '');
const isSetting = (v) => v && typeof v === 'object' && 'valueType' in v && 'name' in v;
 
/** @param raw one setting from the client, @param path indices from the module root (each step goes into `.value[i]`) */
function convertOne(raw, path) {
  const base = { name: raw.name, path };
  const vt = norm(raw.valueType);
  const v = raw.value;
 
  // ChooseSetting: value string + choices string[]
  if (Array.isArray(raw.choices) && typeof v === 'string') {
    if (!raw.choices.length) return null;
    // The HUD module's "Themes" list: click-to-cycle would SWITCH THE THEME on every click (and the GUI reloads with it), so it never
    // looked like it could be opened. It gets the full renderer instead: a drawer with the list, you pick one and only then it changes.
    if (/theme/i.test(String(raw.name))) return { ...base, type: 'raw', raw };
    return { ...base, type: 'choice', value: v, options: raw.choices };
  }
  // ChoiceSetting: choices is an OBJECT keyed by choice name, `active` = current one.
  // A mode switch without sub-settings stays the compact click-to-cycle row. As soon as one of the modes has settings of
  // its own, the whole setting is drawn by the full renderer (type 'raw'), which shows the settings of the active mode.
  if (raw.choices && typeof raw.choices === 'object' && !Array.isArray(raw.choices) && typeof raw.active === 'string') {
    const options = Object.keys(raw.choices);
    if (!options.length) return null;
    const hasSub = options.some((o) => { const c = raw.choices[o]?.value; return Array.isArray(c) && c.some(isSetting); });
    return hasSub ? { ...base, type: 'raw', raw } : { ...base, type: 'choice', value: raw.active, options };
  }
 
  if (typeof v === 'boolean') return { ...base, type: 'toggle', value: v };
 
  // IntSetting / FloatSetting: number + range. (ColorSetting is a number WITHOUT range -> skipped.)
  if (typeof v === 'number' && raw.range && typeof raw.range.from === 'number') {
    const { from: min, to: max } = raw.range;
    const isInt = vt.includes('INT') || (!vt.includes('FLOAT') && Number.isInteger(min) && Number.isInteger(max) && Number.isInteger(v));
    const step = isInt ? 1 : max - min > 20 ? 0.1 : 0.01;
    return { ...base, type: 'slider', value: v, min, max, step, suffix: raw.suffix || '' };
  }
 
  // BindSetting: value is an InputBind { boundKey, action, modifiers }
  // Drawn by the full renderer (tabs/settings/Setting.svelte): key capture WITH modifiers, and the Toggle / Hold / Smart choice below it.
  // The compact 'bind' row only knows a key name, so the action (and the modifiers) could not be set from the module windows.
  if (v && typeof v === 'object' && !Array.isArray(v) && 'boundKey' in v) {
    return { ...base, type: 'raw', raw };
  }
  // KeySetting: plain string like "key.keyboard.r"
  if (vt === 'KEY' && typeof v === 'string') return { ...base, type: 'bind', value: keyToUi(v) };
 
  // ConfigurableSetting / TogglableSetting: value is a list of settings
  if (Array.isArray(v) && v.length && v.every(isSetting)) {
    const children = convertList(v, path);
    return children.length ? { ...base, type: 'group', open: false, children } : null;
  }
  // a group without any setting inside has nothing to show
  if (Array.isArray(v) && (vt === 'CONFIGURABLE' || vt === 'TOGGLEABLE')) return null;
 
  // Everything else (int / float RANGE such as CPS, color, text, vectors, multi choose, lists, curves, files, ...) has no
  // compact row here. It used to be dropped, which is why options were missing; now the full renderer of the tabs draws it,
  // working on the setting object itself (written back in setSetting).
  return { ...base, type: 'raw', raw };
}
 
function convertList(list, parentPath) {
  if (!Array.isArray(list)) return [];
  const out = [];
  list.forEach((raw, i) => {
    if (!raw || typeof raw !== 'object') return; // skip junk entries, keep the indices of the others
    const s = convertOne(raw, [...parentPath, i]);
    if (s) out.push(s);
  });
  return out;
}
 
const rawAt = (root, path) => path.reduce((node, i) => node.value[i], root);
 
// ------------------------------------------------------------------ loading
 
// Fallback order if getCategories() is unavailable
const FALLBACK_ORDER = ['Combat', 'Player', 'Movement', 'Render', 'World', 'Misc', 'Exploit', 'Fun', 'Client'];
 
/**
 * Loads all modules and returns `categories` for <ClickGui>.
 * Falls back to demo data if the client API is not reachable.
 */
let inflight = null;
export function loadCategories() {
  // Closed while the modules were still loading and opened again: share the load that is already running instead of
  // sending one more request per module on top of the ones the client is still answering (that made the reopened GUI wait twice).
  return (inflight ??= doLoadCategories().finally(() => { inflight = null; }));
}

async function doLoadCategories() {
  try {
    const [list, cats] = await Promise.all([getModules(), getCategories().catch(() => [])]);
    if (!Array.isArray(list)) throw new Error('GET modules did not return a list: ' + JSON.stringify(list)?.slice(0, 120));
    if (!list.length) throw new Error('the client returned 0 modules');
    // one request per module, all at once, only on opening the GUI
    const trees = await Promise.all(list.map((m) => getModuleSettings(m.name).catch(() => null)));
    connected = true;
    loadError = null;
 
    const byCat = new Map();
    let broken = 0;
    list.forEach((m, i) => {
      const tree = trees[i];
      let settings = [];
      // a single odd module must never take the whole GUI down
      try {
        if (tree) raws.set(m.name, structuredClone(tree));
        settings = tree ? convertList(tree.value, []) : [];
      } catch (e) {
        broken++;
        console.warn('[ios-clickgui] could not convert the settings of', m.name, e);
      }
      const cat = m.category || 'Misc';
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat).push({ name: m.name, enabled: !!m.enabled, settings });
    });
 
    const order = cats.length ? cats.map((c) => c.name) : FALLBACK_ORDER;
    const rank = (c) => { const i = order.findIndex((x) => x.toLowerCase() === c.toLowerCase()); return i < 0 ? 99 : i; };
    const categories = [...byCat.entries()]
      .sort((a, b) => rank(a[0]) - rank(b[0]))
      .map(([name, modules]) => ({
        name,
        icon: icons[Object.keys(icons).find((k) => k.toLowerCase() === name.toLowerCase())] ?? fallbackIcon,
        modules: modules.sort((a, b) => a.name.localeCompare(b.name))
      }));
 
    console.info(`[ios-clickgui] loaded ${list.length} modules from the client` +
      (broken ? `, ${broken} with unreadable settings` : ''));
    return categories;
  } catch (e) {
    console.warn('[ios-clickgui] could not load modules from the client, showing demo data.', e);
    connected = false;
    loadError = e instanceof Error ? e.message : String(e);
    return demoCategories;
  }
}
 
// ------------------------------------------------------------------ writing back
 
/** Enable / disable a module. Resolves to false if the request could not be sent. */
export async function setEnabled(module) {
  if (!connected) return true;
  try {
    await setModuleEnabled(module.name, module.enabled);
    return true;
  } catch {
    return false;
  }
}
 
const pending = new Map(); // module name -> debounce timer
let hudBase = null;        // the HUD module's settings as they were before the changes that are waiting for the timer
 
/** Writes one changed setting back to the client (debounced, so dragging a slider is one request). */
export function setSetting(module, setting) {
  if (!connected) return;
  const root = raws.get(module.name);
  if (!root || !setting.path) return;
 
  // The HUD module's Themes list (Themes > <theme> > Components > ...): the theme draws its own layout, so a change of a component there
  // (Enabled, Alignment, options) is told to the theme as well, or it would be put back (themeComponents.ts compares this with the result).
  // (told once per burst of changes, from the state before the first one: a slider drag is many calls)
  if (module.name === 'HUD' && !hudBase) hudBase = structuredClone(root);

  const raw = rawAt(root, setting.path);
  switch (setting.type) {
    case 'toggle':
    case 'slider':
      raw.value = setting.value; break;
    case 'choice':
      if (typeof raw.active === 'string') raw.active = setting.value; else raw.value = setting.value;
      break;
    case 'bind':
      if (raw.value && typeof raw.value === 'object') raw.value.boundKey = uiToKey(setting.value); // keeps action + modifiers
      else raw.value = uiToKey(setting.value);
      break;
    case 'raw': {
      // the UI object is a reactive copy that was edited in place; put a plain copy of it back into the tree we send
      const parent = setting.path.length > 1 ? rawAt(root, setting.path.slice(0, -1)) : root;
      parent.value[setting.path[setting.path.length - 1]] = JSON.parse(JSON.stringify(setting.raw));
      break;
    }
  }
 
  clearTimeout(pending.get(module.name));
  pending.set(module.name, setTimeout(() => {
    pending.delete(module.name);
    if (module.name === 'HUD' && hudBase) { const base = hudBase; hudBase = null; applyThemeComponentChanges(base, root); }
    setModuleSettings(module.name, root).catch((e) => console.warn('[ios-clickgui] saving settings failed', e));
  }, 120));
}