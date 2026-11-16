<!--
    Multiplayer ("Play Multiplayer") in the iPadOS style. Same layout and actions as the vanilla screen:
    server list (top of the screen, with the LAN scan line at its end), then
    [Join Server][Direct Connect][Add Server][ViaFabricPlus] / [Edit][Delete][Refresh][Cancel][<username> (alts)][settings app]
    (snapped to the bottom). The alts button grows into the account manager (a window like the apps of the dock) and shrinks back.

    Drop-in replacement for src/routes/menu/multiplayer/Multiplayer.svelte of the LiquidBounce default theme.
    Direct Connect, Add Server, Edit and ViaFabricPlus open as windows that grow out of their own button, with the same motion as the
    alts window but as a centred window instead of a full screen (see ios/IosDialog.svelte).
-->
<script lang="ts">
    import {onDestroy, onMount, tick} from "svelte";
    import {
        connectToServer,
        getLanServers,
        getServers,
        getSession,
        openScreen,
        removeServer
    } from "../../../integration/rest";
    import {listen} from "../../../integration/ws";
    import {LB} from "../title/main-menu/bridge";
    import {fx} from "../title/main-menu/overlayfx";
    import {REST_BASE} from "../../../integration/host";
    import type {Server} from "../../../integration/types";
    import type {AccountManagerLoginEvent, ServerPingedEvent, SessionEvent} from "../../../integration/events";
    import TextComponent from "../common/TextComponent.svelte";
    import AddServerModal from "./AddServerModal.svelte";
    import DirectConnectModal from "./DirectConnectModal.svelte";
    import EditServerModal from "./EditServerModal.svelte";
    import ProtocolModal from "./ProtocolModal.svelte";
    import AltManager from "../altmanager/AltManager.svelte";
    import ExpandWindow from "../ios/ExpandWindow.svelte";
    import IosScreen from "../ios/IosScreen.svelte";
    import IosScrollList from "../ios/IosScrollList.svelte";
    import IosListRow from "../ios/IosListRow.svelte";
    import IosButton from "../ios/IosButton.svelte";
    import IosButtonGrid from "../ios/IosButtonGrid.svelte";
    import IosSettings from "../ios/IosSettings.svelte";
    import type {SmoothScroll} from "../ios/scrollPhysics";
    import {ReorderDrag} from "../ios/reorder";

    const unknownIcon = `${REST_BASE}/api/v1/client/resource?id=minecraft:textures/misc/unknown_server.png`;
    const BAR_HEIGHTS = [5, 7, 10, 12, 14];

    /** `key` is a stable identity of a saved server, so its row (and icon) survives a reorder or a refresh. */
    type ServerEntry = Server & {key?: number};

    let servers = $state<ServerEntry[]>([]);
    let nextKey = 0;
    let lanServers = $state<Server[]>([]);
    let selectedKey = $state<string | null>(null);
    let armedDelete = $state(false);
    let scroller = $state<SmoothScroll>();
    let rowElements: Record<string, HTMLElement | undefined> = $state({});

    // The dialogs: windows that grow out of the button that opens them. Each one is on its own: while one is shrinking back into
    // its button (it takes no clicks any more) the others can already be opened, and so can the alts window. A dialog that is
    // open covers the screen, so there is only ever one of them to close at a time.
    type DialogKind = "direct" | "add" | "edit" | "protocol";
    type DialogState = "closed" | "open" | "closing";
    let dialogs: Record<DialogKind, DialogState> = $state({direct: "closed", add: "closed", edit: "closed", protocol: "closed"});
    let dialogButtons: Record<DialogKind, HTMLElement | undefined> = $state({
        direct: undefined,
        add: undefined,
        edit: undefined,
        protocol: undefined
    });
    // The server the Edit window was opened for (the list may be reloaded behind it).
    let editTarget = $state<Server | null>(null);

    // The alts window: the account manager, grown out of the alts button. It lives inside this screen (not as a screen of its own), so
    // closing Multiplayer closes it with it, and a Multiplayer that is opened again always starts without it.
    let username = $state("");
    let altsButton = $state<HTMLElement>();
    let altsWindow: ReturnType<typeof ExpandWindow> | undefined = $state();
    let altsMounted = $state(false);
    let altsActive = $state(false);

    let drag: ReorderDrag | undefined;
    let armTimer: ReturnType<typeof setTimeout> | undefined;
    let lanPollInterval: ReturnType<typeof setInterval> | undefined;

    // The client answers the list request with every server still unpinged, then reports each ping result as an event, all
    // within a few frames. Applying them while the app window is still growing rebuilds every row (icon, MOTD, counts) in
    // the middle of the animation, which the animation answers with a freeze and a jump. So results are collected and
    // applied once the window has settled, in one pass instead of one per event (see `fx.settled`).
    let settled = $state(false);
    let destroyed = false;
    const pendingPings = new Map<string, Server>();
    let pingFlushFrame = 0;

    const entries = $derived([...servers, ...lanServers]);
    const selected = $derived(entries.find((server) => keyOf(server) === selectedKey));

    // Delete needs a second click; a different selection cancels it.
    $effect(() => {
        selectedKey;
        disarmDelete();
    });

    // Hold a server to drag it to a new place in the list (LAN servers cannot be moved).
    $effect(() => {
        if (!scroller) {
            return;
        }

        const instance = new ReorderDrag({
            scroller,
            rows: () => servers.map((server) => rowElements[keyOf(server)]).filter((el): el is HTMLElement => !!el),
            onDrop: reorderServers
        });
        drag = instance;

        return () => {
            instance.destroy();
            drag = undefined;
        };
    });

    // The client pings each server and reports the result as an event.
    listen("serverPinged", (event: ServerPingedEvent) => {
        pendingPings.set(event.server.address, event.server);
        schedulePingFlush();
    });

    // The name on the alts button follows the account the player is logged in with.
    listen("session", (event: SessionEvent) => {
        username = event.session?.username ?? username;
    });

    listen("accountManagerLogin", (event: AccountManagerLoginEvent) => {
        if (!event.error) {
            refreshSession();
        }
    });

    async function refreshSession() {
        try {
            username = (await getSession()).username ?? "";
        } catch {
            // keep the name that is shown
        }
    }

    function openAlts() {
        if (altsMounted) {
            return;
        }

        altsActive = true;
        altsMounted = true;
    }

    function altsClosed() {
        altsMounted = false;
        altsActive = false;
        refreshSession();
    }

    function schedulePingFlush() {
        if (!settled || pingFlushFrame) {
            return;
        }
        // One update per frame however many results arrive in it.
        pingFlushFrame = requestAnimationFrame(applyPings);
    }

    function applyPings() {
        pingFlushFrame = 0;
        if (destroyed || !settled || pendingPings.size === 0) {
            return;
        }

        // Results for servers that are not in the list (yet) stay for the next update.
        let applied = false;
        const next = servers.map((server) => {
            const pinged = pendingPings.get(server.address);
            if (!pinged) {
                return server;
            }
            applied = true;
            const clone: ServerEntry = structuredClone($state.snapshot(pinged));
            clone.id = server.id;
            clone.key = server.key;
            clone.name = server.name;
            clone.resourcePackPolicy = server.resourcePackPolicy;
            return clone;
        });

        if (applied) {
            for (const server of servers) {
                pendingPings.delete(server.address);
            }
            servers = next;
        }
    }

    onMount(() => {
        refreshServers();
        refreshSession();
        lanPollInterval = setInterval(refreshLanServers, 3000);

        void fx.settled().then(() => {
            if (destroyed) {
                return;
            }
            settled = true;
            applyPings();
        });
    });

    onDestroy(() => {
        destroyed = true;
        cancelAnimationFrame(pingFlushFrame);
        clearInterval(lanPollInterval);
        clearTimeout(armTimer);
    });

    function keyOf(server: ServerEntry): string {
        return server.lan ? `lan:${server.address}` : `srv:${server.key ?? server.id}`;
    }

    /** Gives every server a stable key, reusing the key of the same server (address + name) from before. */
    function withKeys(list: Server[], previous: ServerEntry[]): ServerEntry[] {
        const pool = [...previous];
        return list.map((server) => {
            const match = pool.findIndex((old) => old.address === server.address && old.name === server.name);
            const key = match >= 0 ? pool.splice(match, 1)[0].key ?? nextKey++ : nextKey++;
            return {...server, key};
        });
    }

    // Refresh pressed again while an earlier answer is still on its way: only the newest answer may write the list.
    let serversSequence = 0;

    async function refreshServers() {
        const sequence = ++serversSequence;
        try {
            // Note: the client reloads servers.dat and pings every server again for this request.
            const list = await getServers();
            if (destroyed || sequence !== serversSequence) {
                return;
            }
            servers = withKeys(list, $state.snapshot(servers));
        } catch (error) {
            // used to be an unhandled rejection (every caller is fire-and-forget); the list that is shown stays
            console.warn("[Multiplayer] could not read the server list", error);
            return;
        }
        // results that arrived before the list did
        schedulePingFlush();
        await refreshLanServers();
    }

    async function refreshLanServers() {
        try {
            const next = await getLanServers();
            if (destroyed) {
                return;
            }
            // Polled every 3 s: replacing the list with identical but new objects made every row update each time. Only touch it
            // (and so the rows) when something changed.
            if (JSON.stringify(next) !== JSON.stringify($state.snapshot(lanServers))) {
                lanServers = next;
            }
        } catch {
            // the client is busy or gone: keep the list that is shown, the next poll tries again
        }
    }

    /** Vanilla's ping thresholds. 0 bars = unreachable. */
    function pingBars(ping: number): number {
        if (ping <= 0) return 0;
        if (ping < 150) return 5;
        if (ping < 300) return 4;
        if (ping < 600) return 3;
        if (ping < 1000) return 2;
        return 1;
    }

    function barColor(bars: number): string {
        return bars >= 4 ? "var(--success-color, #30d158)" : bars === 3 ? "var(--warning-color, #ffd60a)" : "#ff9f0a";
    }

    function startReorder(server: Server, index: number, event: PointerEvent) {
        drag?.begin(index, event);
        if (drag?.active) {
            // Select the held server, but don't scroll: the list must stay where the user is dragging.
            selectedKey = keyOf(server);
        }
    }

    /** `from` / `to` are positions among the saved servers. Shows the new order at once, then saves it. */
    async function reorderServers(from: number, to: number) {
        // order[newPosition] = old position, which is what the client's /servers/order expects.
        const order = servers.map((_, index) => index);
        order.splice(from, 1);
        order.splice(to, 0, from);

        // Same servers, same keys (so the rows and their icons stay as they are), only the order and ids change.
        // Nothing is reloaded from the client: that would drop every cached ping and icon.
        const previous = $state.snapshot(servers);
        servers = order.map((oldIndex, newIndex) => ({...previous[oldIndex], id: newIndex}));

        // Resolves once the list shows the new order (the drag removes its temporary styles right after).
        await tick();

        saveOrder(from, to, order).catch((error) => {
            console.error("[Multiplayer] Could not save the new server order, putting it back:", error);
            servers = previous;
        });
    }

    async function saveOrder(from: number, to: number, order: number[]) {
        const base = `${REST_BASE}/api/v1/client/servers`;
        const post = (path: string, body: unknown) =>
            fetch(`${base}/${path}`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(body)
            });

        const response = await post("order", {order});
        if (response.ok) {
            return;
        }

        // Older clients only have /swap: make the same move as a series of neighbour swaps.
        const step = to > from ? 1 : -1;
        for (let i = from; i !== to; i += step) {
            const swap = await post("swap", {from: i, to: i + step});
            if (!swap.ok) {
                throw new Error(`/servers/order answered ${response.status}, /servers/swap answered ${swap.status}`);
            }
        }
    }

    function select(server: Server) {
        const key = keyOf(server);
        selectedKey = key;
        const element = rowElements[key];
        if (element) {
            scroller?.scrollIntoView(element);
        }
    }

    function join(server: Server | undefined = selected) {
        if (server) {
            connectToServer(server.address);
        }
    }

    function openDialog(kind: DialogKind) {
        if (dialogs[kind] !== "closed") {
            return;
        }

        if (kind === "edit") {
            if (!selected || selected.lan) {
                return;
            }
            editTarget = $state.snapshot(selected) as Server;
        }

        dialogs[kind] = "open";
    }

    function dialogClosing(kind: DialogKind) {
        dialogs[kind] = "closing";
    }

    // a press on the shrinking window turned it around: it is open again
    function dialogReopened(kind: DialogKind) {
        dialogs[kind] = "open";
    }

    function dialogClosed(kind: DialogKind) {
        dialogs[kind] = "closed";
        if (kind === "edit") {
            editTarget = null;
        }
    }

    function disarmDelete() {
        clearTimeout(armTimer);
        armedDelete = false;
    }

    async function remove() {
        if (!selected || selected.lan) {
            return;
        }

        if (!armedDelete) {
            armedDelete = true;
            armTimer = setTimeout(() => (armedDelete = false), 3000);
            return;
        }

        const id = selected.id;
        disarmDelete();
        try {
            await removeServer(id);
        } catch (error) {
            console.warn("[Multiplayer] remove failed", error);
            return;
        }
        selectedKey = null;
        await refreshServers();
    }

    function onKeyDown(e: KeyboardEvent) {
        // A window that is shrinking away no longer owns the keyboard.
        if (altsActive || Object.values(dialogs).includes("open")) {
            return;
        }

        // Sliders and buttons use these keys themselves.
        if (e.target instanceof HTMLButtonElement || (e.target instanceof HTMLInputElement && e.target.type === "range")) {
            return;
        }

        if ((e.key === "ArrowDown" || e.key === "ArrowUp") && entries.length > 0) {
            e.preventDefault();
            const index = entries.findIndex((server) => keyOf(server) === selectedKey);
            const next = e.key === "ArrowDown" ? Math.min(entries.length - 1, index + 1) : Math.max(0, index - 1);
            select(entries[next]);
        } else if (e.key === "Enter" && !(e.target instanceof HTMLInputElement)) {
            join();
        }
    }
</script>

<svelte:window onkeydown={onKeyDown}/>

<!-- What the alts button shows, on the button and on its window while that is still small: "Atlas217836 (alts)". -->
{#snippet altsLabel()}
    <span class="alts">
        {#if username}
            <span class="alts-name">{username}</span><span class="alts-tag">(alts)</span>
        {:else}
            <span class="alts-tag">Alts</span>
        {/if}
    </span>
{/snippet}

<IosScreen>
    <IosScrollList label="Servers" bind:scroller>
        {#each entries as server, index (keyOf(server))}
            {@const bars = pingBars(server.ping)}
            <IosListRow
                    alignTop
                    bind:element={rowElements[keyOf(server)]}
                    selected={keyOf(server) === selectedKey}
                    image={server.ping <= 0 || !server.icon ? unknownIcon : `data:image/png;base64,${server.icon}`}
                    onselect={() => select(server)}
                    onhold={server.lan ? undefined : (event) => startReorder(server, index, event)}
                    onactivate={() => {
                        select(server);
                        join(server);
                    }}>
                <span class="ios-title">{server.name}</span>
                <div class="motd">
                    <TextComponent allowPreformatting={true}
                                   preFormattingMonospace={false}
                                   fontSize={13}
                                   textComponent={server.ping > 0 ? server.label : settled ? "§CCan't connect to server" : "§7Pinging..."}/>
                </div>

                {#snippet trailing()}
                    {#if server.lan}
                        <span class="tag">LAN</span>
                    {/if}
                    {#if server.ping > 0}
                        <span class="count">{server.players.online}/{server.players.max}</span>
                    {/if}
                    <span class="bars" role="img" aria-label={server.ping > 0 ? `Ping ${server.ping} ms` : "No connection"}
                          title={server.ping > 0 ? `${server.ping} ms` : "No connection"}>
                        {#each BAR_HEIGHTS as height, i}
                            <span class="bar" style:height="{height}px"
                                  style:background={i < bars ? barColor(bars) : "rgba(255, 255, 255, 0.22)"}></span>
                        {/each}
                    </span>
                {/snippet}
            </IosListRow>
        {/each}

        {#snippet footer()}
            <div class="scan" role="status">
                <span>Scanning for games on your local network</span>
                <span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>
            </div>
        {/snippet}
    </IosScrollList>

    <div class="bottom">
        <IosButtonGrid columns={4}>
            <IosButton variant="primary" disabled={!selected} onclick={() => join()}>Join Server</IosButton>
            <IosButton bind:element={dialogButtons.direct} onclick={() => openDialog("direct")}>Direct Connect</IosButton>
            <IosButton bind:element={dialogButtons.add} onclick={() => openDialog("add")}>Add Server</IosButton>
            <IosButton bind:element={dialogButtons.protocol} onclick={() => openDialog("protocol")}>ViaFabricPlus</IosButton>
        </IosButtonGrid>

        <IosButtonGrid template="repeat(4, minmax(0, 1fr)) minmax(0, 1.9fr) 45px">
            <IosButton bind:element={dialogButtons.edit} disabled={!selected || selected.lan} onclick={() => openDialog("edit")}>Edit</IosButton>
            <IosButton variant="danger" disabled={!selected || selected.lan} onclick={remove}>
                {armedDelete ? "Click to confirm" : "Delete"}
            </IosButton>
            <IosButton onclick={refreshServers}>Refresh</IosButton>
            <IosButton onclick={() => LB.leaveScreen("multiplayer", () => openScreen("title"))}>Cancel</IosButton>
            <IosButton bind:element={altsButton} strength={0.3} title="Account manager" onclick={openAlts}>
                {@render altsLabel()}
            </IosButton>
            <IosSettings/>
        </IosButtonGrid>
    </div>

    {#if dialogs.direct !== "closed"}
        <DirectConnectModal anchor={() => dialogButtons.direct}
                            onclosing={() => dialogClosing("direct")}
                            onreopening={() => dialogReopened("direct")}
                            onclosed={() => dialogClosed("direct")}/>
    {/if}
    {#if dialogs.add !== "closed"}
        <AddServerModal anchor={() => dialogButtons.add}
                        onadded={refreshServers}
                        onclosing={() => dialogClosing("add")}
                        onreopening={() => dialogReopened("add")}
                        onclosed={() => dialogClosed("add")}/>
    {/if}
    {#if dialogs.edit !== "closed" && editTarget}
        <EditServerModal anchor={() => dialogButtons.edit}
                         id={editTarget.id}
                         name={editTarget.name}
                         address={editTarget.address}
                         resourcePackPolicy={editTarget.resourcePackPolicy}
                         onedited={refreshServers}
                         onclosing={() => dialogClosing("edit")}
                         onreopening={() => dialogReopened("edit")}
                         onclosed={() => dialogClosed("edit")}/>
    {/if}
    {#if dialogs.protocol !== "closed"}
        <ProtocolModal anchor={() => dialogButtons.protocol}
                       onclosing={() => dialogClosing("protocol")}
                       onreopening={() => dialogReopened("protocol")}
                       onclosed={() => dialogClosed("protocol")}/>
    {/if}

    {#if altsMounted}
        <ExpandWindow bind:this={altsWindow}
                      anchor={() => altsButton}
                      label={altsLabel}
                      onclosing={() => (altsActive = false)}
                      onreopening={() => (altsActive = true)}
                      onclosed={altsClosed}>
            <AltManager active={altsActive} onclose={() => altsWindow?.close()}/>
        </ExpandWindow>
    {/if}
</IosScreen>

<style>
    .bottom {
        flex: none;
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    /* the name gives way (with an ellipsis) when it is long, "(alts)" always stays */
    .alts {
        display: flex;
        justify-content: center;
        min-width: 0;
        max-width: 100%;
        white-space: nowrap;
    }

    .alts-name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .alts-tag {
        flex: none;
    }

    /* a space would be trimmed from the start of the tag, so the gap is a margin */
    .alts-name + .alts-tag {
        margin-left: 0.32em;
    }

    .motd {
        max-height: 34px;
        overflow: hidden;
        line-height: 17px;
        white-space: pre;
        text-overflow: ellipsis;
    }

    .tag {
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 11px;
        font-weight: 600;
        background: rgba(255, 255, 255, 0.14);
    }

    .count {
        font-size: 13px;
        color: var(--ios-text-dim);
        font-variant-numeric: tabular-nums;
    }

    .bars {
        display: flex;
        align-items: flex-end;
        gap: 2px;
        height: 15px;
    }

    .bar {
        display: block;
        width: 3px;
        border-radius: 2px;
    }

    .scan {
        margin: 6px 0 0;
        padding: 18px 0 12px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 11px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        font-size: 13px;
        color: var(--ios-text-dim);
    }

    .dots {
        display: flex;
        gap: 7px;
    }

    .dots i {
        display: block;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #ffffff;
        animation: scan-pulse 1.2s ease-in-out infinite;
    }

    .dots i:nth-child(2) {
        animation-delay: 0.2s;
    }

    .dots i:nth-child(3) {
        animation-delay: 0.4s;
    }

    @keyframes scan-pulse {
        0%, 100% {
            opacity: 0.25;
        }
        50% {
            opacity: 1;
        }
    }
</style>
