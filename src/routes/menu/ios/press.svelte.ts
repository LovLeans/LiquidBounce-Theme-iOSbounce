/**
 * Shared "pressed" state for buttons and list rows.
 *
 * The pressed look is held for at least MIN_PRESS_MS, so even a very quick click visibly squishes the control
 * before it springs back (the spring itself is a CSS transition on release).
 */
const MIN_PRESS_MS = 150;

export function createPress() {
    let pressed = $state(false);
    let since = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    return {
        get pressed(): boolean {
            return pressed;
        },
        down(): void {
            clearTimeout(timer);
            since = performance.now();
            pressed = true;
        },
        up(): void {
            clearTimeout(timer);
            const wait = Math.max(0, MIN_PRESS_MS - (performance.now() - since));
            timer = setTimeout(() => {
                pressed = false;
            }, wait);
        },
        /** Releases immediately (e.g. when the press turned into a scroll drag). */
        cancel(): void {
            clearTimeout(timer);
            pressed = false;
        },
        dispose(): void {
            clearTimeout(timer);
        }
    };
}
