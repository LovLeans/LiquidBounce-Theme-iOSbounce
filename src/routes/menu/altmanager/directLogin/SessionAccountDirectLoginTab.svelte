<!-- Direct Login > Session: log in with a session token right away, nothing is saved. -->
<script lang="ts">
    import IosPane from "../../ios/IosPane.svelte";
    import IosField from "../../ios/IosField.svelte";
    import IosButton from "../../ios/IosButton.svelte";
    import {directLoginToSessionAccount} from "../../../../integration/rest";

    interface Props {
        busy: boolean;
        run: (job: () => Promise<unknown>, watchdogMs?: number) => void;
    }

    let {busy, run}: Props = $props();

    let token = $state("");

    const disabled = $derived(busy || token.trim().length === 0);

    function login() {
        if (!disabled) {
            run(() => directLoginToSessionAccount(token.trim()));
        }
    }
</script>

<IosPane>
    <IosField label="Session ID" placeholder="Session token" bind:value={token} onenter={login}/>

    {#snippet actions()}
        <IosButton variant="primary" {disabled} onclick={login}>{busy ? "Logging in…" : "Login"}</IosButton>
    {/snippet}
</IosPane>
