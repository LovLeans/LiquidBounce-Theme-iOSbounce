<!--
    Small banner that drops in from the top edge of an iOS-style screen (results of an action). The iOS screens have
    no <Menu> header, so the header's notifications are not there. Place it inside the IosScreen. `open` shows it; the
    owner decides when to close it again.
-->
<script lang="ts">
    interface Props {
        title: string;
        text: string;
        error?: boolean;
        open?: boolean;
    }

    let {title, text, error = false, open = false}: Props = $props();
</script>

<div class="toast" class:open class:error role="status" aria-live="polite">
    <span class="toast-icon" aria-hidden="true"></span>
    <span class="toast-title">{title}</span>
    <span class="toast-text">{text}</span>
</div>

<style>
    .toast {
        position: absolute;
        top: 20px;
        left: 50%;
        max-width: 560px;
        box-sizing: border-box;
        padding: 12px 20px 12px 14px;
        display: grid;
        grid-template-columns: auto 1fr;
        grid-template-areas: "icon title" "icon text";
        column-gap: 12px;
        align-items: center;
        border-radius: 20px;
        background: rgba(58, 54, 62, 0.82);
        -webkit-backdrop-filter: blur(24px) saturate(1.5);
        backdrop-filter: blur(24px) saturate(1.5);
        box-shadow: inset 0 0 0 1px var(--ios-hairline), inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 16px 40px rgba(0, 0, 0, 0.4);
        pointer-events: none;
        z-index: 20;
        transform-origin: 50% 0;

        /* Hidden: above the top edge. Accelerates away. */
        opacity: 0;
        transform: translateX(-50%) translateY(-90px) scale(0.92);
        transition: transform 0.4s cubic-bezier(0.5, 0, 0.75, 0.35), opacity 0.3s ease-in;
    }

    /* Shown: drops in with a little overshoot. */
    .toast.open {
        opacity: 1;
        transform: translateX(-50%) translateY(0) scale(1);
        transition: transform 0.6s cubic-bezier(0.34, 1.45, 0.5, 1), opacity 0.2s ease-out;
    }

    .toast-icon {
        grid-area: icon;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: var(--ios-accent);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25);
    }

    .toast.error .toast-icon {
        background: var(--ios-danger);
    }

    .toast-title {
        grid-area: title;
        font-size: 13px;
        font-weight: 700;
        line-height: 16px;
    }

    .toast-text {
        grid-area: text;
        font-size: 13px;
        line-height: 17px;
        color: var(--ios-text-dim);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
</style>
