<!--
    Singleplayer ("Select World") in the iPadOS style. Same layout and actions as the vanilla screen:
    search, world list (top of the screen), then  [Play Selected World][Create New World] /
    [Edit][Delete][Re-Create][Cancel][settings app] (snapped to the bottom).

    Drop-in replacement for src/routes/menu/singleplayer/Singleplayer.svelte of the LiquidBounce default theme.
-->
<script lang="ts">
    import {onMount} from "svelte";
    import {editWorld, getWorlds, openScreen, openWorld, removeWorld} from "../../../integration/rest";
    import {REST_BASE} from "../../../integration/host";
    import {LB, nativeHandoff} from "../title/main-menu/bridge";
    import type {World} from "../../../integration/types";
    import IosScreen from "../ios/IosScreen.svelte";
    import IosSearch from "../ios/IosSearch.svelte";
    import IosScrollList from "../ios/IosScrollList.svelte";
    import IosListRow from "../ios/IosListRow.svelte";
    import IosButton from "../ios/IosButton.svelte";
    import IosButtonGrid from "../ios/IosButtonGrid.svelte";
    import IosSettings from "../ios/IosSettings.svelte";
    import type {SmoothScroll} from "../ios/scrollPhysics";

    /** Fields the client sends in /client/worlds that are not (yet) part of the theme's `World` type. */
    type WorldEntry = World & {
        locked?: boolean;
        requiresConversion?: boolean;
        isVersionAvailable?: boolean;
    };

    const unknownIcon = `${REST_BASE}/api/v1/client/resource?id=minecraft:textures/misc/unknown_server.png`;

    let worlds = $state<WorldEntry[]>([]);
    let loaded = $state(false);
    let query = $state("");
    let selectedName = $state<string | null>(null);
    let armedDelete = $state(false);
    let scroller = $state<SmoothScroll>();
    let rowElements: Record<string, HTMLElement | undefined> = $state({});

    let armTimer: ReturnType<typeof setTimeout> | undefined;

    const visible = $derived.by(() => {
        const needle = query.trim().toLowerCase();
        return needle ? worlds.filter((world) => world.displayName.toLowerCase().includes(needle)) : worlds;
    });
    const selected = $derived(visible.find((world) => world.name === selectedName));
    const playable = $derived(
        !!selected && !selected.locked && !selected.requiresConversion && selected.isVersionAvailable !== false
    );

    // Delete needs a second click; a different selection cancels it.
    $effect(() => {
        selectedName;
        disarmDelete();
    });

    onMount(() => {
        refresh();
        return () => {
            clearTimeout(armTimer);
        };
    });

    async function refresh() {
        try {
            worlds = await getWorlds();
        } catch (error) {
            // used to be an unhandled rejection (every caller is fire-and-forget); the list that is shown stays
            console.warn("[Singleplayer] could not read the worlds", error);
        } finally {
            loaded = true;
        }
    }

    function capitalize(text: string): string {
        return text ? text[0].toUpperCase() + text.slice(1) : text;
    }

    /** "2/11/21 10:53 AM", like the vanilla list. */
    function formatDate(millis: number): string {
        return new Date(millis)
            .toLocaleString("en-US", {year: "2-digit", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit"})
            .replace(",", "");
    }

    /** "Survival Mode, Cheats, Version: 1.16.5" */
    function describe(world: WorldEntry): string {
        const mode = world.hardcore ? "Hardcore" : capitalize(world.gameMode);
        return `${mode} Mode${world.commandsAllowed ? ", Cheats" : ""}, Version: ${world.version}`;
    }

    function select(name: string) {
        selectedName = name;
        const element = rowElements[name];
        if (element) {
            scroller?.scrollIntoView(element);
        }
    }

    function play() {
        if (selected && playable) {
            openWorld(selected.name);
        }
    }

    // Edit World and Create New World are the client's own screens: LB.openNative tells the router that the close of this screen is the
    // handover and not an Esc (see App.svelte). There is no animation: the page stays as it is until the client takes over.
    // Coming back to this screen is handled by the router as well.
    function edit() {
        if (selected) {
            const name = selected.name;
            LB.openNative(() => editWorld(name));
        }
    }

    function createWorld() {
        LB.openNative(() => openScreen("create_world"));
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

        const name = selected.name;
        disarmDelete();
        try {
            await removeWorld(name);
        } catch (error) {
            console.warn("[Singleplayer] remove failed", error);
            return;
        }
        selectedName = null;
        await refresh();
    }

    function onKeyDown(e: KeyboardEvent) {
        // A screen of the client is being opened: Enter must not play the selected world meanwhile.
        if (nativeHandoff.busy) {
            return;
        }

        // Sliders and buttons use these keys themselves.
        if (e.target instanceof HTMLButtonElement || (e.target instanceof HTMLInputElement && e.target.type === "range")) {
            return;
        }

        if ((e.key === "ArrowDown" || e.key === "ArrowUp") && visible.length > 0) {
            e.preventDefault();
            const index = visible.findIndex((world) => world.name === selectedName);
            const next = e.key === "ArrowDown" ? Math.min(visible.length - 1, index + 1) : Math.max(0, index - 1);
            select(visible[next].name);
        } else if (e.key === "Enter" && !(e.target instanceof HTMLInputElement)) {
            play();
        }
    }
</script>

<svelte:window onkeydown={onKeyDown}/>

<IosScreen>
    <IosSearch bind:value={query} label="Search worlds"/>

    <IosScrollList label="Worlds" bind:scroller>
        {#each visible as world (world.name)}
            <IosListRow
                    bind:element={rowElements[world.name]}
                    selected={world.name === selectedName}
                    image={world.icon ? `data:image/png;base64,${world.icon}` : unknownIcon}
                    onselect={() => select(world.name)}
                    onactivate={() => {
                        select(world.name);
                        play();
                    }}>
                <span class="ios-title">{world.displayName}</span>
                <span class="ios-line">{world.name} ({formatDate(world.lastPlayed)})</span>
                <span class="ios-line">{describe(world)}</span>
            </IosListRow>
        {/each}

        {#if visible.length === 0}
            <p class="empty">{!loaded ? "Loading…" : query ? "No matching worlds" : "No worlds yet"}</p>
        {/if}
    </IosScrollList>

    <div class="bottom">
        <IosButtonGrid columns={2}>
            <IosButton variant="primary" disabled={!playable} onclick={play}>Play Selected World</IosButton>
            <IosButton onclick={createWorld}>Create New World</IosButton>
        </IosButtonGrid>

        <IosButtonGrid template="repeat(4, minmax(0, 1fr)) 45px">
            <IosButton disabled={!selected} onclick={edit}>Edit</IosButton>
            <IosButton variant="danger" disabled={!selected} onclick={remove}>
                {armedDelete ? "Click to confirm" : "Delete"}
            </IosButton>
            <!-- LiquidBounce's REST API has no "re-create world" endpoint yet, so this stays inactive. -->
            <IosButton disabled title="Not available yet: the client does not expose Re-Create to themes">Re-Create</IosButton>
            <IosButton onclick={() => LB.leaveScreen("singleplayer", () => openScreen("title"))}>Cancel</IosButton>
            <IosSettings/>
        </IosButtonGrid>
    </div>
</IosScreen>

<style>
    .bottom {
        flex: none;
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .empty {
        margin: 0;
        padding: 40px 0;
        text-align: center;
        font-size: 14px;
        color: var(--ios-text-dim);
    }
</style>
