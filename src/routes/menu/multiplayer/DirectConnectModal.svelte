<!--
    Direct Connect in the iOS style: a window that grows out of the Direct Connect button (see IosDialog). Type an address and join.
    The address is remembered for the next time. Mounted by Multiplayer.svelte while it is open, and removed in `onclosed`.
-->
<script lang="ts">
    import IosDialog from "../ios/IosDialog.svelte";
    import IosField from "../ios/IosField.svelte";
    import IosButton from "../ios/IosButton.svelte";
    import {connectToServer} from "../../../integration/rest";
    import {setItem} from "../../../integration/persistent_storage";

    interface Props {
        /** The button the window grows out of. */
        anchor: () => HTMLElement | undefined;
        /** The window was told to close and is shrinking back into its button. */
        onclosing?: () => void;
        onreopening?: () => void;
        /** The window is back in its button: remove it. */
        onclosed: () => void;
    }

    let {anchor, onclosing, onreopening, onclosed}: Props = $props();

    let dialog: ReturnType<typeof IosDialog> | undefined = $state();
    let field: HTMLInputElement | undefined = $state();
    let address = $state(localStorage.getItem("multiplayer_direct_connect_address") ?? "");

    const disabled = $derived(address.trim().length === 0);

    async function connect() {
        if (disabled) {
            return;
        }

        const target = address.trim();
        address = target;
        dialog?.close();
        try {
            await setItem("multiplayer_direct_connect_address", target);
        } catch (error) {
            // only a convenience (the address is offered again next time): a failure here used to cancel the connect itself
            console.warn("[DirectConnect] could not remember the address", error);
        }
        await connectToServer(target);
    }
</script>

<IosDialog bind:this={dialog}
           title="Direct Connect"
           {anchor}
           size={{width: 540, height: 252}}
           onopened={() => field?.focus({preventScroll: true})}
           {onclosing}
           {onreopening}
           {onclosed}>
    <IosField label="Address" placeholder="play.example.com" bind:value={address} bind:element={field} onenter={connect}/>
    <p class="hint">Joins right away. The server is not added to your list.</p>

    <div class="actions">
        <IosButton variant="primary" {disabled} onclick={connect}>Join Server</IosButton>
    </div>
</IosDialog>

<style>
    .hint {
        margin: -6px 0 0;
        padding: 0 4px;
        font-size: 13px;
        line-height: 17px;
        color: var(--ios-text-dim);
    }

    .actions {
        margin-top: auto;
        display: grid;
    }
</style>
