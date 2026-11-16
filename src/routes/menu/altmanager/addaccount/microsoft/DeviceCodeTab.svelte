<!-- Add Account > Microsoft > Device Code: sign in on another device (or browser) with a code. -->
<script lang="ts">
    import IosPane from "../../../ios/IosPane.svelte";
    import IosButton from "../../../ios/IosButton.svelte";
    import {addMicrosoftAccountDeviceCode, addMicrosoftAccountDeviceCodeCopyUrl} from "../../../../../integration/rest";

    interface Props {
        busy: boolean;
        run: (job: () => Promise<unknown>, watchdogMs?: number) => void;
    }

    let {busy, run}: Props = $props();
</script>

<IosPane>
    <p class="hint">Gives you a code to enter on Microsoft's device login page, on any device. Copy URL copies that page's address.</p>

    {#snippet actions()}
        <IosButton variant="primary" disabled={busy} onclick={() => run(() => addMicrosoftAccountDeviceCode(), 60000)}>
            {busy ? "Waiting for the code…" : "Link Account"}
        </IosButton>
        <!-- not behind `busy`: it is used while the code flow is waiting -->
        <IosButton onclick={() => void addMicrosoftAccountDeviceCodeCopyUrl().catch((error) => console.warn("[AddAccount] copy url failed", error))}>
            Copy URL
        </IosButton>
    {/snippet}
</IosPane>
