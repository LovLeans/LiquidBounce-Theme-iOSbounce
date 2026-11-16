<!--
    Add Server in the iOS style: a window that grows out of the Add Server button (see IosDialog). Mounted by Multiplayer.svelte
    while it is open, and removed in `onclosed`; `onadded` comes once the server is saved, so the list can be reloaded.
-->
<script lang="ts">
    import IosDialog from "../ios/IosDialog.svelte";
    import IosField from "../ios/IosField.svelte";
    import IosSegmented from "../ios/IosSegmented.svelte";
    import IosButton from "../ios/IosButton.svelte";
    import {addServer as restAddServer} from "../../../integration/rest";

    interface Props {
        /** The button the window grows out of. */
        anchor: () => HTMLElement | undefined;
        /** The server was saved. */
        onadded?: () => void;
        /** The window was told to close and is shrinking back into its button. */
        onclosing?: () => void;
        onreopening?: () => void;
        /** The window is back in its button: remove it. */
        onclosed: () => void;
    }

    let {anchor, onadded, onclosing, onreopening, onclosed}: Props = $props();

    let dialog: ReturnType<typeof IosDialog> | undefined = $state();
    let nameField: HTMLInputElement | undefined = $state();
    let name = $state("Minecraft Server");
    let address = $state("");
    let resourcePackPolicy = $state("Prompt");
    let busy = $state(false);

    const disabled = $derived(busy || address.trim().length === 0 || name.length === 0);

    async function addServer() {
        if (disabled) {
            return;
        }

        busy = true;
        try {
            await restAddServer(name, address.trim(), resourcePackPolicy);
            onadded?.();
            dialog?.close();
        } catch (error) {
            // the dialog stays open so the entry can be tried again (was an unhandled rejection)
            console.warn("[AddServer] the client did not add the server", error);
        } finally {
            busy = false;
        }
    }
</script>

<IosDialog bind:this={dialog}
           title="Add Server"
           {anchor}
           size={{width: 540, height: 372}}
           onopened={() => nameField?.focus({preventScroll: true})}
           {onclosing}
           {onreopening}
           {onclosed}>
    <IosField label="Name" placeholder="Minecraft Server" bind:value={name} bind:element={nameField} onenter={addServer}/>
    <IosField label="Address" placeholder="play.example.com" bind:value={address} onenter={addServer}/>
    <IosSegmented label="Server Resource Packs" options={["Prompt", "Enabled", "Disabled"]} bind:value={resourcePackPolicy}/>

    <div class="actions">
        <IosButton variant="primary" {disabled} onclick={addServer}>Add Server</IosButton>
    </div>
</IosDialog>

<style>
    .actions {
        margin-top: auto;
        display: grid;
    }
</style>
