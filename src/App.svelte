<script lang="ts">
    import Router, {location} from "svelte-spa-router";
    import ClickGuiRoute from "./routes/clickgui-ios/ClickGuiRoute.svelte";
    import Hud from "./routes/hud/Hud.svelte";
    import {gameLeave, getMetadata, getTheme, getVirtualScreen, openScreen} from "./integration/rest";
    import {cleanupListeners, listenAlways} from "./integration/ws";
    import {onDestroy, onMount} from "svelte";
    import {insertPersistentData} from "./integration/persistent_storage";
    import {isStatic} from "./integration/host";
    import Inventory from "./routes/inventory/Inventory.svelte";
    import Title from "./routes/menu/title/Title.svelte";
    import Multiplayer from "./routes/menu/multiplayer/Multiplayer.svelte";
    import AltManager from "./routes/menu/altmanager/AltManager.svelte";
    import Singleplayer from "./routes/menu/singleplayer/Singleplayer.svelte";
    import ProxyManager from "./routes/menu/proxymanager/ProxyManager.svelte";
    import None from "./routes/none/None.svelte";
    import Disconnected from "./routes/menu/disconnected/Disconnected.svelte";
    import BasicMenu from "./routes/menu/basicmenu/BasicMenu.svelte";
    import Browser from "./routes/browser/Browser.svelte";
    import {intToRgba, rgbaToHex} from "./integration/util";
    import type {ThemeColorChangeEvent} from "./integration/events";
    import Menu from "./routes/menu/common/Menu.svelte";
    import MenuContent from "./routes/menu/common/MenuContent.svelte";
    import {push} from "./integration/router";
    import {overlayFx, onFxClosed, fx} from "./routes/menu/title/main-menu/overlayfx";
    import {menuLink, nativeHandoff, resume} from "./routes/menu/title/main-menu/bridge";
    import {closing as guiClosing, LEAVE_MS} from "./routes/clickgui-ios/closing";

    // Plain menu screens (inside <Menu>). None are left: every screen of the main menu is an iPadOS-style one now.
    const menuRoutes: Record<string, any> = {};

    // The iPadOS-style screens draw their own full-screen stage, so they must not be inside <Menu>
    // (which adds padding, the header and a zoom).
    const iosRoutes = {
        "/multiplayer": Multiplayer,
        "/singleplayer": Singleplayer,
        "/altmanager": AltManager,
        "/proxymanager": ProxyManager,
    };

    const routes = {
        "/clickgui": ClickGuiRoute,
        "/hud": Hud,
        "/inventory": Inventory,
        "/none": None,
        "/disconnected": Disconnected,
        "/basicmenu": BasicMenu,
        "/browser": Browser
    };

    const SURFACE_TINT_MIX = 18;

    function isMenuRoute(route: string): boolean {
        return route in menuRoutes;
    }

    function isIosRoute(route: string): boolean {
        return route in iosRoutes;
    }

    // The title screen (lock screen + dock) is full-screen and handles its own scaling. It is not a Router route:
    // it stays mounted underneath Singleplayer/Multiplayer, so opening one of them can grow out of its dock icon and
    // going back can shrink into it again.
    function isTitleRoute(route: string): boolean {
        return route === "/title";
    }

    // Singleplayer / Multiplayer opened by the client with no menu under them (the player left a world, or cancelled the connecting
    // screen, and the client went back to the screen it was opened from) used to just appear, and closing them jumped to the menu. The
    // title is mounted under them instead and their dock window is shown as already open (see `adoptScreen` in MainMenu.svelte), so
    // closing them fades back to the menu.
    const ADOPT_ROUTES = ["/singleplayer", "/multiplayer"];
    let adoptScreen: string | null = null;
    // The whole page fades in when the client brings it up from the game (the adopted screens above, or the title itself) and no
    // window carries it, instead of popping up over the game / the connecting screen.
    let fadeIn = false;

    function cameFromGame(route: string): boolean {
        // not from the menu itself, and not from the basic menu (vanilla title with a strip of buttons: no dock to grow out of)
        return !isTitleRoute(route) && !isOverlayRoute(route) && route !== "/basicmenu";
    }

    // The menu screen the player last left for the game. Leaving a multiplayer game brings the client back to Multiplayer by itself, but
    // leaving a world brings it to the title, so the page asks for Singleplayer instead (see `returnToSingleplayer`).
    let lastMenuRoute = "";

    // Overlay screens only keep the title underneath when they were opened from it. Opened from anywhere else
    // (pause menu, in game, ...) they would show the lock screen through their transparent stage.
    let keepTitle = false;

    // The route whose screen is drawn. It equals `$location`, except right after an overlay screen (singleplayer,
    // multiplayer, ...) was left towards the title: that screen then stays mounted until the menu's app window has
    // shrunk back into its icon, so the screen can shrink along with it (see overlayfx.ts).
    let shownRoute = "";
    let lingering = false;
    let lingerTimer: ReturnType<typeof setTimeout> | undefined;
    // The ClickGUI was left towards the game (nothing carries it away): it stays mounted until its windows have slid out.
    // A GUI opened from the dock is NOT handled here: the app window shrinking into its icon carries it (see overlayfx.ts)
    // and it must never animate on its own on top of that, or it would flash up over the home screen.
    let guiLeaving = false;
    // Safety net: if the menu never reports that its window closed, the screen is dropped after this long anyway.
    const LINGER_MAX = 1200;

    // The client resets the page's address to the root ("#/?port=...") every time it closes a screen. That is not a route change: it
    // used to tear the whole menu down (the title and the app window under the screen) a moment before the client's own
    // "open title" arrived, so the window never got to animate and the menu was rebuilt from scratch. The root is ignored: the
    // route only follows real screens.
    let curRoute = "";
    $: if ($location !== "/") curRoute = $location;
    $: routeChanged(curRoute);

    function routeChanged(route: string) {
        // must be read before keepTitle is updated: was the title mounted underneath the screen being left?
        const titleWasUnder = keepTitle;

        if (isTitleRoute(route) || ADOPT_ROUTES.includes(route)) {
            lastMenuRoute = route;
        }

        const adopting = !titleWasUnder && ADOPT_ROUTES.includes(route) && cameFromGame(shownRoute);
        adoptScreen = adopting ? route.slice(1) : null;
        if (adopting) {
            // The player is out of the game: a join that was started shortly before (Play, Connect) is over, so an Esc on this screen is
            // an Esc (back to the title) and not "going in game" (see `closeScreen`).
            gameLeave.at = -1e9;
        }
        // Not at startup (nothing was shown before), and not when the menu replays its return from a native screen (`resume`: the
        // window shrinks into its icon by itself).
        fadeIn = shownRoute !== "" && !resume.id && cameFromGame(shownRoute) && (adopting || isTitleRoute(route));

        if (isTitleRoute(route) || adopting) {
            keepTitle = true;
        } else if (!isOverlayRoute(route)) {
            keepTitle = false;
        }

        clearTimeout(lingerTimer);

        const leavingGui = shownRoute === "/clickgui" && route !== "/clickgui";

        // A dock window already shrank into its icon and took the GUI with it (the layer is hidden, only the route was a moment
        // behind). The GUI is gone for the user: remove it, and never let it animate, or it would flash up over the home screen.
        if (leavingGui && fx.isGone()) {
            guiLeaving = false;
            lingering = false;
            shownRoute = route;
            guiClosing.set(false);
            return;
        }

        // Same for the other dock screens (singleplayer, multiplayer, ...) when the client's answer is slower than the shrinking window:
        // the window is gone and took the screen with it (the layer is hidden), so drop the screen now. Without this it stayed mounted,
        // invisible but still listening to keys, until the safety timer ran out.
        if (fx.isGone() && isTitleRoute(route) && titleWasUnder && isOverlayRoute(shownRoute)) {
            guiLeaving = false;
            lingering = false;
            shownRoute = route;
            guiClosing.set(false);
            return;
        }

        // A dock window is (still) carrying the GUI towards its icon: wait for it, the GUI does nothing of its own.
        // For the GUI that needs a window that really is there: without one nothing would ever carry it away.
        const carriedByWindow = isTitleRoute(route) && titleWasUnder && isOverlayRoute(shownRoute)
            && (shownRoute !== "/clickgui" || fx.active() || !!menuLink.expects?.("clickgui"));
        if (carriedByWindow) {
            guiLeaving = false;
            guiClosing.set(false);
            lingering = true;
            lingerTimer = setTimeout(endLinger, LINGER_MAX);
            return;
        }

        if (leavingGui) {
            // Left towards the game, nothing carries it: its windows slide out, then it is removed.
            // (Also reached again while it is already leaving: the timer simply starts over.)
            guiLeaving = true;
            lingering = true;
            guiClosing.set(true);
            lingerTimer = setTimeout(endGuiLeave, LEAVE_MS);
            return;
        }

        // Anything else, including the GUI coming back while it was still leaving: it is the same mounted GUI, it simply
        // turns around (`guiClosing` false) instead of being rebuilt.
        guiLeaving = false;
        guiClosing.set(false);
        lingering = false;
        shownRoute = route;
    }

    function endLinger() {
        // The GUI leaving has its own end (`endGuiLeave`); the app window reporting "closed" must not cut it short.
        if (!lingering || guiLeaving) {
            return;
        }
        clearTimeout(lingerTimer);
        lingering = false;
        shownRoute = curRoute;
    }

    function endGuiLeave() {
        if (!guiLeaving) {
            return;
        }
        clearTimeout(lingerTimer);
        guiLeaving = false;
        lingering = false;
        shownRoute = curRoute;
        guiClosing.set(false); // after the route changed, so the GUI that is being removed does not turn around first
    }

    // The page takes no clicks while it waits for the client to open one of its own screens (see LB.openNative).
    const handoffPending = nativeHandoff.pending;

    const offFxClosed = onFxClosed(endLinger);
    onDestroy(() => {
        offFxClosed();
        clearTimeout(lingerTimer);
    });

    // Screens that open from a dock icon and are drawn on top of the menu (the window of that icon stays under them).
    const overlayRoutes = ["/proxymanager", "/clickgui"];

    function isOverlayRoute(route: string): boolean {
        return isIosRoute(route) || overlayRoutes.includes(route);
    }

    // These screens are rendered directly instead of through <Router>: the Router follows the URL and would destroy
    // the screen the moment the route changes, but a closing screen has to stay alive for the closing animation.
    const directRoutes: Record<string, any> = {...menuRoutes, ...iosRoutes, "/clickgui": ClickGuiRoute};

    function directScreen(route: string): any {
        return directRoutes[route];
    }

    function isDirectRoute(route: string): boolean {
        return route in directRoutes;
    }

    function isTitleLayer(route: string, keep: boolean): boolean {
        return isTitleRoute(route) || (keep && isOverlayRoute(route));
    }

    // Title <-> Singleplayer/Multiplayer is one continuous "menu" flow (in the stock theme these screens are plain
    // menu routes), so hopping between them must not be treated as leaving the menu.
    function isMenuFlowRoute(route: string): boolean {
        return isMenuRoute(route) || isIosRoute(route) || isTitleRoute(route);
    }

    /**
     * Which top-level layer a route is drawn in. It keys the layer block in the template: a layer is always created
     * fresh and never resumed (see the comment there).
     */
    function layerOf(route: string): "menu" | "ios" | "title" | "other" {
        if (isMenuRoute(route)) {
            return "menu";
        }
        if (isTitleRoute(route)) {
            return "title";
        }
        return isIosRoute(route) ? "ios" : "other";
    }

    // The route most recently asked for. `$location` only follows after the hash change has been processed, so with
    // several virtualScreen events in quick succession it would still hold a stale route.
    let requestedRoute: string | null = null;

    /**
     * A screen the main menu asked for after its app window was already closed (Esc, or switching apps quickly: the
     * client answers a request some time later). Nobody wants it, so it is not shown. `menuLink.expects` knows which
     * screens belong to the windows that are open right now.
     */
    function isStrayScreen(route: string, previousRoute: string): boolean {
        if (!isOverlayRoute(route)) {
            return false;
        }

        const screen = route.slice(1);
        if (menuLink.expects?.(screen)) {
            return false;
        }

        // Only judge screens that belong to the menu: the title is underneath, or the menu asked for this one itself
        // (its title may have been rebuilt in the meantime). A screen the client opens on its own is left alone.
        const titleBelow = isTitleRoute(previousRoute) || (keepTitle && isOverlayRoute(previousRoute));
        return titleBelow || menuLink.wasAsked(screen);
    }

    // Sends the client back to the title when a stray screen was dropped. Not while an app window is open: that window
    // asks for its own screen, which replaces the stray one by itself (and the title would replace that one).
    const RECOVER_GAP = 300;
    let lastRecover = 0;

    function recoverFromStray() {
        const now = performance.now();
        if (menuLink.busy?.() || now - lastRecover < RECOVER_GAP) {
            return;
        }

        lastRecover = now;
        menuLink.seen = {name: "title", at: now};
        openScreen("title").catch(() => {});
    }

    // The client closed an app screen (Esc on its screen) that was drawn over the title. Going to "none" would unmount the menu under
    // it: the window would vanish with no animation and the page would be left empty (so Esc was pressed again, the client reopened
    // the screen, it was dropped as a stray and the title popped up from nothing). A screen opened from the menu goes back to the
    // menu, exactly like its Cancel button (`LB.leaveScreen`): the window is closed (fades / shrinks) and the client is asked for
    // the title. The route is NOT changed here: it follows the client's "open title" like it does for Cancel, and the screen
    // lingers until the window is gone. When the client opens the title by itself right after the close (it does on some Esc
    // paths), it is not asked twice: two title opens made the client close the first one again.
    const TITLE_ASK_DELAY = 150;
    // Going in game (join a server / world, reconnect) closes the screen too, but that is not an Esc: no way back to the title.
    const GAME_LEAVE_WINDOW = 8000;
    // A second Esc right after the return makes the client close the title again. It is reopened (the title is the menu's home).
    const TITLE_RETURN_WINDOW = 2000;
    let titleReturnAt = -1e9;

    async function closeScreen() {
        const left = (requestedRoute ?? curRoute).slice(1);

        // The window of this screen turned around (its icon was tapped while it shrank) and asked for the screen again, and the client
        // has not answered yet: this close is the answer to the Esc / Cancel that was already cancelled by the tap. The window stays.
        if (menuLink.expects?.(left) && menuLink.wasAsked(left)) {
            console.log(`[Router] Ignoring the close of ${left}: its window was opened again`);
            return;
        }

        const sinceLeave = Math.round(performance.now() - gameLeave.at);
        // The ClickGUI opened in game (no title underneath) closes towards the game. One opened from the dock has the title mounted
        // underneath (`keepTitle`) and must go back to it like the other dock screens do: the client does not always bring the title
        // back by itself (Esc on the HUD editor tab closes the whole screen), and without this the title was unmounted by the route
        // change to "none" and the home screen stayed blank until the client opened it again, several seconds later.
        const guiFromGame = left === "clickgui" && !keepTitle;

        // A page screen (Singleplayer) asked for one of the client's own screens (Create New World, Edit World): the client closes the page's
        // screen to open it. That is not an Esc: asking for the title here replaced the screen that had just been opened and the window
        // popped out of the menu. The screen is just dropped; when the native screen is closed again the client brings the page's screen
        // back, which is then adopted and faded in like a screen coming from the game (Create New World: its plate shrinks into its button).
        if (nativeHandoff.recent() && isOverlayRoute(`/${left}`) && left !== "clickgui") {
            console.log(`[Router] ${left} closed for a screen of the client`);
            await changeRoute("none");
            nativeHandoff.release();
            return;
        }

        if (guiFromGame || !isOverlayRoute(`/${left}`) || sinceLeave < GAME_LEAVE_WINDOW) {
            await changeRoute("none");
            return;
        }

        console.log(`[Router] Close of ${left}: back to the title`);
        titleReturnAt = performance.now();
        menuLink.closeNow?.(left); // no-op when it is already closing

        const closedAt = performance.now();
        setTimeout(() => {
            if (menuLink.seen.name === "title" && menuLink.seen.at > closedAt) {
                return; // the client already opened it
            }
            if (menuLink.busy?.()) {
                return; // an app window was opened in the meantime: it asks for its own screen, and a title would replace that one
            }
            openScreen("title").catch(() => {});
        }, TITLE_ASK_DELAY);
    }

    // The client opened the title while the player was in game, and the last menu the player left for the game was Singleplayer (Play, or a
    // world just created): the client does that on its own after leaving a world, while after leaving a server it goes back to
    // Multiplayer. The title is not shown: Singleplayer is asked for instead, and it is adopted like Multiplayer is (the title mounts
    // under it, its window is shown open and the page fades in), so Esc / Cancel on it shrinks back to the menu.
    const RETURN_SINGLEPLAYER_MAX = 2000;

    function shouldReturnToSingleplayer(): boolean {
        const previous = requestedRoute ?? curRoute;
        return lastMenuRoute === "/singleplayer" && previous !== "" && cameFromGame(previous);
    }

    function returnToSingleplayer() {
        console.log("[Router] Left a world: back to singleplayer");
        const before = requestedRoute ?? curRoute;
        gameLeave.at = -1e9;
        menuLink.seen = {name: "singleplayer", at: performance.now()};

        const fallback = async () => {
            // The client did not bring Singleplayer up (the request failed or was ignored): show whatever it shows now, instead of
            // leaving an empty page over its title.
            if ((requestedRoute ?? curRoute) !== before) {
                return;
            }

            try {
                const actual = (await getVirtualScreen()).name || "none";
                if (actual !== "none") {
                    await changeRoute(actual, true);
                }
            } catch (error) {
                console.error("[Router] Could not follow the client after leaving a world", error);
            }
        };

        openScreen("singleplayer").catch(fallback);
        setTimeout(fallback, RETURN_SINGLEPLAYER_MAX);
    }

    async function changeRoute(name: string, fromSync = false) {
        const nextRoute = `/${name}`;
        const previousRoute = requestedRoute ?? curRoute;

        const stray = isStrayScreen(nextRoute, previousRoute);
        // The client has answered the menu's request for this screen (whether it is wanted or not): it is not pending any more, so
        // the next time the client opens it on its own it is not taken for a late answer.
        menuLink.answered(name);

        if (stray) {
            console.log(`[Router] Ignoring ${name}: the app window that asked for it is already closed`);
            recoverFromStray();
            return;
        }

        requestedRoute = nextRoute;

        // Not when the same screen is asked for again: it stays mounted, so its listeners must stay too.
        if (previousRoute !== nextRoute && (!isMenuFlowRoute(previousRoute) || !isMenuFlowRoute(nextRoute))) {
            cleanupListeners();
        }

        console.log(`[Router] Redirecting to ${name}`);
        await push(nextRoute);

        if (!fromSync) {
            scheduleScreenSync();
        }
    }

    // After a burst of screen changes (fast clicking, Esc) the theme can end up on a different screen than the one
    // the client actually shows. Once things have been quiet for a moment, ask the client which screen is open and
    // follow it. This runs at most once per burst, so it can never ping-pong.
    const SCREEN_SYNC_DELAY = 400;
    let screenSyncTimer: ReturnType<typeof setTimeout> | undefined;

    function scheduleScreenSync() {
        clearTimeout(screenSyncTimer);

        const expectedRoute = requestedRoute;
        screenSyncTimer = setTimeout(async () => {
            try {
                const virtualScreen = await getVirtualScreen();
                const actualName = virtualScreen.name || "none";

                // A newer change came in while asking: that one schedules its own sync.
                if (requestedRoute !== expectedRoute || expectedRoute === `/${actualName}`) {
                    return;
                }

                console.log(`[Router] Out of sync with the client, switching to ${actualName}`);
                await changeRoute(actualName, true);
            } catch (error) {
                console.error("[Router] Could not sync the screen with the client", error);
            }
        }, SCREEN_SYNC_DELAY);
    }

    function setThemeColor(name: string, value: string) {
        document.documentElement.style.setProperty(`--${name}`, value);
    }

    function themeColorToHex(value: number) {
        return rgbaToHex(intToRgba(value));
    }

    function mixColors(leftColor: string, rightColor: string, strength: number) {
        return `color-mix(in srgb, ${leftColor} ${100 - strength}%, ${rightColor})`;
    }

    function applyAccentColor(color: number) {
        setThemeColor("accent-color", themeColorToHex(color));
    }

    function applyTintColor(defaultSurfaceColor: string, color: number) {
        setThemeColor("surface-color", mixColors(defaultSurfaceColor, themeColorToHex(color), SURFACE_TINT_MIX));
    }

    onMount(async () => {
        let metadata = await getMetadata();
        let defaultSurfaceColor = metadata.colors.Tint;

        // The client answers with an error object (no `colors`) when it has no theme registered under this id: right after the id in
        // metadata.json was changed and the client was not restarted / the theme not selected, or when this page loaded before the client
        // had registered the theme. That used to throw here, and since nothing below this point had run yet the page never picked a route:
        // only the native background was left on screen. So the colors from metadata.json are used meanwhile, and the page asks again a
        // few times (and when the socket connects): a page that stayed on those colors showed them instead of the client's accent.
        let colorsFromClient = false;
        let warned = false;

        async function loadThemeColors(): Promise<void> {
            try {
                const theme = await getTheme(metadata.id);

                if (typeof theme?.colors?.accent !== "number" || typeof theme?.colors?.tint !== "number") {
                    throw new Error("the client sent no colors for it");
                }

                applyAccentColor(theme.colors.accent);
                applyTintColor(defaultSurfaceColor, theme.colors.tint);
                colorsFromClient = true;
            } catch (e) {
                if (!warned) {
                    warned = true;
                    console.warn(`[Theme] the client does not know a theme with id "${metadata.id}" (${e}); using the colors from metadata.json. `
                        + `Select the theme in the client (Render > HUD > Theme, or ".client theme set <name>") and make sure the metadata.json inside the built theme has this id.`);

                    // only the first time: a later failed try must not undo a color the client sent in the meantime (themeColorChange)
                    setThemeColor("accent-color", metadata.colors.Accent);
                    setThemeColor("surface-color", defaultSurfaceColor);
                }
            }
        }

        await loadThemeColors();

        const retryDelays = [1000, 2000, 4000, 8000, 16000];
        const retryThemeColors = () => {
            const delay = retryDelays.shift();

            if (colorsFromClient || delay === undefined) {
                return;
            }

            setTimeout(async () => {
                await loadThemeColors();
                retryThemeColors();
            }, delay);
        };
        retryThemeColors();

        await insertPersistentData();

        listenAlways("themeColorChange", async (event: ThemeColorChangeEvent) => {
            if (event.themeId !== metadata?.id) {
                return;
            }

            switch (event.name) {
                case "Accent":
                    applyAccentColor(event.value);
                    break;
                case "Tint":
                    applyTintColor(defaultSurfaceColor, event.value);
                    break;
            }
        });

        if (isStatic) {
            return;
        }

        listenAlways("socketReady", async () => {
            if (!colorsFromClient) {
                loadThemeColors();
            }

            const virtualScreen = await getVirtualScreen();
            await changeRoute(virtualScreen.name || "none");
        });

        listenAlways("virtualScreen", async (event: any) => {
            console.log(`[Router] Virtual screen change to ${event.screenName}`);
            const action = event.action;
            menuLink.seen = {name: action === "open" ? event.screenName || "none" : "none", at: performance.now()};

            switch (action) {
                case "close":
                    if (event.screenName === "title" && performance.now() - titleReturnAt < TITLE_RETURN_WINDOW
                        && performance.now() - gameLeave.at >= GAME_LEAVE_WINDOW) {
                        console.log("[Router] The client closed the title right after the return: asking for it again");
                        menuLink.seen = {name: "title", at: performance.now()};
                        openScreen("title").catch(() => {});
                        break;
                    }
                    await closeScreen();
                    break;
                case "open":
                    // the client has taken over from a fading page, or its screen is back
                    nativeHandoff.release();

                    if (event.screenName === "title" && shouldReturnToSingleplayer()) {
                        returnToSingleplayer();
                        break;
                    }

                    if (event.screenName === "title") {
                        // lets the title menu close an app window it kept open while a native screen was shown
                        window.dispatchEvent(new Event("lb:title-open"));

                        // The client went back to its own title (Esc on its screen) without closing the screen first, so the
                        // window that shows that screen is still open. Close it now so it fades / shrinks out, instead of the
                        // screen hanging until the safety timer and then vanishing.
                        const left = (requestedRoute ?? curRoute).slice(1);
                        // (Not when that window was opened again and has asked for its screen: this title is the answer to the close before.)
                        if (left !== "clickgui" && isOverlayRoute(`/${left}`)
                            && menuLink.expects?.(left) && !menuLink.closing?.(left) && !menuLink.wasAsked(left)) {
                            console.log(`[Router] Title opened while ${left} is open: closing its window`);
                            menuLink.closeNow?.(left);
                        }
                    }
                    await changeRoute(event.screenName || "none");
                    break;
            }
        });

        const virtualScreen = await getVirtualScreen();
        await changeRoute(virtualScreen.name || "none");
    });
</script>

<main class:fade-in={fadeIn} class:handoff={$handoffPending}>
    <!--
        Keyed by layer so that switching between the menu and the iOS screens always builds a fresh layer.

        Without the key, Svelte keeps the layer that is being left alive while its |global outro transitions play
        (~500ms) and *resumes* that same half faded-out layer when the user comes back inside that window. Clicking
        Singleplayer/Multiplayer and backing out quickly then left the title buttons stuck invisible (only the
        background remained). A key change never resumes the old block, so the new layer always plays its intro.
    -->
    <!--
        One shared dimming layer for the menu and the iOS screens. It used to be drawn by <Menu> and again by the iOS
        layer, so while the old layer was still fading out the two stacked and everything looked twice as dark.
    -->
    {#if isMenuRoute(shownRoute) || isIosRoute(shownRoute) || isTitleRoute(shownRoute)}
        <div class="shaderfix"></div>
    {/if}

    <!-- Outside the keyed layer on purpose: it must survive title <-> singleplayer/multiplayer. -->
    {#if isTitleLayer(curRoute, keepTitle)}
        <Title overlayActive={isOverlayRoute(curRoute)}
               overlayScreen={isOverlayRoute(curRoute) ? curRoute.slice(1) : null}
               {adoptScreen}/>
    {/if}

    {#key layerOf(shownRoute)}
      <!--
        display: contents while idle; while an app window opens or closes, the main menu scales this onto the window.
        While it lingers (screen already left, window still closing) it must not take clicks.
      -->
      <div class="fx" class:lingering use:overlayFx>
        {#if isMenuRoute(shownRoute)}
            <Menu>
                {#key shownRoute}
                    <MenuContent>
                        <svelte:component this={directScreen(shownRoute)}/>
                    </MenuContent>
                {/key}
            </Menu>
        {:else if isIosRoute(shownRoute) || isDirectRoute(shownRoute)}
            <svelte:component this={directScreen(shownRoute)}/>
        {:else if isTitleRoute(shownRoute)}
            <!-- drawn by <Title> above -->
        {:else}
            <Router {routes}/>
        {/if}
      </div>
    {/key}
</main>

<style lang="scss">
    .fx {
        display: contents;
    }

    // The page comes up from the game: fade it in. (Opacity on <main> only for these ~0.3 s; the glass blurs of the screens come back
    // when it ends, over a wallpaper that is blurred already.)
    main.fade-in {
        animation: page-fade-in 320ms ease-out backwards;
    }

    // A screen of the client (Create New World, Edit World) was asked for and has not taken over yet: no second click.
    main.handoff {
        pointer-events: none;
    }

    @keyframes page-fade-in {
        from {
            opacity: 0;
        }
    }

    .fx.lingering {
        pointer-events: none;
    }

    // The window that carries the screen was told to close (overlayfx.ts): the screen shrinking over the dock must not take the
    // tap meant for the next app's icon. This is before the client has answered (that is when `lingering` starts), and the
    // screens' own `pointer-events: auto` (the settings sheet, ...) would win over a plain `none` on the wrapper.
    :global(.fx[data-fx-closing]),
    :global(.fx[data-fx-closing] *) {
        pointer-events: none !important;
    }

    // Shared by the menu and the iOS screens (see the template).
    .shaderfix {
        top: -500px;
        left: -500px;
        position: absolute;
        background-color: rgba(black, 0.1); // was $shaderfix-color in JelloBounce's colors.scss
        width: 99999px;
        height: 99999px;
        z-index: -9999999;
    }
</style>
