<script lang="ts">
    import {createEventDispatcher} from "svelte";
    import Toggle from "../../../../components/Toggle.svelte";

    export let value: boolean;
    export let title: string;

    const dispatch = createEventDispatcher();

    // a tap on the title flips it too (the old <label> did that for the checkbox); the switch reports its own changes
    const flip = () => {
        value = !value;
        dispatch("change");
    };
</script>

<div class="switch-setting">
    <span class="switch">
        <Toggle checked={value} size={46} label={title} onchange={(v) => { value = v; dispatch("change"); }}/>
    </span>

    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <span class="title" onclick={flip}>{title}</span>
</div>

<style lang="scss">

  .switch-setting {
    display: flex;
    align-items: center;
    cursor: pointer;
    // the shared spring switch takes its colours from these
    --tg-on: var(--menu-switch-track-active-color);
    --tg-off: var(--menu-switch-track-color);
  }

  .title {
    color: var(--menu-text-color);
    font-size: 20px;
    margin-left: 10px;
    font-weight: 500;
  }

  .switch {
    display: flex;
    align-items: center;
    margin: 0 10px;
  }
</style>
