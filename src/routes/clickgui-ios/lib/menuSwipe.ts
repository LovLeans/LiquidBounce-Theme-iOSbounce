import { stage } from './stage.svelte';

/**
 * Menu swipe animation: the "apps zoom in from the camera" physics, driving whole menus.
 *
 * Framework-agnostic on purpose. It writes transforms straight to the DOM nodes (no reactive state per frame),
 * and exposes a Svelte action (`swipe.item`) to register each menu.
 *
 *   const swipe = new MenuSwipe();
 *   <div use:swipe.item> ... </div>      // item must be a direct, absolutely positioned child of the stage
 *   swipe.setOpen(true)                  // play in
 *   swipe.setOpen(false)                 // play the same animation backwards
 *
 * Every item scales about the CENTER of its offsetParent (the stage), which is what makes it look like a camera
 * zoom: translate(dx*(s-1), dy*(s-1)) scale(s) with dx/dy = item center - stage center.
 *
 * Used by the ClickGUI (see ClickGui.svelte / TabBar.svelte). Additions over the standalone demo:
 *  - `item` takes options: `fadeVar` fades through a CSS custom property instead of `opacity` (the glass of a window
 *    reads `--in`, and an `opacity` on a parent would stop Chromium from blurring what is behind it).
 *  - items may be `position: fixed` (no offsetParent): the viewport is the stage then.
 *  - `reach` / `reachFloor`: take the ripple's normalisation from another controller (the tab bar is its own controller,
 *    because it stays when the windows leave on a tab switch, but it has to ripple in step with them).
 *  - `onSettle`, `settleMs`, `moving`: let the GUI keep its backdrop blurs off while things are flying.
 *  - setOpen() always re-measures: windows are dragged around, and the ResizeObserver does not see a move.
 *  - `maxSize`: the zoom-in of an item is limited by its size (its larger side never gets bigger than maxSize x the viewport height).
 *    A 224 x 660 px window at 17x is 3800 x 11000 css px (22000 device px on a retina screen): past the GPU's texture limit, so the
 *    window lost its glass / border / header for the length of the zoom, and re-rastering that every frame was far too slow.
 *  - Items are `will-change: transform`: the browser rasterises them once and scales the bitmap while they fly, instead of drawing the
 *    text of a whole window again at a new scale every frame (a frame that is not ready shows the glass without its content: blank
 *    slabs where the tab bar / search bar should be).
 *  - Their transform is NEVER cleared once it was used (see below).
 *    The demo writes `transform = ''` whenever the scale is within 1e-4 of 1, and that flips every few frames while the spring
 *    rings out. With glass inside (backdrop-filter, a scroller with its own layer) Chromium loses the item's own layer when its
 *    transform is removed and put back: the window's glass, border and header vanish (only the list stays) and the search / tab
 *    bar turn into blank purple slabs. At rest the transform is an identity.
 */

const IDENTITY = 'translate3d(0px,0px,0)';

export const SWIPE_KEY = Symbol('menu-swipe');

export interface SwipeConfig {
  /** 1 = exactly the reference recording; .92 = 8% slower */
  speed: number;
  /** spring frequency / damping ratio of the settle */
  omega: number;
  zeta: number;
  /** far items arrive later (ripple), dip deeper (corner) and settle slower (stretch) */
  stretch: number;
  corner: number;
  ripple: number;
  /** initial zoom-in size, e.g. 16 = starts 17x big */
  bounce: number;
  /** depth of the dip below 1.0 before relaxing out */
  dip: number;
  /** how fast the big initial zoom collapses (opening / closing) */
  snapRate: number;
  closeSnapRate: number;
  /** delay spread between the center item and the farthest item (playhead seconds) */
  spread: number;
  /** closing plays slower than opening */
  closeSpeed: number;
  /** an item's zoom-in is limited so that its larger side is at most this many viewport heights (0 = no limit, like the demo) */
  maxSize: number;
}

export const DEFAULT_SWIPE_CONFIG: SwipeConfig = {
  speed: 0.92,
  omega: 20.1,
  zeta: 0.62,
  stretch: 1,
  corner: 0.6,
  ripple: 4,
  bounce: 16,
  dip: 0.62,
  snapRate: 65,
  closeSnapRate: 44,
  spread: 0.205,
  closeSpeed: 0.8,
  maxSize: 2
};

interface Item {
  el: HTMLElement;
  dx: number;
  dy: number;
  delay: number;
  te: number;
  amp: number;
  /** continuity offset applied when closing starts from a settled layout */
  off: number;
  /** share of the configured zoom-in this item gets (big items zoom less, see `maxSize`) */
  zoom: number;
  fadeVar?: string;
  /** a transform has been written: from now on it is never cleared (see the header) */
  live?: boolean;
  /** `will-change: transform` is currently set (it is dropped while the item is drawn smaller than 1, see render()) */
  wc?: boolean;
}

export interface MenuSwipeOptions {
  config?: Partial<SwipeConfig>;
  /** called whenever setOpen actually changes the state */
  onChange?: (open: boolean) => void;
  /** take the distance that normalises the ripple from this controller's items too (the larger of the two wins) */
  reach?: MenuSwipe;
  /** ...and never less than this fraction of the stage's half diagonal (used while the other controller has no items yet) */
  reachFloor?: number;
}

export interface ItemOptions {
  /** fade through this CSS custom property (0..1) instead of `opacity` */
  fadeVar?: string;
}

export class MenuSwipe {
  readonly cfg: SwipeConfig;
  private readonly wd: number;
  private readonly zw: number;
  private readonly onChange?: (open: boolean) => void;
  private readonly peer?: MenuSwipe;
  private readonly reachFloor: number;
  private readonly settleCbs = new Set<(open: boolean) => void>();

  private items = new Set<Item>();
  private ro: ResizeObserver | null = null;

  // one playhead: forward = open, backward = the same animation reversed
  private t = 0;
  private dir: 1 | -1 = 1;
  private playing = false;
  private _open = false;
  private tEnd = 1; // opening: fully settled
  private tRev = 1; // closing: where the fly-out is already visibly moving
  private raf = 0;
  private last = 0;
  private sf = 1; // how much of the bounce/dip is applied (1 opening, 0 closing)
  private offW = 0; // fading continuity offset
  private pv = 1; // playhead rate, eases through zero when interrupted
  private turning = false;
  private layoutQueued = false;
  private destroyed = false;

  constructor(opts: MenuSwipeOptions = {}) {
    this.cfg = { ...DEFAULT_SWIPE_CONFIG, ...opts.config };
    const { omega, zeta } = this.cfg;
    this.wd = omega * Math.sqrt(1 - zeta * zeta);
    this.zw = (zeta * omega) / this.wd;
    this.onChange = opts.onChange;
    this.peer = opts.reach;
    this.reachFloor = opts.reachFloor ?? 0;
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.invalidate());
    }
  }

  get open(): boolean {
    return this._open;
  }

  /** true while the animation is running (either direction) */
  get moving(): boolean {
    return this.playing;
  }

  /** ms an opening from rest needs until every item is exactly in its place (for holding back expensive effects) */
  get settleMs(): number {
    if (this.layoutQueued) this.layout();
    return (this.tEnd / this.cfg.speed) * 1000;
  }

  /** called once an animation has run to its end; returns an unsubscribe function */
  onSettle(cb: (open: boolean) => void): () => void {
    this.settleCbs.add(cb);
    return () => void this.settleCbs.delete(cb);
  }

  /** distance of the farthest item from the stage center, measured now (px) */
  reach(): number {
    let m = 0;
    for (const a of this.items) {
      const p = this.measure(a.el);
      m = Math.max(m, Math.hypot(p.dx, p.dy));
    }
    return m;
  }

  /** Svelte action: register a menu. Use as `use:swipe.item`. */
  item = (el: HTMLElement, opts?: ItemOptions) => {
    const it: Item = { el, dx: 0, dy: 0, delay: 0, te: 1, amp: 1, off: 0, zoom: 1, fadeVar: opts?.fadeVar, wc: true };
    this.items.add(it);
    this.fade(it, '0');
    el.style.visibility = 'hidden';
    el.style.willChange = 'transform'; // rasterised once, scaled as a bitmap while it flies (see the header); dropped while smaller than 1x, see layer()
    this.ro?.observe(el);
    if (el.parentElement) this.ro?.observe(el.parentElement);
    this.invalidate();
    return {
      destroy: () => {
        this.items.delete(it);
        this.ro?.unobserve(el);
        if (it.fadeVar) el.style.removeProperty(it.fadeVar);
        else el.style.opacity = '';
        el.style.visibility = '';
        el.style.transform = '';
        el.style.willChange = '';
        this.invalidate();
      }
    };
  };

  /** Show (true) or hide (false). Safe to call at any moment, mid-animation included. */
  setOpen(open: boolean): void {
    if (this.destroyed || open === this._open) return;
    this.layout(); // tEnd / tRev must match the current geometry (a window may have been dragged: nothing observes that)

    const wasMoving = this.playing;
    let moving = wasMoving;
    this._open = open;
    this.dir = open ? 1 : -1;

    if (!open && this.t > this.tRev) {
      // Closing from a settled layout, or from the slow settling tail of the opening: skip straight to where the
      // fly-out starts moving (no waiting) and fade the small difference out so nothing pops.
      for (const a of this.items) {
        const cur = this.scaleAt(a, this.t);
        const tgt = this.scaleAt(a, this.tRev, 0);
        a.off = cur !== null && tgt !== null ? cur - tgt : 0;
      }
      this.offW = 1;
      this.sf = 0;
      this.t = this.tRev;
      moving = false;
    }

    // from rest the animation starts at full rate; mid-animation it decelerates, turns around and speeds up again
    this.turning = moving;
    this.playing = true;
    this.onChange?.(open);
    this.kick();
  }

  toggle(): void {
    this.setOpen(!this._open);
  }

  /** Jump to the open/closed end state without animating. */
  snap(open: boolean): void {
    if (this.layoutQueued) this.layout();
    this._open = open;
    this.dir = open ? 1 : -1;
    this.playing = false;
    this.turning = false;
    this.t = open ? this.tEnd : 0;
    this.sf = open ? 1 : 0;
    this.offW = 0;
    this.render();
  }

  /** Recompute geometry (call after you move/resize menus yourself). Also runs automatically on resize. */
  layout(): void {
    this.layoutQueued = false;
    let dmax = 0;
    for (const a of this.items) {
      const p = this.measure(a.el);
      a.dx = p.dx;
      a.dy = p.dy;
      dmax = Math.max(dmax, Math.hypot(a.dx, a.dy));
    }
    if (this.peer) dmax = Math.max(dmax, this.peer.reach());
    // the UI is laid out in design pixels (lib/stage.svelte.ts), so the screen is `stage.w x stage.h` here, not the window's real size
    if (this.reachFloor > 0) {
      dmax = Math.max(dmax, this.reachFloor * Math.hypot(stage.w / 2, stage.h / 2));
    }
    const { spread, ripple, stretch, corner, maxSize, bounce } = this.cfg;
    const vh = stage.h > 0 ? stage.h : 1080;
    for (const a of this.items) {
      const side = Math.max(a.el.offsetWidth, a.el.offsetHeight, 1);
      a.zoom = maxSize > 0 && bounce > 0 ? Math.max(0.02, Math.min(1, (maxSize * vh / side - 1) / bounce)) : 1;
      const dn = dmax > 0 ? Math.hypot(a.dx, a.dy) / dmax : 0;
      a.delay = spread * Math.pow(dn, ripple);
      a.te = 1 / (1 + stretch * dn);
      a.amp = 1 + corner * dn * dn; // outer menus squeeze in further before relaxing out
    }
    // when the animation is fully settled (opening) / already visibly moving (start of reverse)
    this.tEnd = this.tRev = 0;
    for (let x = 0; x < 4; x += 0.01) {
      let d1 = 0;
      let d0 = 0;
      for (const a of this.items) {
        const s1 = this.scaleAt(a, x, 1);
        const s0 = this.scaleAt(a, x, 0);
        if (s1 !== null) d1 = Math.max(d1, Math.abs(s1 - 1));
        if (s0 !== null) d0 = Math.max(d0, Math.abs(s0 - 1));
      }
      if (d1 > 0.0006) this.tEnd = x;
      if (d0 > 0.05) this.tRev = x;
    }
    this.tEnd += 0.02;
    this.tRev += 0.02;
    // keep a parked open layout valid after a resize
    if (this._open && !this.playing) this.t = this.tEnd;
    this.render();
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ro?.disconnect();
    this.items.clear();
    this.settleCbs.clear();
  }

  // ---- internals ----

  /** scale of one item at playhead time `time` (null = not on screen yet) */
  private scaleAt(a: Item, time: number, f = this.sf): number | null {
    const c = this.cfg;
    const tau = time - a.delay;
    if (tau < 0) return null;
    const x = tau * a.te;
    const sp = Math.exp(-c.zeta * c.omega * x) * (Math.cos(this.wd * x) + this.zw * Math.sin(this.wd * x));
    const s = 1 + c.bounce * a.zoom * Math.exp(-(c.closeSnapRate + (c.snapRate - c.closeSnapRate) * f) * tau) + f * c.dip * a.amp * sp;
    return tau > 0.25 && Math.abs(s - 1) < 0.0006 ? 1 : s;
  }

  /** layout position of an item relative to the stage center (offset* ignore transforms, so it is right mid-animation too) */
  private measure(el: HTMLElement): { dx: number; dy: number } {
    // a `position: fixed` item has no offsetParent: the viewport is its stage
    const parent = el.offsetParent as HTMLElement | null;
    const cx = (parent ? parent.clientWidth : stage.w) / 2;
    const cy = (parent ? parent.clientHeight : stage.h) / 2;
    return { dx: el.offsetLeft + el.offsetWidth / 2 - cx, dy: el.offsetTop + el.offsetHeight / 2 - cy };
  }

  private fade(a: Item, v: string): void {
    if (a.fadeVar) a.el.style.setProperty(a.fadeVar, v);
    else a.el.style.opacity = v;
  }

  private invalidate(): void {
    if (this.layoutQueued || this.destroyed) return;
    this.layoutQueued = true;
    queueMicrotask(() => {
      if (this.layoutQueued && !this.destroyed) this.layout();
    });
  }

  /**
   * `will-change: transform` only while the item is drawn at 1x or bigger.
   * Chromium never rasterises a will-change layer below 1x: while the dip of the animation draws a window SMALLER than 1 (scale .4 - .99) its
   * text is the 1x bitmap shrunk down, which is visibly THINNER / blurrier, and the moment the scale is back above 1 it is rasterised crisply
   * again: that was the sudden "font change" while the GUI opens. Without the hint (the transform stays a translate3d, so the item keeps its
   * own layer) the text is drawn at the real size on every frame. Measured in headless Chromium at 1x: text differs from natively drawn text
   * by .37 (mean grey levels) with the hint while below 1x, 0.000 without; identical at rest either way. At 2x screens it never showed.
   * Nested hints count too: with only the item's own hint removed the text inside its `.list` was still .32 off, with `data-dip` it is 0.000.
   */
  private layer(a: Item, on: boolean): void {
    if (a.wc === on) return;
    a.wc = on;
    a.el.style.willChange = on ? 'transform' : '';
    // the item's CHILDREN have the same problem (Panel's `.list`, where the module names are, has its own `will-change: transform`):
    // a nested hint is just as much a "never below 1x" layer. `[data-dip]` switches every descendant's hint off (rule in ClickGuiRoute.svelte).
    if (on) a.el.removeAttribute('data-dip');
    else a.el.setAttribute('data-dip', '');
  }

  private render(): void {
    const hidden = !this._open && !this.playing;
    for (const a of this.items) {
      let s = hidden ? null : this.scaleAt(a, this.t);
      if (s === null) {
        this.fade(a, '0');
        a.el.style.visibility = 'hidden';
        a.el.style.transform = a.live ? IDENTITY : '';
        this.layer(a, true);
        continue;
      }
      if (this.offW > 0) s += a.off * this.offW; // hides the jump to the fly-out start
      a.el.style.visibility = 'visible';
      this.layer(a, s >= 1);
      this.fade(a, String(Math.min(1, 0.35 + (this.t - a.delay) / 0.03)));
      if (Math.abs(s - 1) < 1e-4) a.el.style.transform = a.live ? IDENTITY : '';
      else {
        a.live = true;
        a.el.style.transform = `translate3d(${a.dx * (s - 1)}px,${a.dy * (s - 1)}px,0) scale(${s})`;
      }
    }
  }

  private tick = (now: number): void => {
    this.raf = 0;
    const c = this.cfg;
    const dt = Math.min(0.033, Math.max(0.001, (now - this.last) / 1000));
    this.last = now;

    // closing is a straight fly-out (no inward pull): fade the bounce out; bring it back when opening
    if (this.dir < 0) this.sf *= Math.exp((-dt * c.speed) / 0.06);
    else this.sf += (1 - this.sf) * (1 - Math.exp((-dt * c.speed) / 0.1));
    if (this.offW > 0) {
      this.offW *= Math.exp((-dt * c.speed) / 0.07);
      if (this.offW < 0.001) this.offW = 0;
    }

    const wasPlaying = this.playing;
    if (this.playing) {
      const goal = this.dir * (this.dir < 0 ? c.closeSpeed : 1);
      if (this.turning) {
        this.pv += (goal - this.pv) * (1 - Math.exp(-dt / 0.04));
        if (Math.abs(goal - this.pv) < 0.02) {
          this.pv = goal;
          this.turning = false;
        }
      } else this.pv = goal;
      this.t = Math.min(this.tEnd, Math.max(0, this.t + this.pv * dt * c.speed));
      if (this.dir > 0 && this.t >= this.tEnd) this.playing = false;
      if (this.dir < 0 && this.t <= 0) this.playing = false;
    }

    this.render();
    if (wasPlaying && !this.playing) for (const cb of [...this.settleCbs]) cb(this._open);
    if (this.playing || this.offW > 0 || (this.dir > 0 && this.sf < 0.999)) this.raf = requestAnimationFrame(this.tick);
  };

  private kick(): void {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }
}
