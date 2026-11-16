import { MORPH, T, val, clamp01, capOvershoot } from './morph.js';

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// natural (fully open) size of each node. Re-measured whenever nothing is animating on it, reused when a
// transition is interrupted half way (otherwise the half-collapsed size would be scaled down a second time).
const natural = new WeakMap();

function measure(node) {
  let m = natural.get(node);
  if (!m || node.getAnimations().length === 0) {
    const cs = getComputedStyle(node);
    // computed height ignores ancestor transforms (unlike getBoundingClientRect) and keeps sub-pixels
    m = {
      h: parseFloat(cs.height) || node.offsetHeight,
      pt: parseFloat(cs.paddingTop) || 0,
      pb: parseFloat(cs.paddingBottom) || 0,
      mt: parseFloat(cs.marginTop) || 0,
      mb: parseFloat(cs.marginBottom) || 0
    };
    natural.set(node, m);
  }
  return m;
}

// The nearest ancestor that scrolls AND shows a scrollbar (a popover's option list, a component's settings card). Inside such a box the drawer
// must never be even a pixel bigger than it really is: the extra height (overshoot) or width (scale > 1) is scrollable overflow, and the
// scrollbar flashes in and out. There the overshoot is left out (the drawer still moves the same way, it just does not go past its size).
function scrollerOf(node) {
  for (let p = node.parentElement; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && cs.scrollbarWidth !== 'none') return p;
  }
  return null;
}

// Length (px) of the soft fade along the moving bottom edge. It is the fade that makes the rows "arrive with the edge": a row is fully
// visible once the edge is this far past it, so what is in the drawer is revealed (opening) / swallowed (closing) by the edge itself.
const SOFT = 18;

/**
 * Settings drawer, driven by the morph springs (lib/morph.js): the height and the width grow with an underdamped spring (a little
 * overshoot, then it wobbles to rest), and closing is the quick, nearly critically damped version: the width narrows first, the height follows.
 * Target elements must use `box-sizing: border-box`.
 *
 * THE ROWS HAVE NO ANIMATION OF THEIR OWN. They used to pop in one after the other on a clock of their own (translate + scale + fade, staggered),
 * which is a second animation that starts after the drawer has already moved: the box opened, THEN the rows appeared (and on closing the rows
 * left first, THEN the box folded). Now the drawer is one surface: its content stays where it is and is clipped by the moving height, with a
 * short soft fade along the bottom edge (a mask that is only there while it moves and shrinks to nothing as the drawer reaches full size, so
 * nothing snaps at the end). Opening reveals the rows top to bottom exactly as the edge reaches them; closing swallows them bottom to top.
 * Nothing is transformed per row either, which is what made the option lists / settings cards (overflow: auto) flash a scrollbar: a row
 * pushed 12 px down is scrollable overflow even though the list fits.
 *
 * The vertical padding (and margin) is animated together with the height. With border-box a box can never be
 * shorter than its padding, so animating only the height made the drawer stall at padding-top +
 * padding-bottom for the last part of the close and then snap away.
 *
 * `blur` (px) is the blur at the start of the open / end of the close. It eases with the height (it never goes negative, even when the
 * spring overshoots). `depth` is accepted for old callers and ignored (it only told the row cascade where the rows are).
 *
 * How a run is driven. Svelte samples the transition in order as `t = from + (goal - from) * easing(p)` and then `css(t)`, with `p` = 0..1 the
 * progress of the run. The `easing` below is the HEIGHT spring, so `t` is the drawer's visible size (1 = full) and a drawer that is turned
 * around half way (closed while it is still opening) continues from the size it has right now. The easing is called just before `css` for
 * the same sample, so it leaves `p` behind for `css`, which times the width spring on the same clock.
 */
export function drawer(node, { blur = 3 } = {}) {
  const boxed = scrollerOf(node) !== null;
  const { h, pt, pb, mt, mb } = measure(node);
  return ({ direction }) => {
    const out = direction === 'out';
    const secs = Math.min(0.9, out ? Math.max(T.fold, T.narrow) : Math.max(T.grow, T.widen));
    let from; // the value of `t` at the first sample = how open the drawer is when this run starts
    let p = 0; // progress of the sample that css() is about to be asked for (set by the easing)
    return {
      duration: reduced() ? 0 : Math.round(secs * 1000),
      easing: (x) => {
        p = x;
        return out ? val(MORPH.fold, x * secs, T.fold) : val(MORPH.grow, x * secs, T.grow);
      },
      css: (t) => {
        if (from === undefined) from = t;
        const s = p * secs; // seconds on the springs' clock

        let sx; // width (a little narrower while it is not yet open)
        if (out) sx = 1 - 0.06 * val(MORPH.narrow, s, T.narrow);
        else sx = 0.94 + 0.06 * (from + (1 - from) * val(MORPH.widen, s, T.widen));
        if (boxed) sx = Math.min(1, sx);

        const f = Math.max(0, boxed ? Math.min(1, t) : capOvershoot(t, h)); // size, 1 = full (the spring may overshoot above 1, never below 0)
        const u = Math.max(0, 1 - f);

        // soft bottom edge: full length while the drawer is small, gone before it is full (so the mask never "lets go" with a visible jump)
        const edge = Math.min(SOFT, h * f * 0.6) * clamp01(u * 5);
        const mask = edge >= 0.75
          ? `linear-gradient(to bottom,#000 calc(100% - ${edge.toFixed(1)}px),transparent 100%)`
          : 'none';

        return (
          `box-sizing:border-box;height:${(h * f).toFixed(2)}px;padding-top:${(pt * f).toFixed(2)}px;padding-bottom:${(pb * f).toFixed(2)}px;overflow:hidden;` +
          (mt ? `margin-top:${(mt * f).toFixed(2)}px;` : '') +
          (mb ? `margin-bottom:${(mb * f).toFixed(2)}px;` : '') +
          `opacity:${Math.min(1, f * 1.6).toFixed(3)};` +
          `transform:translateY(${(-u * 10).toFixed(2)}px) scale(${sx.toFixed(4)},1);transform-origin:top center;` +
          `-webkit-mask-image:${mask};mask-image:${mask};` +
          (blur ? `filter:blur(${(u * blur).toFixed(2)}px);will-change:height,transform,filter;` : '')
        );
      }
    };
  };
}
