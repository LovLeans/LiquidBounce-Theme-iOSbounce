<script lang="ts">
    interface Props {
        value?: string;
        placeholder?: string;
        label?: string;
        /** The <input>, for focusing it. */
        element?: HTMLInputElement;
    }

    let {value = $bindable(""), placeholder = "Search", label = "Search", element = $bindable()}: Props = $props();
</script>

<label class="search">
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5"></circle>
        <path d="M16 16l4.5 4.5"></path>
    </svg>
    <input type="text" bind:this={element} bind:value {placeholder} aria-label={label} spellcheck="false" autocomplete="off">
</label>

<style>
    .search {
        height: 40px;
        flex: none;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 14px;
        border-radius: 12px;
        color: var(--ios-text-dim);
        background: var(--ios-field);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
    }

    input {
        flex: 1;
        min-width: 0;
        background: transparent;
        border: 0;
        outline: 0;
        color: var(--ios-text);
        font-family: inherit;
        font-size: 15px;
        user-select: text;
    }

    input::placeholder {
        color: var(--ios-text-dim);
    }
</style>
