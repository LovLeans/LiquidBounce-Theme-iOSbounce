/** What the editor needs from MainMenu. Getters, because the elements only exist after mount. */
export interface EditorHost {
	stage(): HTMLElement;
	scr(): HTMLElement;
	dock(): HTMLElement;
	/** the clock text and the date text */
	tm(): HTMLElement;
	/** true when the pointer landed on the bare wallpaper (so a long press may open the editor) */
	isWallpaper(t: EventTarget | null): boolean;
	/** stage rect: re-measure before converting client px -> stage units */
	sr(): { left: number; top: number; s: number };
	measure(): void;
	dockEditing(): boolean;
	anyOpen(): boolean;
	toast(t: string): void;
}
