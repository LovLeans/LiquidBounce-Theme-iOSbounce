<!-- Add Account > Microsoft: the three ways to sign in, picked with a segmented control. All three stay mounted, so what was typed stays. -->
<script lang="ts">
    import IosSegmented from "../../../ios/IosSegmented.svelte";
    import WebViewTab from "./WebViewTab.svelte";
    import DeviceCodeTab from "./DeviceCodeTab.svelte";
    import CredentialsTab from "./CredentialsTab.svelte";

    interface Props {
        busy: boolean;
        run: (job: () => Promise<unknown>, watchdogMs?: number) => void;
    }

    let {busy, run}: Props = $props();

    const METHODS = ["Web View", "Device Code", "Credentials"];
    let method = $state(METHODS[0]);
</script>

<div class="microsoft">
    <IosSegmented options={METHODS} bind:value={method}/>

    <div class="sub" class:on={method === METHODS[0]}><WebViewTab {busy} {run}/></div>
    <div class="sub" class:on={method === METHODS[1]}><DeviceCodeTab {busy} {run}/></div>
    <div class="sub" class:on={method === METHODS[2]}><CredentialsTab {busy} {run}/></div>
</div>

<style>
    .microsoft {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 14px;
    }

    .sub {
        flex: 1;
        min-height: 0;
        display: none;
        flex-direction: column;
    }

    .sub.on {
        display: flex;
    }
</style>
