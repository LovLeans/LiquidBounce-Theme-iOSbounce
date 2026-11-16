<!-- Direct Login > Cracked: log in as an offline name right away, nothing is saved. -->
<script lang="ts">
    import IosPane from "../../ios/IosPane.svelte";
    import IosField from "../../ios/IosField.svelte";
    import IosToggleRow from "../../ios/IosToggleRow.svelte";
    import IosRandomButton from "../../ios/IosRandomButton.svelte";
    import IosButton from "../../ios/IosButton.svelte";
    import {directLoginToCrackedAccount} from "../../../../integration/rest";
    import {generateUsername} from "../../../../util/random_username";

    interface Props {
        busy: boolean;
        run: (job: () => Promise<unknown>, watchdogMs?: number) => void;
    }

    let {busy, run}: Props = $props();

    let username = $state("");
    let online = $state(false);

    // Minecraft's own rule for a name
    const valid = $derived(/^[A-Za-z0-9_]{1,16}$/.test(username));
    const disabled = $derived(busy || !valid);

    function login() {
        if (!disabled) {
            run(() => directLoginToCrackedAccount(username, online));
        }
    }
</script>

<IosPane>
    <IosField label="Username" placeholder="Steve" maxlength={16} invalid={username.length > 0 && !valid} bind:value={username}
              onenter={login}>
        {#snippet trailing()}
            <IosRandomButton onclick={() => (username = generateUsername())}/>
        {/snippet}
    </IosField>
    <IosToggleRow label="Use online UUID" bind:value={online}/>

    {#snippet actions()}
        <IosButton variant="primary" {disabled} onclick={login}>{busy ? "Logging in…" : "Login"}</IosButton>
    {/snippet}
</IosPane>
