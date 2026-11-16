<!-- Add Account > Microsoft > Credentials: e-mail and password. -->
<script lang="ts">
    import IosPane from "../../../ios/IosPane.svelte";
    import IosField from "../../../ios/IosField.svelte";
    import IosButton from "../../../ios/IosButton.svelte";
    import {addMicrosoftAccountCredentials} from "../../../../../integration/rest";

    interface Props {
        busy: boolean;
        run: (job: () => Promise<unknown>, watchdogMs?: number) => void;
    }

    let {busy, run}: Props = $props();

    let email = $state("");
    let password = $state("");

    const disabled = $derived(busy || email.trim().length === 0 || password.length === 0);

    function add() {
        if (!disabled) {
            run(() => addMicrosoftAccountCredentials(email.trim(), password));
        }
    }
</script>

<IosPane>
    <IosField label="E-Mail" placeholder="name@example.com" bind:value={email} onenter={add}/>
    <IosField label="Password" type="password" placeholder="Password" bind:value={password} onenter={add}/>

    {#snippet actions()}
        <IosButton variant="primary" {disabled} onclick={add}>{busy ? "Linking…" : "Link Account"}</IosButton>
    {/snippet}
</IosPane>
