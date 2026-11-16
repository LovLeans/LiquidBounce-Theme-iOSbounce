/**
 * Scale of the ClickGUI / HUD Editor / Settings app, the same one the iOS menus use (singleplayer, multiplayer, ... see
 * routes/menu/ios/IosStage.svelte): everything is drawn in a 1920x1080 design space and scaled with the window (1080p, 1440p,
 * 4K, a small window) and with the user's GUI scale (settings app of the main menu, `guiScale`).
 *
 *   s       real pixels per design pixel (window scale x GUI scale)
 *   w / h   size of the window in design pixels (what the UI is laid out in: a window is `w` wide, not `vw` real px)
 *
 * The HUD components are NOT part of this: they keep following Minecraft's own GUI scale (hud/Hud.svelte).
 */
import { guiScale } from '../../menu/ios/guiScale.svelte';

export const DESIGN_W = 1920;
export const DESIGN_H = 1080;

class StageMetrics {
  /** the window, in real pixels */
  vw = $state(typeof innerWidth === 'number' && innerWidth > 0 ? innerWidth : DESIGN_W);
  vh = $state(typeof innerHeight === 'number' && innerHeight > 0 ? innerHeight : DESIGN_H);
  /** window scale without the GUI scale */
  base = $derived(Math.min(this.vw / DESIGN_W, this.vh / DESIGN_H));
  s = $derived(Math.max(0.05, this.base * guiScale.value));
  w = $derived(this.vw / this.s);
  h = $derived(this.vh / this.s);
}

export const stage = new StageMetrics();

if (typeof addEventListener === 'function') {
  addEventListener('resize', () => {
    stage.vw = innerWidth;
    stage.vh = innerHeight;
  });
}
