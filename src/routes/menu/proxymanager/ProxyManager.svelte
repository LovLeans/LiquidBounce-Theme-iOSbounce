<!--
    ProxyManager ("Proxies") in the iPadOS style, built from the same parts as Singleplayer / Multiplayer / Accounts:
    search + filter chips, the proxy list (rubber band scrolling, edge blur), then
    [Connect][Disconnect][Add Proxy][Add Clipboard][Random] / [Favorite][Edit][Check][Delete][Back][settings app]
    (snapped to the bottom).

    Drop-in replacement for src/routes/menu/proxymanager/ProxyManager.svelte. The Add / Edit dialogs are the default
    theme's own modals, unchanged. Results (connected, check failed, ...) are shown in a small banner here, because
    this screen has no <Menu> header (and so no notifications) around it any more.
-->
<script lang="ts">
    import {onDestroy, onMount} from "svelte";
    import lookup from "country-code-lookup";
    import {
        addProxyFromClipboard,
        checkProxy,
        connectToProxy as connectToProxyRest,
        deleteScreen,
        disconnectFromProxy as disconnectFromProxyRest,
        getCurrentProxy,
        getProxies,
        removeProxy as removeProxyRest,
        setProxyFavorite
    } from "../../../integration/rest";
    import {listen} from "../../../integration/ws";
    import {LB} from "../title/main-menu/bridge";
    import type {Proxy} from "../../../integration/types";
    import type {ProxyCheckResultEvent} from "../../../integration/events";
    import AddProxyModal from "./AddProxyModal.svelte";
    import EditProxyModal from "./EditProxyModal.svelte";
    import IosScreen from "../ios/IosScreen.svelte";
    import IosSearch from "../ios/IosSearch.svelte";
    import IosChip from "../ios/IosChip.svelte";
    import IosScrollList from "../ios/IosScrollList.svelte";
    import IosListRow from "../ios/IosListRow.svelte";
    import IosButton from "../ios/IosButton.svelte";
    import IosButtonGrid from "../ios/IosButtonGrid.svelte";
    import IosSettings from "../ios/IosSettings.svelte";
    import IosToast from "../ios/IosToast.svelte";
    import type {SmoothScroll} from "../ios/scrollPhysics";

    const unknownFlag = "img/flags/unknown.svg";

    let proxies = $state<Proxy[]>([]);
    let loaded = $state(false);
    let currentId = $state<number | null>(null); // the proxy the client is connected through right now

    let query = $state("");
    let favoritesOnly = $state(false);
    let showSocks = $state(true);
    let showHttp = $state(true);
    let country = $state<string | null>(null); // null = every country

    let selectedId = $state<number | null>(null);
    let armedDelete = $state(false);
    let popId = $state<number | null>(null); // the favorite star that just changed (plays a little pop)
    let scroller = $state<SmoothScroll>();
    let rowElements: Record<number, HTMLElement | undefined> = $state({});

    let addVisible = $state(false);
    let editVisible = $state(false);
    let editTarget = $state<Proxy | null>(null);
    let editSeq = $state(0); // a fresh edit dialog per proxy: it reads its fields once, when it is created

    let toast = $state({text: "", error: false, open: false});

    let armTimer: ReturnType<typeof setTimeout> | undefined;
    let popTimer: ReturnType<typeof setTimeout> | undefined;
    let toastTimer: ReturnType<typeof setTimeout> | undefined;

    function countryOf(proxy: Proxy): string {
        const code = proxy.ipInfo?.country;
        return code === undefined ? "Unknown" : (lookup.byIso(code)?.country ?? "Unknown");
    }

    const countries = $derived([...new Set(proxies.map(countryOf))].sort());

    const visible = $derived.by(() => {
        const needle = query.trim().toLowerCase();
        return proxies.filter((proxy) => {
            if (favoritesOnly && !proxy.favorite) return false;
            if (proxy.type === "SOCKS5" ? !showSocks : !showHttp) return false;
            if (country !== null && countryOf(proxy) !== country) return false;
            return !needle || `${proxy.host}:${proxy.port} ${proxy.ipInfo?.org ?? ""} ${countryOf(proxy)}`.toLowerCase().includes(needle);
        });
    });
    const selected = $derived(visible.find((proxy) => proxy.id === selectedId));

    // The country the filter was set to is gone (its last proxy was removed): show every country again.
    $effect(() => {
        if (country !== null && !countries.includes(country)) {
            country = null;
        }
    });

    // Delete needs a second click; a different selection cancels it.
    $effect(() => {
        selectedId;
        disarmDelete();
    });

    listen("proxyCheckResult", async (e: ProxyCheckResultEvent) => {
        if (e.error && e.proxy) {
            showToast("The proxy is not working: " + e.error, true, 4500);
        } else if (e.error) {
            showToast(e.error, true, 4500);
        } else if (e.proxy) {
            showToast("Proxy is working");
            await refreshProxies();
        }
    });

    onMount(() => {
        Promise.all([refreshProxies(), updateCurrent()]).finally(() => (loaded = true));
    });

    onDestroy(() => {
        clearTimeout(armTimer);
        clearTimeout(popTimer);
        clearTimeout(toastTimer);
    });

    function showToast(text: string, error = false, duration = 3200) {
        clearTimeout(toastTimer);
        toast = {text, error, open: true};
        toastTimer = setTimeout(() => (toast.open = false), duration);
    }

    // Same hardening as the other menu screens: a request that fails (client busy / gone) used to be an unhandled rejection, and
    // `onMount`'s `.finally` re-threw it. The list that is shown stays, and only the newest answer may write it.
    let proxiesSequence = 0;

    async function refreshProxies() {
        const sequence = ++proxiesSequence;
        try {
            const list = await getProxies();
            if (sequence === proxiesSequence) {
                proxies = list;
            }
        } catch (error) {
            console.warn("[ProxyManager] could not read the proxies", error);
        }
    }

    async function updateCurrent() {
        try {
            currentId = (await getCurrentProxy())?.id ?? null;
        } catch (error) {
            console.warn("[ProxyManager] could not read the current proxy", error);
        }
    }

    /** Country chip: every click shows the next country, and every country once more at the end. */
    function nextCountry() {
        const all = [null, ...countries];
        country = all[(all.indexOf(country) + 1) % all.length];
    }

    function select(proxy: Proxy) {
        selectedId = proxy.id;
        const element = rowElements[proxy.id];
        if (element) {
            scroller?.scrollIntoView(element);
        }
    }

    async function connect(proxy: Proxy | undefined = selected) {
        if (!proxy) {
            return;
        }

        try {
            await connectToProxyRest(proxy.id);
        } catch (error) {
            console.warn("[ProxyManager] connect failed", error);
            showToast("Could not reach the client", true, 4500);
            return;
        }
        showToast(`Connected to ${proxy.host}:${proxy.port}`);
        await updateCurrent();
    }

    function connectRandom() {
        const proxy = visible[Math.floor(Math.random() * visible.length)];
        if (proxy) {
            select(proxy);
            connect(proxy);
        }
    }

    async function disconnect() {
        try {
            await disconnectFromProxyRest();
        } catch (error) {
            console.warn("[ProxyManager] disconnect failed", error);
            showToast("Could not reach the client", true, 4500);
            return;
        }
        await updateCurrent();
        showToast("Disconnected from proxy");
    }

    async function toggleFavorite(proxy: Proxy | undefined = selected) {
        if (!proxy) {
            return;
        }

        const favorite = !proxy.favorite;
        // Instant feedback; the client's answer is picked up right after.
        proxies = proxies.map((p) => (p.id === proxy.id ? {...p, favorite} : p));
        popId = proxy.id;
        clearTimeout(popTimer);
        popTimer = setTimeout(() => (popId = null), 700);

        try {
            await setProxyFavorite(proxy.id, favorite);
        } catch (error) {
            // the refresh below puts the real state back over the instant feedback
            console.warn("[ProxyManager] favorite failed", error);
        } finally {
            await refreshProxies();
        }
    }

    function check() {
        if (selected) {
            showToast("Checking proxy…", false, 8000);
            // the result arrives as a proxyCheckResult event; if the request itself fails the toast would just stay for 8 s
            checkProxy(selected.id).catch((error) => {
                console.warn("[ProxyManager] check failed", error);
                showToast("Could not reach the client", true, 4500);
            });
        }
    }

    function edit() {
        if (selected) {
            editTarget = selected;
            editSeq++;
            editVisible = true;
        }
    }

    function fromClipboard() {
        showToast("Checking proxy from clipboard…", false, 8000);
        addProxyFromClipboard().catch((error) => {
            console.warn("[ProxyManager] clipboard add failed", error);
            showToast("Could not reach the client", true, 4500);
        });
    }

    function disarmDelete() {
        clearTimeout(armTimer);
        armedDelete = false;
    }

    async function remove() {
        if (!selected) {
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
            await removeProxyRest(id);
        } catch (error) {
            console.warn("[ProxyManager] remove failed", error);
            showToast("Could not remove the proxy", true, 4500);
            return;
        }
        selectedId = null;
        await Promise.all([refreshProxies(), updateCurrent()]);
    }

    function onKeyDown(e: KeyboardEvent) {
        if (addVisible || editVisible) {
            return;
        }

        // Sliders and buttons use these keys themselves.
        if (e.target instanceof HTMLButtonElement || (e.target instanceof HTMLInputElement && e.target.type === "range")) {
            return;
        }

        if ((e.key === "ArrowDown" || e.key === "ArrowUp") && visible.length > 0) {
            e.preventDefault();
            const index = visible.findIndex((proxy) => proxy.id === selectedId);
            const next = e.key === "ArrowDown" ? Math.min(visible.length - 1, index + 1) : Math.max(0, index - 1);
            select(visible[next]);
        } else if (e.key === "Enter" && !(e.target instanceof HTMLInputElement)) {
            connect();
        }
    }
</script>

<svelte:window onkeydown={onKeyDown}/>

<!-- Modals are position: fixed, so they live outside the (scaled) stage. -->
<AddProxyModal bind:visible={addVisible}/>
{#if editTarget}
    {#key editSeq}
        <EditProxyModal bind:visible={editVisible}
                        id={editTarget.id}
                        host={editTarget.host}
                        port={editTarget.port}
                        proxyType={editTarget.type}
                        forwardAuthentication={editTarget.forwardAuthentication}
                        proxyResourcePacks={editTarget.proxyResourcePacks}
                        proxyDns={editTarget.proxyDns}
                        username={editTarget.credentials?.username ?? ""}
                        password={editTarget.credentials?.password ?? ""}
                        requiresAuthentication={editTarget.credentials !== undefined}/>
    {/key}
{/if}

<IosScreen>
    <IosSearch bind:value={query} label="Search proxies" placeholder="Search proxies"/>

    <div class="filters">
        <IosButtonGrid columns={4}>
            <IosChip selected={favoritesOnly} onclick={() => (favoritesOnly = !favoritesOnly)}
                     title="Only show favorites">Favorites Only
            </IosChip>
            <IosChip selected={showSocks} onclick={() => (showSocks = !showSocks)}
                     title="Show SOCKS5 proxies">SOCKS5
            </IosChip>
            <IosChip selected={showHttp} onclick={() => (showHttp = !showHttp)}
                     title="Show HTTP proxies">HTTP
            </IosChip>
            <IosChip selected={country !== null} onclick={nextCountry}
                     title="Click to show the next country">{country ?? "All countries"}
            </IosChip>
        </IosButtonGrid>
    </div>

    <IosScrollList label="Proxies" bind:scroller>
        {#each visible as proxy, index (proxy.id)}
            <IosListRow
                    bind:element={rowElements[proxy.id]}
                    selected={proxy.id === selectedId}
                    image="img/flags/{(proxy.ipInfo?.country ?? 'unknown').toLowerCase()}.svg"
                    fallbackImage={unknownFlag}
                    enterDelay={Math.min(index, 10) * 28}
                    onselect={() => select(proxy)}
                    onactivate={() => {
                        select(proxy);
                        connect(proxy);
                    }}>
                <span class="ios-title">{proxy.host}:{proxy.port}</span>
                <span class="ios-line">{proxy.ipInfo?.org ?? "Unknown"}</span>

                {#snippet trailing()}
                    {#if proxy.id === currentId}
                        <span class="tag connected">Connected</span>
                    {/if}
                    <span class="tag">{countryOf(proxy)}</span>
                    <span class="tag">{proxy.type}</span>
                    <!-- Handles its own pointer events: it must not select or squish the row. -->
                    <button class="star"
                            class:on={proxy.favorite}
                            class:pop={popId === proxy.id}
                            type="button"
                            title={proxy.favorite ? "Remove from favorites" : "Add to favorites"}
                            aria-pressed={proxy.favorite}
                            aria-label="Favorite"
                            onpointerdown={(e) => e.stopPropagation()}
                            onclick={(e) => {
                                e.stopPropagation();
                                toggleFavorite(proxy);
                            }}>
                        <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
                            <path d="M12 3.4l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.7l6-.8z"
                                  stroke-linejoin="round"></path>
                        </svg>
                    </button>
                {/snippet}
            </IosListRow>
        {/each}

        {#if visible.length === 0}
            <p class="empty">
                {!loaded ? "Loading…" : proxies.length > 0 ? "No matching proxies" : "No proxies yet. Tap Add Proxy to get started."}
            </p>
        {/if}
    </IosScrollList>

    <div class="bottom">
        <IosButtonGrid columns={5}>
            <IosButton variant="primary" disabled={!selected || selected.id === currentId} onclick={() => connect()}>
                Connect
            </IosButton>
            <IosButton disabled={currentId === null} onclick={disconnect}>Disconnect</IosButton>
            <IosButton onclick={() => (addVisible = true)}>Add Proxy</IosButton>
            <IosButton onclick={fromClipboard}>Clipboard</IosButton>
            <IosButton disabled={visible.length === 0} onclick={connectRandom}>Random</IosButton>
        </IosButtonGrid>

        <IosButtonGrid template="repeat(5, minmax(0, 1fr)) 45px">
            <IosButton disabled={!selected} onclick={() => toggleFavorite()}>
                {selected?.favorite ? "Unfavorite" : "Favorite"}
            </IosButton>
            <IosButton disabled={!selected} onclick={edit}>Edit</IosButton>
            <IosButton disabled={!selected} onclick={check}>Check</IosButton>
            <IosButton variant="danger" disabled={!selected} onclick={remove}>
                {armedDelete ? "Confirm" : "Delete"}
            </IosButton>
            <IosButton onclick={() => LB.leaveScreen("proxymanager", () => deleteScreen())}>Back</IosButton>
            <IosSettings/>
        </IosButtonGrid>
    </div>

    <IosToast title="ProxyManager" text={toast.text} error={toast.error} open={toast.open}/>
</IosScreen>

<style>
    .filters {
        flex: none;
        margin-top: -6px; /* sits closer to the search field than the buttons are to each other */
    }

    .bottom {
        flex: none;
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .empty {
        margin: 0;
        padding: 40px 24px;
        text-align: center;
        font-size: 14px;
        color: var(--ios-text-dim);
    }

    .tag {
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 11px;
        font-weight: 600;
        background: rgba(255, 255, 255, 0.14);
    }

    .tag.connected {
        background: color-mix(in srgb, var(--ios-accent) 38%, transparent);
    }

    /* --- favorite star ------------------------------------------------------------------------------------ */
    .star {
        width: 34px;
        height: 34px;
        padding: 0;
        border: 0;
        border-radius: 50%;
        display: grid;
        place-items: center;
        cursor: pointer;
        color: rgba(255, 255, 255, 0.4);
        background: transparent;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        transition: transform 0.55s cubic-bezier(0.34, 1.7, 0.5, 1), color 0.2s ease-out, background-color 0.2s;
    }

    .star svg {
        fill: transparent;
        stroke: currentColor;
        stroke-width: 1.8;
        transition: fill 0.2s ease-out;
    }

    .star:hover {
        color: rgba(255, 255, 255, 0.85);
        background: rgba(255, 255, 255, 0.1);
    }

    .star.on {
        color: #ffd60a;
    }

    .star.on svg {
        fill: #ffd60a;
    }

    .star:active {
        transform: scale(0.8);
        transition-duration: 0.1s;
    }

    .star.pop svg {
        animation: star-pop 0.6s cubic-bezier(0.34, 1.7, 0.5, 1);
    }

    @keyframes star-pop {
        0% {
            transform: scale(0.55) rotate(-24deg);
        }
        100% {
            transform: scale(1) rotate(0);
        }
    }

    .star:focus-visible {
        outline: 3px solid #ffffff;
        outline-offset: 1px;
    }
</style>
