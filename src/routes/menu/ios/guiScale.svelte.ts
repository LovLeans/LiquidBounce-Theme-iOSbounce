/**
 * User-chosen GUI scale, shared by every iOS-style screen and remembered between sessions.
 * 1 = the default size. Changed from the settings app (IosSettings.svelte).
 */
export const GUI_SCALE_MIN = 0.6;
export const GUI_SCALE_MAX = 1.5;
export const GUI_SCALE_STEP = 0.05;

const STORAGE_KEY = "ios-gui-scale";

function normalize(value: number): number {
    const clamped = Math.min(GUI_SCALE_MAX, Math.max(GUI_SCALE_MIN, value));
    return Math.round(clamped / GUI_SCALE_STEP) * GUI_SCALE_STEP;
}

function load(): number {
    try {
        const stored = parseFloat(localStorage.getItem(STORAGE_KEY) ?? "");
        if (Number.isFinite(stored)) {
            return normalize(stored);
        }
    } catch {
        // Storage can be unavailable (private mode, blocked): fall back to the default.
    }
    return 1;
}

export const guiScale = $state({value: load()});

export function setGuiScale(value: number): void {
    guiScale.value = normalize(value);
    try {
        localStorage.setItem(STORAGE_KEY, String(guiScale.value));
    } catch {
        // Not persisted, still applied for this session.
    }
}
