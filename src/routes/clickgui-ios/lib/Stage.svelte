<!--
  Scaled layer of the ClickGUI app (see lib/stageMetrics.svelte.ts): a box that is `stage.w x stage.h` design pixels, drawn with
  `scale(stage.s)`, so it fills the whole window at any resolution and everything inside is laid out in design pixels. It
  works like routes/menu/ios/IosStage.svelte (1080p design, window scale x GUI scale).

  Inside it, `position: fixed` / `inset: 0` mean the whole window (in design pixels), and `--stage-w` / `--stage-h` / `--stage-s`
  are there for CSS (replacing `vw` / `vh`, which are real pixels). Pointer positions are real pixels: divide them by `stage.s`.

  passthrough: the box itself never takes the pointer (a layer that must not cover what lies beneath it, like the tab bar over the
  HUD editor); what is inside still does, if it sets `pointer-events: auto` itself.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { stage } from './stageMetrics.svelte';

  let { children, passthrough = false, z = undefined }: { children?: Snippet; passthrough?: boolean; z?: number } = $props();
</script>

<div class="cg-stage" class:passthrough
     style:width="{stage.w}px" style:height="{stage.h}px" style:transform="scale({stage.s})" style:z-index={z}
     style:--stage-w="{stage.w}px" style:--stage-h="{stage.h}px" style:--stage-s={stage.s}>
  {@render children?.()}
</div>

<style>
  .cg-stage { position: fixed; left: 0; top: 0; transform-origin: 0 0; }
  .cg-stage.passthrough { pointer-events: none; }
  /* a layer that is scaled / clipped every frame while a dock window carries the screen: no backdrop blurs, see ClickGui.svelte */
</style>
