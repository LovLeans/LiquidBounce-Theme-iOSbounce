import { spring, retarget, createLoop } from '../../menu/title/main-menu/spring.js';
import { K } from './morph.js';

const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * One page of the tab bar (Settings, HUD editor) opening / leaving, as TWO springs (x and y, 0 = away, 1 = there) whose TARGET is flipped.
 *
 * Why not a keyframe animation for the intro and a Svelte `out:` / a CSS transition for the leave (what the pages did before)? Those are
 * two separate animations that know nothing about each other. Switching tab while one of them is still running made the other start from
 * the wrong place: the leave of the Settings page began at "fully open" (a visible jump to full size, then the fold), and on the HUD
 * layer the intro keyframes kept winning over the leave transition until they ended (then it jumped). With a spring there is only ever
 * ONE moving thing: turning the page around half way just aims the same spring at the other target, so position AND speed carry on.
 *
 *   apply(x, y, settled)  paint the page for these spring positions (x / y overshoot above 1 while opening, never below 0 when leaving)
 *   onGone()              the page has left and is settled at 0: the owner may unmount it
 *   delay                 ms an opening page waits when it starts from nothing, so it does not overlap the page that is leaving
 *
 * Numbers: opening = the dialogs' page springs (K.pageW / K.pageH), leaving = the closing spring (K.fold), as in lib/morph.js.
 */
export function createPageMorph({ apply, onGone = () => {}, delay = 90 }) {
  const x = spring(0, ...K.pageW);
  const y = spring(0, ...K.pageH);
  let want = null; // null until the first set()
  let timer = 0;
  let dead = false;
  let settled = true;

  const loop = createLoop([x, y], {
    render() {
      if (dead) return;
      apply(x.p, y.p, settled);
    },
    onFrame() {
      // the tail of a spring rings on below a pixel for another second: end it once it can no longer be seen
      const near = (s) => Math.abs(s.t - s.p) < 0.003 && Math.abs(s.v) < 0.08;
      if (!settled && near(x) && near(y)) {
        x.p = x.t; x.v = 0; y.p = y.t; y.v = 0;
        settled = true;
        if (x.t === 0) queueMicrotask(() => { if (!dead && want === false) onGone(); });
      }
    }
  });

  function aim(on) {
    const kx = on ? K.pageW : K.fold;
    const ky = on ? K.pageH : K.fold;
    retarget(x, on ? 1 : 0, kx[0], kx[1]);
    retarget(y, on ? 1 : 0, ky[0], ky[1]);
    settled = false;
    loop.kick();
  }

  return {
    /** open (true) or send away (false); calling it while the page is moving turns it around from where it is, with its speed */
    set(on) {
      if (dead || on === want) return;
      want = on;
      clearTimeout(timer);
      if (calm()) { this.snap(on); return; }
      if (on && y.p < 0.02 && delay) timer = setTimeout(() => aim(true), delay);
      else aim(on);
    },
    /** no motion: straight to the end state */
    snap(on) {
      if (dead) return;
      want = on;
      clearTimeout(timer);
      loop.stop();
      const v = on ? 1 : 0;
      x.p = x.t = v; y.p = y.t = v; x.v = y.v = 0;
      settled = true;
      apply(v, v, true);
      if (!on) queueMicrotask(() => { if (!dead && want === false) onGone(); });
    },
    destroy() {
      dead = true;
      clearTimeout(timer);
      loop.stop();
    }
  };
}
