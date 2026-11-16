<!-- Add Account > Cracked: an offline account. A random name is one tap away. -->
<script lang="ts">
    import IosPane from "../../ios/IosPane.svelte";
    import IosField from "../../ios/IosField.svelte";
    import IosToggleRow from "../../ios/IosToggleRow.svelte";
    import IosRandomButton from "../../ios/IosRandomButton.svelte";
    import IosButton from "../../ios/IosButton.svelte";
    import {addCrackedAccount} from "../../../../integration/rest";
    import {generateUsername} from "../../../../util/random_username";

    interface Props {
        busy: boolean;
        run: (job: () => Promise<unknown>, watchdogMs?: number) => void;
    }

    let {busy, run}: Props = $props();

    let username = $state("");
    let online = $state(false);

    const disabled = $derived(busy || username.trim().length === 0);

    function add() {
        if (!disabled) {
            run(() => addCrackedAccount(username.trim(), online));
        }
    }
</script>

<IosPane>
    <IosField label="Username" placeholder="Steve" maxlength={16} bind:value={username} onenter={add}>
        {#snippet trailing()}
            <IosRandomButton onclick={() => (username = generateUsername())}/>
        {/snippet}
    </IosField>
    <IosToggleRow label="Use online UUID" bind:value={online}/>
    <p class="hint">An offline account: no password, any name. Online UUID gives the name's real skin and UUID.</p>

    {#snippet actions()}
        <IosButton variant="primary" {disabled} onclick={add}>{busy ? "Adding…" : "Add Account"}</IosButton>
    {/snippet}
</IosPane>
