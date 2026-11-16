<!--
    ViaFabricPlus in the iOS style: a window that grows out of the ViaFabricPlus button (see IosDialog). Pick the protocol version
    the client joins servers with.

    Uses the client's /client/protocols endpoints (the same ones the HUD watermark uses). The list is loaded every time the dialog
    opens, so it always shows the version that is really selected, and the list scrolls to it. Picking a version applies it right
    away and shrinks the window back. Mounted by Multiplayer.svelte while it is open, and removed in `onclosed`.
-->
<script lang="ts">
    import {onMount, tick} from "svelte";
    import IosDialog from "../ios/IosDialog.svelte";
    import IosSearch from "../ios/IosSearch.svelte";
    import IosScrollList from "../ios/IosScrollList.svelte";
    import type {SmoothScroll} from "../ios/scrollPhysics";
    import {REST_BASE} from "../../../integration/host";
    import type {Protocol} from "../../../integration/types";

    // Same base as integration/rest.ts (its API_BASE is not exported).
    const API_BASE = `${REST_BASE}/api/v1`;

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
    let scroller: SmoothScroll | undefined = $state();
    let search: HTMLInputElement | undefined = $state();
    let rowElements: Record<number, HTMLElement | undefined> = $state({});

    let protocols = $state<Protocol[]>([]);
    let selectedVersion = $state<number | null>(null);
    let loading = $state(true);
    /** How many versions the client sent, before any filtering (shown when the list looks too short). */
    let receivedCount = $state(0);
    /** What went wrong, shown in the dialog (so it can be read without opening the console). */
    let problem = $state("");
    let query = $state("");
    let opened = false;
    let choosing = false;

    function rowKey(protocol: Protocol): string {
        return `${protocol.version}|${protocol.name}`;
    }

    /** The row that shows the check: the first one with the selected version (releases can share a protocol number). */
    const selectedEntry = $derived(selectedVersion === null ? undefined : protocols.find((protocol) => protocol.version === selectedVersion));

    const needle = $derived(query.trim().toLowerCase());
    const filtered = $derived(
        needle
            ? protocols.filter((protocol) => protocol.name.toLowerCase().includes(needle) || String(protocol.version).includes(needle))
            : protocols
    );

    onMount(() => {
        void loadProtocols();
    });

    /** Calls the client and fails loudly (with the HTTP status) instead of handing back an error body as data. */
    async function request<T>(path: string, init?: RequestInit): Promise<T> {
        const response = await fetch(`${API_BASE}/client/${path}`, init);
        if (!response.ok) {
            // The client's error body usually names the real cause of a 500, so it is shown too (shortened).
            const detail = (await response.text().catch(() => "")).trim().slice(0, 200);
            throw new Error(`/client/${path} answered HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
        }

        const text = await response.text();
        return (text ? JSON.parse(text) : undefined) as T;
    }

    async function loadProtocols() {
        try {
            const list = await request<Protocol[]>("protocols");
            if (!Array.isArray(list)) {
                throw new Error("/client/protocols did not return a list");
            }
            receivedCount = list.length;
            console.info("[ViaFabricPlus] The client sent these protocol versions:", list);
            // Only exact repeats (same version AND name) are dropped: several releases share one protocol number (1.21 / 1.21.1, ...), and
            // those must all stay in the list.
            const seen = new Set<string>();
            protocols = list.filter((protocol) => {
                const key = rowKey(protocol);
                return !seen.has(key) && seen.add(key);
            });
        } catch (error) {
            console.error("[ViaFabricPlus] Could not load the protocol versions:", error);
            protocols = [];
            problem = `Could not load the versions (${error instanceof Error ? error.message : error}).`;
        }

        // Only used to highlight the current version, the list works without it.
        try {
            const current = await request<Protocol>("protocols/protocol");
            selectedVersion = current?.version ?? null;
        } catch (error) {
            console.warn("[ViaFabricPlus] Could not read the selected protocol:", error);
            selectedVersion = null;
        }

        loading = false;
        await tick();
        revealSelected();
    }

    /** Scrolls the selected version into view, once the list is there and the window has finished growing. */
    function revealSelected() {
        if (!opened || loading || selectedVersion === null) {
            return;
        }

        const row = rowElements[selectedVersion];
        if (row) {
            scroller?.scrollIntoView(row);
        }
    }

    function onOpened() {
        opened = true;
        // preventScroll: nothing may be nudged by the focus.
        search?.focus({preventScroll: true});
        revealSelected();
    }

    async function choose(protocol: Protocol) {
        if (choosing) {
            return;
        }

        // Already the selected version: nothing to apply (and the client may refuse to "switch" to the version it is on).
        if (protocol.version === selectedVersion) {
            problem = "";
            dialog?.close();
            return;
        }

        choosing = true;
        try {
            await request("protocols/protocol", {
                method: "PUT",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({version: protocol.version})
            });
        } catch (error) {
            console.error("[ViaFabricPlus] Could not select the protocol version:", error);
            problem = `Could not select ${protocol.name} (${error instanceof Error ? error.message : error}).`;
            choosing = false;
            return;
        }

        selectedVersion = protocol.version;
        dialog?.close();
    }
</script>

<IosDialog bind:this={dialog}
           title="ViaFabricPlus"
           {anchor}
           size={{width: 540, height: 700}}
           onopened={onOpened}
           {onclosing}
           {onreopening}
           {onclosed}>
    <IosSearch bind:value={query} bind:element={search} label="Search version" placeholder="Search version"/>

    {#if problem && protocols.length > 0}
        <p class="hint error">{problem}</p>
    {/if}

    <IosScrollList label="Protocol versions" bind:scroller>
        {#if loading}
            <p class="hint">Loading…</p>
        {:else if protocols.length === 0}
            <p class="hint error">{problem || "No versions available. Is ViaFabricPlus installed?"}</p>
        {:else if filtered.length === 0}
            <p class="hint">No matching version</p>
        {:else}
            {#each filtered as protocol (rowKey(protocol))}
                {@const current = protocol === selectedEntry}
                <button class="entry"
                        class:selected={current}
                        bind:this={rowElements[protocol.version]}
                        type="button"
                        role="option"
                        aria-selected={current}
                        onclick={() => choose(protocol)}>
                    <span class="name">{protocol.name}</span>
                    {#if current}
                        <svg class="check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-label="Selected">
                            <path d="M4.5 12.5l5 5 10-11"></path>
                        </svg>
                    {/if}
                </button>
            {/each}
            {#if protocols.length <= 1 && !needle}
                <p class="hint">The client sent {receivedCount} version{receivedCount === 1 ? "" : "s"}. If you expected more, the problem is on
                    the client / ViaFabricPlus side (check the versions of both mods).</p>
            {/if}
        {/if}
    </IosScrollList>
</IosDialog>

<style>
    /* A row of the list: the look of the rows of the server list, without the icon tile. */
    .entry {
        width: 100%;
        height: 48px;
        box-sizing: border-box;
        margin-bottom: 3px;
        padding: 0 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        border: 0;
        border-radius: 14px;
        font-family: inherit;
        font-size: 16px;
        font-weight: 600;
        text-align: left;
        color: var(--ios-text);
        cursor: pointer;
        background: var(--ios-row);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
        -webkit-tap-highlight-color: transparent;
        touch-action: none;
        transition: transform 0.55s cubic-bezier(0.34, 1.7, 0.5, 1), filter 0.35s ease-out, background 0.15s;
    }

    .entry:hover {
        background: rgba(255, 255, 255, 0.09);
    }

    .entry:active {
        transform: scale(0.965);
        filter: brightness(0.82);
        transition: transform 0.1s cubic-bezier(0.2, 0.8, 0.3, 1), filter 0.1s ease-out, background 0.15s;
    }

    .entry.selected {
        background: var(--ios-row-selected);
        box-shadow: inset 0 0 0 2px var(--ios-accent);
    }

    .entry:focus-visible {
        outline: 3px solid #ffffff;
        outline-offset: 2px;
    }

    .name {
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .check {
        flex: none;
        color: color-mix(in srgb, var(--ios-accent) 65%, #ffffff);
    }

    .hint {
        margin: 0;
        padding: 18px 10px;
        font-size: 15px;
        color: var(--ios-text-dim);
    }

    .hint.error {
        color: var(--ios-danger);
    }
</style>
