export interface ScrollerOptions {
  /** called every time the list has moved (wheel, momentum, rubber band, scrollTo) */
  onscroll?: () => void;
}
/** iOS-style scrolling for a list (Svelte action). See the header of scroller.js. */
export function scroller(node: HTMLElement, opts?: ScrollerOptions): { destroy?: () => void } | void;
/** Glide to scroll position `y`, or jump there at once with `instant`. */
export function scrollTo(node: HTMLElement, y: number, instant?: boolean): void;
