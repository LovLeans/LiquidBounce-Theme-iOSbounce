<!--
    Add Account in the iOS style: a window that grows out of the Add Account button with the same motion as Add Server / ViaFabricPlus
    (see ios/IosDialog.svelte). Four tabs on the icon tab bar (ios/IosTabBar.svelte): Microsoft (Web View / Device Code / Credentials),
    TheAltening, Cracked, Session. The tab is remembered. The tabs stay mounted, so what was typed in one is still there after a
    look at another. Mounted by AltManager.svelte while it is open, and removed in `onclosed`.
-->
<script lang="ts">
    import IosDialog from "../../ios/IosDialog.svelte";
    import IosTabBar from "../../ios/IosTabBar.svelte";
    import MicrosoftTab from "./microsoft/MicrosoftTab.svelte";
    import TheAlteningAccountTab from "./TheAlteningAccountTab.svelte";
    import CrackedAccountTab from "./CrackedAccountTab.svelte";
    import SessionAccountTab from "./SessionAccountTab.svelte";
    import {setItem} from "../../../../integration/persistent_storage";
    import {createAccountForm} from "../accountForm.svelte";

    interface Props {
        /** The button the window grows out of. */
        anchor: () => HTMLElement | undefined;
        /** The window was told to close and is shrinking back into its button. */
        onclosing?: () => void;
        onreopening?: () => void;
        /** The window is back in its button: remove it. */
        onclosed: () => void;
    }

    let {anchor, onclosing, onreopening, onclosed}: Props = $props();

    const TABS = [
        {label: "Microsoft", icon: "microsoft"},
        {label: "TheAltening", icon: "altening"},
        {label: "Cracked", icon: "cracked"},
        {label: "Session", icon: "session"}
    ] as const;
    const STORAGE_KEY = "altmanager_add_account_active_tab";

    let dialog: ReturnType<typeof IosDialog> | undefined = $state();
    let content: HTMLElement | undefined = $state();

    function savedTab(): number {
        const value = parseInt(localStorage.getItem(STORAGE_KEY) ?? "0");
        return Number.isInteger(value) && value >= 0 && value < TABS.length ? value : 0;
    }

    let tab = $state(savedTab());
    // which way the page slides in: from the side of the tab that was picked
    let direction = $state(1);
    let moved = $state(false);

    const form = createAccountForm("addition", () => dialog?.close());

    function changeTab(next: number) {
        if (next === tab) {
            return;
        }

        direction = next > tab ? 1 : -1;
        moved = true;
        tab = next;
        void setItem(STORAGE_KEY, String(next)).catch(() => {
            // only a convenience
        });
    }

    function onOpened() {
        content?.querySelector<HTMLInputElement>(".page.on input")?.focus({preventScroll: true});
    }
</script>

<IosDialog bind:this={dialog}
           title="Add Account"
           {anchor}
           size={{width: 540, height: 452}}
           onopened={onOpened}
           {onclosing}
           {onreopening}
           {onclosed}>
    <IosTabBar tabs={[...TABS]} width="400px" label="Account type" value={tab} onchange={changeTab}/>

    <div class="content" bind:this={content} style:--dir={direction}>
        <div class="page" class:on={tab === 0} class:moved><MicrosoftTab busy={form.busy} run={form.run}/></div>
        <div class="page" class:on={tab === 1} class:moved><TheAlteningAccountTab busy={form.busy} run={form.run}/></div>
        <div class="page" class:on={tab === 2} class:moved><CrackedAccountTab busy={form.busy} run={form.run}/></div>
        <div class="page" class:on={tab === 3} class:moved><SessionAccountTab busy={form.busy} run={form.run}/></div>
    </div>

    <p class="status" class:error={form.status.error} role="status" aria-live="polite">{form.status.text}</p>
</IosDialog>

<style>
    .content {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
    }

    .page {
        flex: 1;
        min-height: 0;
        display: none;
        flex-direction: column;
    }

    .page.on {
        display: flex;
    }

    .page.on.moved {
        animation: page-in 0.34s cubic-bezier(0.22, 1, 0.36, 1);
    }

    @keyframes page-in {
        from {
            opacity: 0;
            transform: translateX(calc(var(--dir) * 22px));
        }
        to {
            opacity: 1;
            transform: none;
        }
    }

    /* one line, always there, so the window does not change height when a message comes */
    .status {
        flex: none;
        height: 17px;
        margin: -4px 0 0;
        padding: 0 4px;
        text-align: center;
        font-size: 13px;
        line-height: 17px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--ios-text-dim);
    }

    .status.error {
        color: var(--ios-danger);
    }

    @media (prefers-reduced-motion: reduce) {
        .page.on.moved {
            animation: none;
        }
    }
</style>
