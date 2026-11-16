<script lang="ts">
    import {onDestroy} from "svelte";

    let left = -100;
    // was never cleared: every Taco that was ever mounted kept ticking (and re-rendering a destroyed component) for good
    const timer = setInterval(() => {
        left += 100;

        if (left > window.innerWidth + 100) {
            left = -100;
        }
    }, 500);
    onDestroy(() => clearInterval(timer));
</script>

<div class="taco">
    <img src="img/hud/taco/taco.gif" alt="taco no load :(("
         class:transition={left < window.innerWidth + 100 && left > -100} style="left: {left}px">
</div>

<style lang="scss">
  .taco {
    position: relative;
    height: 60px;
    width: 100vw;
    background-color: transparent;

    img {
      position: absolute;
      height: 100%;

      &.transition {
        transition: linear left 500ms;
      }
    }
  }
</style>

