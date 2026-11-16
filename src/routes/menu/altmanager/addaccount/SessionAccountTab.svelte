<!-- Add Account > Session: an account from a session (access) token. -->
<script lang="ts">
    import IosPane from "../../ios/IosPane.svelte";
    import IosField from "../../ios/IosField.svelte";
    import IosButton from "../../ios/IosButton.svelte";
    import {addSessionAccount} from "../../../../integration/rest";

    interface Props {
        busy: boolean;
        run: (job: () => Promise<unknown>, watchdogMs?: number) => void;
    }

    let {busy, run}: Props = $props();

    let token = $state("");

    const disabled = $derived(busy || token.trim().length === 0);

    function add() {
        if (!disabled) {
            run(() => addSessionAccount(token.trim()));
        }
    }
</script>

<IosPane>
    <IosField label="Session ID" placeholder="Session token" bind:value={token} onenter={add}/>
    <p class="hint">Adds the account the session token belongs to.</p>

    {#snippet actions()}
        <IosButton variant="primary" {disabled} onclick={add}>{busy ? "Adding…" : "Add Account"}</IosButton>
    {/snippet}
</IosPane>
