<script lang="ts">
    import ArrayList from "./elements/ArrayList.svelte";
    import TargetHud from "./elements/targethud/TargetHud.svelte";
    import Watermark from "./elements/Watermark.svelte";
    import Notifications from "./elements/notifications/Notifications.svelte";
    import TabGui from "./elements/tabgui/TabGui.svelte";
    import HotBar from "./elements/hotbar/HotBar.svelte";
    import Scoreboard from "./elements/Scoreboard.svelte";
    import {onDestroy, onMount, setContext} from "svelte";
    import {
        getClientInfo,
        getComponents,
        getGameWindow,
        getMetadata,
        getNativeComponents
    } from "../../integration/rest";
    import {listenSticky} from "../../integration/ws";
    import {get} from "svelte/store";
    import {currentAdd, finishAdd, hudReload, recentlyAdded} from "./reload";
    import type {HudComponent, Metadata} from "../../integration/types";
    import Taco from "./elements/taco/Taco.svelte";
    import type {ComponentsUpdateEvent, ScaleFactorChangeEvent} from "../../integration/events";
    import Keystrokes from "./elements/keystrokes/Keystrokes.svelte";
    import Effects from "./elements/Effects.svelte";
    import BlockCounter from "./elements/BlockCounter.svelte";
    import Text from "./elements/Text.svelte";
    import DraggableComponent from "./elements/DraggableComponent.svelte";
    import KeyBinds from "./elements/KeyBinds.svelte";
    import ClosedCaptions from "./elements/ClosedCaptions.svelte";
    import GenericPlayerInventory from "./elements/inventory/GenericPlayerInventory.svelte";
    import {os} from "./store";
    import InventoryStatistics from "./elements/inventory/InventoryStatistics.svelte";
    import {
        HUD_EDITOR_ELEMENTS_CONTEXT,
        type HudEditorDragState
    } from "./constants";
    import Image from "./elements/Image.svelte";
    import {syncClientToLayout} from "./sync";
    import {localOptions, withLocalOptions} from "./options";
    import {decideAdd, shownCount, type AddCheck} from "./layout";
    import {
        adoptAdded,
        applyLayout,
        componentKeys,
        frozenLayout,
        learnFromPush,
        positions,
        refreshPositionsFromClient,
        rememberEnabled,
        rememberPosition,
        rememberRemoved
    } from "./positions";

    export let inEditor = false;
    export let onDragStateChange: ((state: HudEditorDragState) => void) | undefined = undefined;
    export let magneticTargetIds: string[] = [];
    // the popover shown over each component in the editor; the classic one when not given (the iOS GUI passes its own)
    export let settingsComponent: any = undefined;

    let zoom = 100;
    let metadata: Metadata;
    let nativeComponents: HudComponent[] = [];
    let themeComponents: HudComponent[] = [];

    // Two different lists of this theme's components exist in the client: the one it PUSHES (`componentsUpdate`) is the live one, the one that
    // `getComponents` returns can differ from it (other components on, other positions). The read list is shown at once, so the editor is
    // never empty while waiting, and the pushed list replaces it as soon as the client sends it (after that a read never replaces it again,
    // see loadComponents). Boxes are keyed by name (see keyedComponents), so the swap does not rebuild them.
    let themeLive = false;

    // Which components are on, and where, is kept by the theme itself (see positions.ts) and put over whatever list the client gave: a read
    // and a push can disagree about both, and the HUD used to follow whichever came last. Until the client has pushed to this page, a
    // component the theme has not seen in a push yet is not drawn (the list in hand is a read, and can be the other list).
    $: laidOutTheme = applyLayout(themeComponents, {positions: $positions, frozen: $frozenLayout, hideUnknown: !themeLive});
    // what the user chose in a component's options popover is shown at once, whatever the client's lists still say (options.ts)
    $: positionedTheme = withLocalOptions(laidOutTheme, $localOptions);
    $: themeKeyById = new Map(componentKeys(themeComponents).map((key, i) => [themeComponents[i].id, key] as [string, string]));

    // The list below is keyed by id. The same id twice (e.g. in the native and the theme list) is undefined behaviour for a keyed each
    // in a production build: ghost copies that never go away and components that stop reacting to the mouse. The later entry wins
    // (the theme list is last, and it is the one that has real content).
    function uniqueById(list: HudComponent[]): HudComponent[] {
        const byId = new Map<string, HudComponent>();

        for (const component of list) {
            if (byId.has(component.id)) {
                console.warn("[Hud] component id appears twice, using the last one:", component.id, component.name);
            }

            byId.set(component.id, component);
        }

        return [...byId.values()];
    }

    // The client hands out NEW ids for the same components every so often (about 2-4 s after the editor opened). A box keyed by
    // id was destroyed and rebuilt each time: a drag in progress ended on the old id (that save was lost), the old box lingered as an invisible
    // ghost that still took the mouse. Keyed by name (+ its number among components of that name, for the ones that can exist several times,
    // like Image) the same box lives on and just gets the new id.
    // The client has to hear what the layout says is on (it hides the vanilla hotbar, effect icons, scoreboard by its own state): both
    // lists it gave, again when the layout changes (the user removed / added something, or the stored layout arrived after the lists).
    let lastRead: HudComponent[] = [];
    $: syncClientToLayout(lastRead, $frozenLayout);
    $: syncClientToLayout(themeComponents, $frozenLayout);

    $: keyedComponents = componentKeys(renderedComponents).map((key, i) => ({key, c: renderedComponents[i]}));

    $: renderedComponents = uniqueById(inEditor ? [...nativeComponents, ...positionedTheme] : positionedTheme);

    setContext(HUD_EDITOR_ELEMENTS_CONTEXT, new Map<string, HTMLElement>());

    // These used to run one after the other with no error handling: when the client's HTTP server was not answering yet at page load, the
    // first failure aborted the rest, `metadata` was never set, and every later loadComponents() (socketReady, visibility) returned at
    // its first line, so the HUD stayed empty until the page was reloaded. Now each step stands on its own and loadComponents() asks
    // for the metadata itself if it is still missing.
    onMount(async () => {
        await Promise.all([
            getClientInfo().then(info => { $os = info.os; }).catch(e => console.warn("[Hud] could not read the client info", e)),
            getGameWindow().then(gameWindow => { zoom = gameWindow.scaleFactor * 50; }).catch(e => console.warn("[Hud] could not read the game window", e))
        ]);

        await loadComponents();
    });

    // The client sends the theme components again with NEW ids about two seconds after the editor opened, so every box
    // is replaced by a new one. Fading the new ones in made the whole HUD dip for a moment. Only the very first appearance fades in.
    let animateIn = true;
    let introTimer: ReturnType<typeof setTimeout> | undefined;
    $: if (animateIn && renderedComponents.length > 0 && introTimer === undefined) {
        introTimer = setTimeout(() => (animateIn = false), 600);
    }
    onDestroy(() => clearTimeout(introTimer));

    // One counter per list. A load that finishes after a newer load of the SAME list started, or after the client already pushed that
    // list itself, must not overwrite it. The lists are judged separately: a native update arriving while the first load is out must
    // not throw away the theme components that load brings.
    let nativeSequence = 0;
    let themeSequence = 0;

    // Text and Image can exist several times, and the client has TWO lists under the theme's id that do not agree about them: the one it
    // pushes (`componentsUpdate`) never shows a Text or Image that was added, switched on or changed; the one a read returns does, and it
    // is the one an add acts on. So these come from the newest read, whatever a push says; everything else still follows the push.
    const MULTI_INSTANCE = new Set(["Text", "Image"]);
    let readMulti: HudComponent[] | undefined = undefined;

    function withReadMulti(list: HudComponent[]): HudComponent[] {
        return readMulti === undefined
            ? list
            : [...list.filter(c => !MULTI_INSTANCE.has(c.name)), ...readMulti];
    }

    // After a change the client gives its components new ids (and the settings of the new ones), so the ids of the last read go stale.
    // A push says something changed: read again at once, and once more when the client has settled.
    let refreshTimers: ReturnType<typeof setTimeout>[] = [];
    function refreshSoon(): void {
        refreshTimers.forEach(clearTimeout);
        refreshTimers = [700, 2000].map(ms => setTimeout(() => loadComponents(true), ms));
    }
    onDestroy(() => refreshTimers.forEach(clearTimeout));

    // What the user asked Add Component for, until it has shown up. The client does not always give the new Image / Text a state the layout
    // draws: the new one can be read as switched off, or the layout can still hold an older answer for the same `Name:n`. The Add then
    // showed nothing and a second Add was needed. So after an add every read is checked: when no more components of that name are drawn than
    // before, the one the layout hides is shown (and the client is told, see sync.ts). See layout.ts `decideAdd`.
    let addCheck: (AddCheck & {serial: number}) | undefined = undefined;

    function startAddCheck(): void {
        const add = currentAdd();

        if (!inEditor || !add || !MULTI_INSTANCE.has(add.name) || addCheck?.serial === add.serial) {
            return;
        }

        addCheck = {
            serial: add.serial,
            name: add.name,
            at: add.at,
            shownBefore: shownCount(themeComponents, get(frozenLayout), add.name, !themeLive),
            totalBefore: themeComponents.filter(c => c.name === add.name).length
        };
    }

    function reconcileAdd(read: HudComponent[]): void {
        const check = addCheck;

        if (!check || !inEditor) {
            return;
        }

        const age = performance.now() - check.at;

        if (currentAdd()?.serial !== check.serial) {
            addCheck = undefined;
            return;
        }

        const verdict = decideAdd(read, get(frozenLayout), check, age);

        if (verdict.done) {
            addCheck = undefined;
            finishAdd(check.serial);
        } else if (verdict.key !== undefined) {
            console.info(`[Hud] ${check.name} was added but the layout kept it hidden (${verdict.key}): showing it`);
            addCheck = undefined;
            finishAdd(check.serial);
            void rememberEnabled(verdict.key, true);
        }
    }

    async function loadComponents(force = false) {
        if (!metadata) {
            try {
                metadata = await getMetadata();
            } catch (e) {
                console.warn("[Hud] could not read metadata.json", e);
            }
        }

        if (!metadata) {
            return;
        }

        const nativeTicket = ++nativeSequence;
        const themeTicket = ++themeSequence;

        try {
            const [nativeRaw, themeRaw] = await Promise.all([
                inEditor ? getNativeComponents() : Promise.resolve([]),
                getComponents(metadata.id)
            ]);

            // an unknown theme id gets an error object back instead of a list: not something to draw (or to call .map on)
            const native = Array.isArray(nativeRaw) ? nativeRaw : [];
            const theme = Array.isArray(themeRaw) ? themeRaw : [];

            if (!Array.isArray(themeRaw)) {
                console.warn(`[Hud] the client has no component list for theme id "${metadata.id}":`, themeRaw);
            }

            if (nativeTicket === nativeSequence) {
                nativeComponents = native;
            }

            lastRead = theme;

            // Right after an add, whatever the client says is ON of these (the add switches one of them on) is what the user asked for. This
            // is done for EVERY answer, also one that is dropped below because a newer load started: such an answer used to be thrown away
            // whole, while sync.ts already saw it in `lastRead` and told the client to switch the new component off again (the layout still
            // said off: a stale list had frozen it that way right after the add released it). Same tick as `lastRead`, so nothing compares
            // the two before the layout knows.
            if (inEditor && recentlyAdded()) {
                const multi = theme.filter(c => MULTI_INSTANCE.has(c.name));
                void learnFromPush(multi);
                adoptAdded(multi, MULTI_INSTANCE);
            }

            if (themeTicket === themeSequence && Array.isArray(themeRaw)) {
                // The user just added a component and the client switched one on: the layout (frozen from a list that did not have the add
                // yet) must not switch it off again. Done in the same tick as `lastRead`, before anything compares the two.
                if (inEditor && recentlyAdded()) {
                    adoptAdded(theme, MULTI_INSTANCE);
                }

                readMulti = theme.filter(c => MULTI_INSTANCE.has(c.name));

                if (themeLive) {
                    themeComponents = withReadMulti(themeComponents);

                    if (inEditor) {
                        learnFromPush(themeComponents);
                    }
                } else {
                    // Without a push (no world is loaded, as in the main menu) the theme has seen nothing of this list, and a component it
                    // has not seen is not drawn (see applyLayout / hideUnknown): an Image that was just added stayed hidden until a push
                    // said what it is, which only comes in game. The user asked for it, so the theme takes these over now. Only the ones
                    // that can be added several times: the rest of a read can still be the other list.
                    if (force && inEditor) {
                        learnFromPush(readMulti);
                    }

                    themeComponents = theme;
                }

                reconcileAdd(readMulti ?? []);
            }
        } catch (e) {
            console.warn("[Hud] could not load the components", e);
        }
    }

    // The editor asks for a reload after it added / removed a component (see reload.ts), so the result does not depend on the
    // websocket event alone. The store calls back once when it is subscribed: that first call is not a request.
    let reloadSeen = false;
    const stopReload = hudReload.subscribe(() => {
        if (reloadSeen) {
            startAddCheck();
            loadComponents(true);
        }
        reloadSeen = true;
    });
    onDestroy(stopReload);

    listenSticky("scaleFactorChange", (data: ScaleFactorChangeEvent) => {
        zoom = data.scaleFactor * 50;
    });

    // Sticky: the router wipes the plain per-route listeners on a route change, also while a screen that is still mounted (the iOS
    // ClickGUI turning around) is on screen, and the HUD would silently stop following the client.
    listenSticky("componentsUpdate", (event: ComponentsUpdateEvent) => {
        if (inEditor && event.source === "native") {
            nativeSequence++;
            nativeComponents = event.components;
        }


        if (event.source === "theme" && event.themeId === metadata?.id) {
            themeSequence++;
            themeLive = true;
            themeComponents = withReadMulti(event.components);

            // only the editor writes the theme's layout (two pages writing it would overwrite each other)
            if (inEditor) {
                learnFromPush(themeComponents);
            }

            loadComponents();
            refreshSoon();
        }
    });

    // Events sent while this page was not connected (websocket reconnecting) or not drawn (the client hides the page while the HUD
    // editor is open) are gone for good, and the HUD stayed on the old components. Read them again when the page is back.
    listenSticky("socketReady", () => {
        getGameWindow().then(gameWindow => { zoom = gameWindow.scaleFactor * 50; }).catch(() => {});
        loadComponents();
        refreshPositionsFromClient();
    });

    function onVisibilityChange() {
        if (!document.hidden) {
            loadComponents();
            refreshPositionsFromClient();
        }
    }
</script>

<svelte:document on:visibilitychange={onVisibilityChange}/>

<div class="hud" style="zoom: {zoom}%">
    {#each keyedComponents as {key, c} (key)}
        {#if c.settings.enabled}
            <DraggableComponent
                    {inEditor}
                    {animateIn}
                    {settingsComponent}
                    {onDragStateChange}
                    onPositionSaved={themeKeyById.has(c.id) ? (a) => rememberPosition(themeKeyById.get(c.id) ?? c.name, a) : undefined}
                    onRemoved={themeKeyById.has(c.id) ? () => { if (addCheck) { finishAdd(addCheck.serial); addCheck = undefined; } rememberRemoved(themeKeyById.get(c.id) ?? c.name); } : undefined}
                    componentId={c.id}
                    componentName={c.name}
                    alignment={c.settings.alignment}
                    zIndex={c.settings.zIndex ?? 0}
                    magneticallyReferenced={magneticTargetIds.includes(c.id)}
                    width={c.width}
                    height={c.height}
            >
                {#if c.name === "Watermark"}
                    <Watermark/>
                {:else if c.name === "ArrayList"}
                    <ArrayList settings={c.settings}/>
                {:else if c.name === "TabGui"}
                    <TabGui/>
                {:else if c.name === "Notifications"}
                    <Notifications settings={c.settings}/>
                {:else if c.name === "TargetHud"}
                    <TargetHud/>
                {:else if c.name === "BlockCounter"}
                    <BlockCounter settings={c.settings}/>
                {:else if c.name === "Hotbar"}
                    <HotBar/>
                {:else if c.name === "Scoreboard"}
                    <Scoreboard settings={c.settings}/>
                {:else if c.name === "ArmorItems"}
                    <GenericPlayerInventory
                            rowLength={c.settings.layout === "Horizontal" ? 4 : 1}
                            backgroundColor="transparent"
                            gap="2px"
                            getRenderedStacks={it => Array.from(it.armor).reverse()}
                    />
                {:else if c.name === "InventoryStatistics"}
                    <InventoryStatistics settings={c.settings}/>
                {:else if c.name === "Inventory"}
                    <GenericPlayerInventory rowLength={9} getRenderedStacks={it => it.main.slice(9)}/>
                {:else if c.name === "CraftingInventory"}
                    <GenericPlayerInventory rowLength={2} getRenderedStacks={it => it.crafting}/>
                {:else if c.name === "EnderChestInventory"}
                    <GenericPlayerInventory rowLength={9} getRenderedStacks={it => it.enderChest}/>
                {:else if c.name === "Taco"}
                    <Taco/>
                {:else if c.name === "Keystrokes"}
                    <Keystrokes/>
                {:else if c.name === "Effects"}
                    <Effects/>
                {:else if c.name === "Text"}
                    <Text settings={c.settings}/>
                {:else if c.name === "Image"}
                    <Image componentId={c.id} settings={c.settings} {inEditor}/>
                {:else if c.name === "KeyBinds"}
                    <KeyBinds/>
                {:else if c.name === "ClosedCaptions"}
                    <ClosedCaptions/>
                {:else if c.width !== undefined && c.height !== undefined}
                    <div></div>
                {/if}
            </DraggableComponent>
        {/if}
    {/each}
</div>

<style lang="scss">
  .hud {
    height: 100vh;
    width: 100vw;
  }
</style>
