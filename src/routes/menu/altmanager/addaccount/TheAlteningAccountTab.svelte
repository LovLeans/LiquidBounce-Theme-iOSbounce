<!-- Add Account > TheAltening: an account from an API token. -->
<script lang="ts">
    import IosPane from "../../ios/IosPane.svelte";
    import IosField from "../../ios/IosField.svelte";
    import IosButton from "../../ios/IosButton.svelte";
    import {addAlteningAccount, browse} from "../../../../integration/rest";

    interface Props {
        busy: boolean;
        run: (job: () => Promise<unknown>, watchdogMs?: number) => void;
    }

    let {busy, run}: Props = $props();

    let token = $state("");

    const disabled = $derived(busy || token.trim().length === 0);

    function add() {
        if (!disabled) {
            run(() => addAlteningAccount(token.trim()));
        }
    }
</script>

<IosPane>
    <IosField label="Token" placeholder="Account token" bind:value={token} onenter={add}/>
    <p class="hint">Paste a token from thealtening.com to add its account.</p>

    {#snippet actions()}
        <IosButton variant="primary" {disabled} onclick={add}>{busy ? "Adding…" : "Add Account"}</IosButton>
        <IosButton onclick={() => browse("THE_ALTENING")}>Get Account Token</IosButton>
    {/snippet}
</IosPane>
