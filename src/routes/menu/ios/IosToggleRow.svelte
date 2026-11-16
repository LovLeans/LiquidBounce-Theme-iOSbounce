<!--
    A labelled switch row of an iOS-style dialog, the same glass row as IosField: the label on the left, the spring switch on the right.
    The whole row flips it. `value` is bindable.
-->
<script lang="ts">
    import Toggle from "../../../components/Toggle.svelte";

    interface Props {
        label: string;
        value?: boolean;
    }

    let {label, value = $bindable(false)}: Props = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="row" onclick={() => (value = !value)}>
    <span class="name">{label}</span>
    <!-- the switch reports its own changes; a click on it must not flip the row a second time -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <span class="sw" onclick={(e) => e.stopPropagation()}>
        <Toggle checked={value} size={60} {label} onchange={(v) => (value = v)}/>
    </span>
</div>

<style>
    .row {
        height: 52px;
        flex: none;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding: 0 16px;
        border-radius: 14px;
        cursor: pointer;
        background: var(--ios-field);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
        /* the spring switch takes its colours from these */
        --tg-on: var(--ios-accent);
        --tg-off: rgba(120, 120, 128, 0.5);
        --tg-focus: #ffffff;
    }

    .name {
        font-size: 15px;
        font-weight: 600;
    }

    .sw {
        display: flex;
        align-items: center;
    }
</style>
