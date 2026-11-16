<!--
    Edit Server in the iOS style: a window that grows out of the Edit button (see IosDialog). Mounted by Multiplayer.svelte while
    it is open, and removed in `onclosed`; `onedited` comes once the changes are saved, so the list can be reloaded.
-->
<script lang="ts">
    import IosDialog from "../ios/IosDialog.svelte";
    import IosField from "../ios/IosField.svelte";
    import IosSegmented from "../ios/IosSegmented.svelte";
    import IosButton from "../ios/IosButton.svelte";
    import {editServer as editServerRest} from "../../../integration/rest";

    const POLICIES = ["Prompt", "Enabled", "Disabled"];

    interface Props {
        /** The button the window grows out of. */
        anchor: () => HTMLElement | undefined;
        id: number;
        name: string;
        address: string;
        resourcePackPolicy: string;
        /** The changes were saved. */
        onedited?: () => void;
        /** The window was told to close and is shrinking back into its button. */
        onclosing?: () => void;
        onreopening?: () => void;
        /** The window is back in its button: remove it. */
        onclosed: () => void;
    }

    let {anchor, id, name: initialName, address: initialAddress, resourcePackPolicy: initialPolicy, onedited, onclosing, onreopening, onclosed}: Props = $props();

    let dialog: ReturnType<typeof IosDialog> | undefined = $state();
    let nameField: HTMLInputElement | undefined = $state();
    // The server is read once, when the window opens: what is typed here is not overwritten while the list is reloaded behind it.
    let name = $state(initialName);
    let address = $state(initialAddress);
    let resourcePackPolicy = $state(POLICIES.find((policy) => policy.toLowerCase() === initialPolicy?.toLowerCase()) ?? initialPolicy);
    let busy = $state(false);

    const disabled = $derived(busy || address.trim().length === 0 || name.length === 0);

    async function editServer() {
        if (disabled) {
            return;
        }

        busy = true;
        try {
            await editServerRest(id, name, address.trim(), resourcePackPolicy);
            onedited?.();
            dialog?.close();
        } catch (error) {
            // the dialog stays open so the entry can be tried again (was an unhandled rejection)
            console.warn("[EditServer] the client did not save the server", error);
        } finally {
            busy = false;
        }
    }
</script>

<IosDialog bind:this={dialog}
           title="Edit Server"
           {anchor}
           size={{width: 540, height: 372}}
           onopened={() => nameField?.focus({preventScroll: true})}
           {onclosing}
           {onreopening}
           {onclosed}>
    <IosField label="Name" placeholder="Minecraft Server" bind:value={name} bind:element={nameField} onenter={editServer}/>
    <IosField label="Address" placeholder="play.example.com" bind:value={address} onenter={editServer}/>
    <IosSegmented label="Server Resource Packs" options={POLICIES} bind:value={resourcePackPolicy}/>

    <div class="actions">
        <IosButton variant="primary" {disabled} onclick={editServer}>Save</IosButton>
    </div>
</IosDialog>

<style>
    .actions {
        margin-top: auto;
        display: grid;
    }
</style>
