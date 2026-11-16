<!-- Add Account > Microsoft > Web View: sign in in a browser window of the client. -->
<script lang="ts">
    import IosPane from "../../../ios/IosPane.svelte";
    import IosButton from "../../../ios/IosButton.svelte";
    import {addMicrosoftAccountWebView} from "../../../../../integration/rest";

    interface Props {
        busy: boolean;
        run: (job: () => Promise<unknown>, watchdogMs?: number) => void;
    }

    let {busy, run}: Props = $props();
</script>

<IosPane>
    <p class="hint">Opens the Microsoft sign-in in a window. The account is added when you are signed in.</p>

    {#snippet actions()}
        <IosButton variant="primary" disabled={busy} onclick={() => run(() => addMicrosoftAccountWebView(), 60000)}>
            {busy ? "Waiting for sign-in…" : "Sign in with web view"}
        </IosButton>
    {/snippet}
</IosPane>
