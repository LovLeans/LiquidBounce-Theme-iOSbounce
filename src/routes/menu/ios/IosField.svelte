<!--
    A labelled text field of an iOS-style dialog: the label on the left, the text on the right of it, on a rounded glass
    surface like the search field. The whole row is the click target. Enter calls `onenter`, so a form can be sent from the keyboard.
    Bind `element` to focus it (e.g. when the dialog has finished opening).
    Optional: `type="password"` hides the text, `maxlength`, `invalid` (a red ring), and a `trailing` snippet shown at the end of the row
    (e.g. a small round button).
-->
<script lang="ts">
    import type {Snippet} from "svelte";

    interface Props {
        label: string;
        value?: string;
        placeholder?: string;
        type?: "text" | "password";
        maxlength?: number;
        /** Draws a red ring (the text is not acceptable). */
        invalid?: boolean;
        /** The <input>, for focusing it. */
        element?: HTMLInputElement;
        onenter?: () => void;
        trailing?: Snippet;
    }

    let {
        label,
        value = $bindable(""),
        placeholder = "",
        type = "text",
        maxlength,
        invalid = false,
        element = $bindable(),
        onenter,
        trailing
    }: Props = $props();
</script>

<label class="field" class:invalid>
    <span class="name">{label}</span>
    {#if type === "password"}
        <input type="password"
               bind:this={element}
               bind:value
               {placeholder}
               {maxlength}
               autocomplete="off"
               onkeydown={(e) => e.key === "Enter" && onenter?.()}>
    {:else}
        <input type="text"
               bind:this={element}
               bind:value
               {placeholder}
               {maxlength}
               spellcheck="false"
               autocomplete="off"
               onkeydown={(e) => e.key === "Enter" && onenter?.()}>
    {/if}
    {@render trailing?.()}
</label>

<style>
    .field {
        height: 52px;
        flex: none;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 0 16px;
        border-radius: 14px;
        cursor: text;
        background: var(--ios-field);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
        transition: box-shadow 0.15s;
    }

    .field:focus-within {
        box-shadow: inset 0 0 0 2px var(--ios-accent);
    }

    .field.invalid {
        box-shadow: inset 0 0 0 2px var(--ios-danger);
    }

    .name {
        flex: none;
        min-width: 76px; /* the labels of one dialog line up; a longer one ("Session ID") makes room instead of wrapping */
        white-space: nowrap;
        font-size: 15px;
        font-weight: 600;
    }

    input {
        flex: 1;
        min-width: 0;
        height: 100%;
        background: transparent;
        border: 0;
        outline: 0;
        padding: 0;
        color: var(--ios-text);
        caret-color: var(--ios-text);
        font-family: inherit;
        font-size: 15px;
        user-select: text;
    }

    input::placeholder {
        color: var(--ios-text-dim);
    }
</style>
