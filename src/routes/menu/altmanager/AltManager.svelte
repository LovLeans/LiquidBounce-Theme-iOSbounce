<!--
    AltManager ("Accounts") in the iPadOS style, built from the same parts as Singleplayer / Multiplayer:
    search + filter chips, the account list (rubber band scrolling, edge blur, hold a row to drag it to a new place),
    then  [Login][Add Account][Direct Login][Random] / [Favorite][Delete][Restore Session][Back][settings app]
    (snapped to the bottom). Random logs in with a new, randomly generated cracked username on every click.

    Drop-in replacement for src/routes/menu/altmanager/AltManager.svelte. Add Account and Direct Login open as windows
    that grow out of their own button (the motion of Add Server / ViaFabricPlus in Multiplayer, see ios/IosDialog.svelte), with the
    icon tab bar. Login results are shown in a small banner here, because this screen has
    no <Menu> header (and so no notifications) around it any more.
-->
<script lang="ts">
    import {onDestroy, onMount, tick} from "svelte";
    import {
        deleteScreen,
        directLoginToCrackedAccount,
        getAccounts,
        loginToAccount as loginToAccountRest,
        orderAccounts,
        removeAccount as restRemoveAccount,
        restoreSession,
        setAccountFavorite
    } from "../../../integration/rest";
    import {listen} from "../../../integration/ws";
    import {generateUsername} from "../../../util/random_username";
    import {LB} from "../title/main-menu/bridge";
    import type {Account} from "../../../integration/types";
    import type {
        AccountManagerAdditionEvent,
        AccountManagerLoginEvent,
        AccountManagerMessageEvent
    } from "../../../integration/events";
    import {isLoggingIn} from "./altmanager_store";
    import AddAccountModal from "./addaccount/AddAccountModal.svelte";
    import DirectLoginModal from "./directLogin/DirectLoginModal.svelte";
    import IosScreen from "../ios/IosScreen.svelte";
    import IosSearch from "../ios/IosSearch.svelte";
    import IosChip from "../ios/IosChip.svelte";
    import IosScrollList from "../ios/IosScrollList.svelte";
    import IosListRow from "../ios/IosListRow.svelte";
    import IosButton from "../ios/IosButton.svelte";
    import IosButtonGrid from "../ios/IosButtonGrid.svelte";
    import IosSettings from "../ios/IosSettings.svelte";
    import type {SmoothScroll} from "../ios/scrollPhysics";
    import {ReorderDrag} from "../ios/reorder";

    interface Props {
        /**
         * Set when this screen sits in a window that grows out of a button of another screen (the alts button of Multiplayer):
         * Back closes that window instead of asking the client for another screen.
         */
        onclose?: () => void;
        /** False while that window is shrinking away: the keyboard is not this screen's any more. */
        active?: boolean;
    }

    let {onclose, active = true}: Props = $props();

    /** `key` is a stable identity of an account, so its row (and avatar) survives a reorder or a refresh. */
    type AccountEntry = Account & {key: number};

    const steve = "img/steve.png";

    let accounts = $state<AccountEntry[]>([]);
    let nextKey = 0;
    let loaded = $state(false);

    let query = $state("");
    let premiumOnly = $state(false);
    let favoritesOnly = $state(false);
    let showMojang = $state(true); // Mojang / Microsoft / cracked accounts
    let showAltening = $state(true);

    let selectedKey = $state<number | null>(null);
    let armedDelete = $state(false);
    let popKey = $state<number | null>(null); // the favorite star that just changed (plays a little pop)
    let scroller = $state<SmoothScroll>();
    let rowElements: Record<number, HTMLElement | undefined> = $state({});

    // The two dialogs: windows that grow out of the button that opens them (same as the dialogs of Multiplayer). Each one is on its
    // own: while one shrinks back into its button (it takes no clicks any more) the other can already be opened.
    type DialogKind = "add" | "direct";
    type DialogState = "closed" | "open" | "closing";
    let dialogs: Record<DialogKind, DialogState> = $state({add: "closed", direct: "closed"});
    let dialogButtons: Record<DialogKind, HTMLElement | undefined> = $state({add: undefined, direct: undefined});

    let toast = $state({text: "", error: false, open: false});

    let drag: ReorderDrag | undefined;
    let armTimer: ReturnType<typeof setTimeout> | undefined;
    let popTimer: ReturnType<typeof setTimeout> | undefined;
    let toastTimer: ReturnType<typeof setTimeout> | undefined;

    const visible = $derived.by(() => {
        const needle = query.trim().toLowerCase();
        return accounts.filter((account) => {
            if (premiumOnly && account.type === "Cracked") return false;
            if (favoritesOnly && !account.favorite) return false;
            if (!showMojang && (account.type === "Cracked" || account.type === "Microsoft")) return false;
            if (!showAltening && account.type === "TheAltening") return false;
            return !needle || account.username.toLowerCase().includes(needle);
        });
    });
    // Rows can only be moved while the list is complete: with a filter, row positions are not account positions.
    const sortable = $derived(visible.length === accounts.length);
    const selected = $derived(visible.find((account) => account.key === selectedKey));

    // Delete needs a second click; a different selection cancels it.
    $effect(() => {
        selectedKey;
        disarmDelete();
    });

    // Hold an account to drag it to a new place in the list.
    $effect(() => {
        if (!scroller) {
            return;
        }

        const instance = new ReorderDrag({
            scroller,
            rows: () => visible.map((account) => rowElements[account.key]).filter((el): el is HTMLElement => !!el),
            onDrop: reorderAccounts
        });
        drag = instance;

        return () => {
            instance.destroy();
            drag = undefined;
        };
    });

    // The Add Account window closes itself on success (and shows an error inside it): here only the banner and the list.
    listen("accountManagerAddition", (e: AccountManagerAdditionEvent) => {
        if (e.error) {
            showToast(e.error, true, 4500);
        } else {
            showToast(`Added account ${e.username}`);
        }
        refreshAccounts();
    });

    listen("accountManagerMessage", (e: AccountManagerMessageEvent) => {
        showToast(e.message, false, 4500);
    });

    listen("accountManagerLogin", (e: AccountManagerLoginEvent) => {
        if (e.error) {
            showToast(e.error, true, 4500);
        } else {
            showToast(`Logged in as ${e.username}`);
        }
    });

    onMount(() => {
        refreshAccounts().finally(() => (loaded = true));
    });

    let destroyed = false;
    onDestroy(() => {
        destroyed = true;
        clearTimeout(armTimer);
        clearTimeout(popTimer);
        clearTimeout(toastTimer);
    });

    function showToast(text: string, error = false, duration = 3200) {
        clearTimeout(toastTimer);
        toast = {text, error, open: true};
        toastTimer = setTimeout(() => (toast.open = false), duration);
    }

    /** Gives every account a stable key, reusing the key of the same account (name + uuid + type) from before. */
    function withKeys(list: Account[], previous: AccountEntry[]): AccountEntry[] {
        const pool = [...previous];
        return list.map((account) => {
            const match = pool.findIndex(
                (old) => old.uuid === account.uuid && old.username === account.username && old.type === account.type
            );
            const key = match >= 0 ? pool.splice(match, 1)[0].key : nextKey++;
            return {...account, key};
        });
    }

    // Several refreshes can be out at once (add, favourite, remove): only the newest answer may write the list.
    let accountsSequence = 0;

    async function refreshAccounts() {
        const sequence = ++accountsSequence;
        try {
            const list = await getAccounts();
            if (destroyed || sequence !== accountsSequence) {
                return;
            }
            accounts = withKeys(list, $state.snapshot(accounts) as AccountEntry[]);
        } catch (error) {
            // used to be an unhandled rejection; the list that is shown stays
            console.warn("[AltManager] could not read the accounts", error);
        }
    }

    function startReorder(account: AccountEntry, index: number, event: PointerEvent) {
        drag?.begin(index, event);
        if (drag?.active) {
            // Select the held account, but don't scroll: the list must stay where the user is dragging.
            selectedKey = account.key;
        }
    }

    /** `from` / `to` are positions in the list. Shows the new order at once, then saves it. */
    async function reorderAccounts(from: number, to: number) {
        // order[newPosition] = old position, which is what the client's /accounts/order expects.
        const order = accounts.map((_, index) => index);
        order.splice(from, 1);
        order.splice(to, 0, from);

        // Same accounts, same keys (so the rows and avatars stay as they are), only the order and ids change.
        const previous = $state.snapshot(accounts) as AccountEntry[];
        accounts = order.map((oldIndex, newIndex) => ({...previous[oldIndex], id: newIndex}));

        // Resolves once the list shows the new order (the drag removes its temporary styles right after).
        await tick();

        orderAccounts(order)
            .then(refreshAccounts)
            .catch((error) => {
                console.error("[AltManager] Could not save the new account order, putting it back:", error);
                accounts = previous;
            });
    }

    function openDialog(kind: DialogKind) {
        if (dialogs[kind] === "closed") {
            dialogs[kind] = "open";
        }
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
    }

    function select(account: AccountEntry) {
        selectedKey = account.key;
        const element = rowElements[account.key];
        if (element) {
            scroller?.scrollIntoView(element);
        }
    }

    async function login(account: AccountEntry | undefined = selected) {
        if (!account || $isLoggingIn) {
            return;
        }

        showToast("Logging in…", false, 8000);
        try {
            await loginToAccountRest(account.id);
        } catch (error) {
            // the request never reached the client: the "Logging in…" toast would otherwise stay up for 8 s with nothing happening
            console.warn("[AltManager] login request failed", error);
            showToast("Could not reach the client", true, 4500);
        }
    }

    let lastRandomName = "";

    /**
     * Random: logs in as a brand new cracked (offline) account with a freshly generated username, every click. It does not pick
     * from the account list and does not add anything to it (like Direct Login), so the list stays as it is.
     */
    async function loginRandom() {
        if ($isLoggingIn) {
            return;
        }

        let username = generateUsername();
        while (username === lastRandomName) {
            username = generateUsername();
        }
        lastRandomName = username;

        showToast(`Logging in as ${username}…`, false, 8000);
        try {
            await directLoginToCrackedAccount(username, false);
        } catch (error) {
            console.error("[AltManager] Random login failed:", error);
            showToast("Could not log in with a random username", true, 4500);
        }
    }

    async function toggleFavorite(account: AccountEntry | undefined = selected) {
        if (!account) {
            return;
        }

        const favorite = !account.favorite;
        // Instant feedback; the client's answer is picked up right after.
        accounts = accounts.map((a) => (a.key === account.key ? {...a, favorite} : a));
        popKey = account.key;
        clearTimeout(popTimer);
        popTimer = setTimeout(() => (popKey = null), 700);

        try {
            await setAccountFavorite(account.id, favorite);
        } catch (error) {
            // the refresh below puts the real state back over the instant feedback
            console.warn("[AltManager] favorite failed", error);
        } finally {
            await refreshAccounts();
        }
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
            await restRemoveAccount(id);
        } catch (error) {
            console.warn("[AltManager] remove request failed", error);
            showToast("Could not remove the account", true, 4500);
            return;
        }
        selectedKey = null;
        await refreshAccounts();
    }

    async function restore() {
        showToast("Restoring the original session…", false, 6000);
        try {
            await restoreSession();
        } catch (error) {
            console.warn("[AltManager] restore request failed", error);
            showToast("Could not reach the client", true, 4500);
        }
    }

    function back() {
        if (onclose) {
            onclose();
        } else {
            LB.leaveScreen("altmanager", () => deleteScreen());
        }
    }

    function onKeyDown(e: KeyboardEvent) {
        // A window that is shrinking away no longer owns the keyboard.
        if (!active || Object.values(dialogs).includes("open")) {
            return;
        }

        // Sliders and buttons use these keys themselves.
        if (e.target instanceof HTMLButtonElement || (e.target instanceof HTMLInputElement && e.target.type === "range")) {
            return;
        }

        if ((e.key === "ArrowDown" || e.key === "ArrowUp") && visible.length > 0) {
            e.preventDefault();
            const index = visible.findIndex((account) => account.key === selectedKey);
            const next = e.key === "ArrowDown" ? Math.min(visible.length - 1, index + 1) : Math.max(0, index - 1);
            select(visible[next]);
        } else if (e.key === "Enter" && !(e.target instanceof HTMLInputElement)) {
            login();
        }
    }
</script>

<svelte:window onkeydown={onKeyDown}/>

<IosScreen>
    <IosSearch bind:value={query} label="Search accounts" placeholder="Search accounts"/>

    <div class="filters">
        <IosButtonGrid columns={4}>
            <IosChip selected={premiumOnly} onclick={() => (premiumOnly = !premiumOnly)}
                     title="Hide cracked accounts">Premium Only
            </IosChip>
            <IosChip selected={favoritesOnly} onclick={() => (favoritesOnly = !favoritesOnly)}
                     title="Only show favorites">Favorites Only
            </IosChip>
            <IosChip selected={showMojang} onclick={() => (showMojang = !showMojang)}
                     title="Show Mojang, Microsoft and cracked accounts">Mojang
            </IosChip>
            <IosChip selected={showAltening} onclick={() => (showAltening = !showAltening)}
                     title="Show TheAltening accounts">TheAltening
            </IosChip>
        </IosButtonGrid>
    </div>

    <IosScrollList label="Accounts" bind:scroller>
        {#each visible as account, index (account.key)}
            <IosListRow
                    bind:element={rowElements[account.key]}
                    selected={account.key === selectedKey}
                    image={account.avatar || steve}
                    fallbackImage={steve}
                    enterDelay={Math.min(index, 10) * 28}
                    onselect={() => select(account)}
                    onhold={sortable ? (event) => startReorder(account, index, event) : undefined}
                    onactivate={() => {
                        select(account);
                        login(account);
                    }}>
                <span class="ios-title">{account.username}</span>
                <span class="ios-line uuid">{account.uuid}</span>

                {#snippet trailing()}
                    <span class="tag" class:premium={account.type !== "Cracked"}>{account.type}</span>
                    <!-- Handles its own pointer events: it must not select, squish or start dragging the row. -->
                    <button class="star"
                            class:on={account.favorite}
                            class:pop={popKey === account.key}
                            type="button"
                            title={account.favorite ? "Remove from favorites" : "Add to favorites"}
                            aria-pressed={account.favorite}
                            aria-label="Favorite"
                            onpointerdown={(e) => e.stopPropagation()}
                            onclick={(e) => {
                                e.stopPropagation();
                                toggleFavorite(account);
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
                {!loaded ? "Loading…" : accounts.length > 0 ? "No matching accounts" : "No accounts yet. Tap Add Account to get started."}
            </p>
        {/if}
    </IosScrollList>

    <div class="bottom">
        <IosButtonGrid columns={4}>
            <IosButton variant="primary" disabled={!selected || $isLoggingIn} onclick={() => login()}>
                {$isLoggingIn ? "Logging in…" : "Login"}
            </IosButton>
            <IosButton bind:element={dialogButtons.add} onclick={() => openDialog("add")}>Add Account</IosButton>
            <IosButton bind:element={dialogButtons.direct} onclick={() => openDialog("direct")}>Direct Login</IosButton>
            <IosButton disabled={$isLoggingIn} title="Log in with a new random cracked username" onclick={loginRandom}>Random</IosButton>
        </IosButtonGrid>

        <IosButtonGrid template="repeat(4, minmax(0, 1fr)) 45px">
            <IosButton disabled={!selected} onclick={() => toggleFavorite()}>
                {selected?.favorite ? "Unfavorite" : "Favorite"}
            </IosButton>
            <IosButton variant="danger" disabled={!selected} onclick={remove}>
                {armedDelete ? "Click to confirm" : "Delete"}
            </IosButton>
            <IosButton onclick={restore}>Restore Session</IosButton>
            <IosButton onclick={back}>Back</IosButton>
            <IosSettings/>
        </IosButtonGrid>
    </div>

    {#if dialogs.add !== "closed"}
        <AddAccountModal anchor={() => dialogButtons.add}
                         onclosing={() => dialogClosing("add")}
                         onreopening={() => dialogReopened("add")}
                         onclosed={() => dialogClosed("add")}/>
    {/if}
    {#if dialogs.direct !== "closed"}
        <DirectLoginModal anchor={() => dialogButtons.direct}
                          onclosing={() => dialogClosing("direct")}
                          onreopening={() => dialogReopened("direct")}
                          onclosed={() => dialogClosed("direct")}/>
    {/if}

    <div class="toast" class:open={toast.open} class:error={toast.error} role="status" aria-live="polite">
        <span class="toast-icon" aria-hidden="true"></span>
        <span class="toast-title">AltManager</span>
        <span class="toast-text">{toast.text}</span>
    </div>
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

    .uuid {
        font-family: Consolas, Menlo, "DejaVu Sans Mono", "Liberation Mono", monospace;
        font-size: 12px;
    }

    .tag {
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 11px;
        font-weight: 600;
        background: rgba(255, 255, 255, 0.14);
    }

    .tag.premium {
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

    /* --- banner (login results) ---------------------------------------------------------------------------- */
    .toast {
        position: absolute;
        top: 20px;
        left: 50%;
        max-width: 560px;
        box-sizing: border-box;
        padding: 12px 20px 12px 14px;
        display: grid;
        grid-template-columns: auto 1fr;
        grid-template-areas: "icon title" "icon text";
        column-gap: 12px;
        align-items: center;
        border-radius: 20px;
        background: rgba(58, 54, 62, 0.82);
        -webkit-backdrop-filter: blur(24px) saturate(1.5);
        backdrop-filter: blur(24px) saturate(1.5);
        box-shadow: inset 0 0 0 1px var(--ios-hairline), inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 16px 40px rgba(0, 0, 0, 0.4);
        pointer-events: none;
        z-index: 20;
        transform-origin: 50% 0;

        /* Hidden: above the top edge. Accelerates away. */
        opacity: 0;
        transform: translateX(-50%) translateY(-90px) scale(0.92);
        transition: transform 0.4s cubic-bezier(0.5, 0, 0.75, 0.35), opacity 0.3s ease-in;
    }

    /* Shown: drops in with a little overshoot. */
    .toast.open {
        opacity: 1;
        transform: translateX(-50%) translateY(0) scale(1);
        transition: transform 0.6s cubic-bezier(0.34, 1.45, 0.5, 1), opacity 0.2s ease-out;
    }

    .toast-icon {
        grid-area: icon;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: var(--ios-accent);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25);
    }

    .toast.error .toast-icon {
        background: var(--ios-danger);
    }

    .toast-title {
        grid-area: title;
        font-size: 13px;
        font-weight: 700;
        line-height: 16px;
    }

    .toast-text {
        grid-area: text;
        font-size: 13px;
        line-height: 17px;
        color: var(--ios-text-dim);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
</style>
