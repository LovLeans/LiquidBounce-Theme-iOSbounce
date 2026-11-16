import {REST_BASE} from "./host";
import type {
    Account,
    ModuleCategory,
    Alignment,
    Browser,
    ClientInfo,
    ClientUpdate,
    ClientUser,
    ConfigurableSetting,
    FileSelectDialog,
    FileSelectResult,
    GameWindow,
    HitResult,
    HudComponent,
    HudComponentCatalogEntry,
    Metadata,
    MinecraftKeybind,
    Module,
    PersistentStorageItem,
    PlayerData,
    PrintableKey,
    Protocol,
    Proxy,
    RegistryItem,
    Server,
    Session,
    Theme,
    VirtualScreen,
    World
} from "./types";
import type {PlayerInventory} from "./events";
import {isLoggingIn} from "../routes/menu/altmanager/altmanager_store";
import {replace} from "svelte-spa-router";
import {generateUsername} from "../util/random_username";

const API_BASE = `${REST_BASE}/api/v1`;

/**
 * When the page last asked the client to put the player in a game (join a server or world, reconnect). The client closes the
 * current screen on its own then; App.svelte uses this to tell that close from an Esc.
 */
export const gameLeave = {at: -1e9};

export async function getMetadata(): Promise<Metadata> {
    const response = await fetch(`metadata.json`);
    const data: Metadata = await response.json();

    return data;
}

async function fetchModules(): Promise<Module[]> {
    const response = await fetch(`${API_BASE}/client/modules`);
    const data: [Module] = await response.json();

    return data;
}

// getModules() is called by the ArrayList, KeyBinds and TabGui on EVERY moduleToggle (loading a config toggles a hundred modules in one
// go: ~300 full requests + JSON parses). Now at most one request is out and one is queued behind it. A caller that arrives while a
// request is out waits for the queued one (the answer in flight may predate the change that made it ask), and everyone who arrives
// meanwhile shares that one.
let modulesInFlight: Promise<Module[]> | null = null;
let modulesQueued: Promise<Module[]> | null = null;

function startModulesRequest(): Promise<Module[]> {
    const request = fetchModules();
    modulesInFlight = request;
    const release = () => {
        if (modulesInFlight === request) {
            modulesInFlight = null;
        }
    };
    request.then(release, release);
    return request;
}

/** Each caller gets its own copy of the list: TabGui edits `enabled` on its objects, which must not show up in the others' lists. */
const copyModules = (list: Module[]): Module[] => Array.isArray(list) ? list.map(m => ({...m})) : list;

export function getModules(): Promise<Module[]> {
    let shared: Promise<Module[]>;
    if (modulesInFlight === null) {
        shared = startModulesRequest();
    } else {
        modulesQueued ??= modulesInFlight.then(() => undefined, () => undefined).then(() => {
            modulesQueued = null;
            return startModulesRequest();
        });
        shared = modulesQueued;
    }
    return shared.then(copyModules);
}

export async function getCategories(): Promise<ModuleCategory[]> {
    const response = await fetch(`${API_BASE}/client/modules/categories`);
    const data: [ModuleCategory] = await response.json();

    return data;
}

export async function getModule(name: string): Promise<Module> {
    const response = await fetch(`${API_BASE}/client/module/${name}`);
    const data = await response.json();

    return data;
}

export async function getModuleSettings(name: string): Promise<ConfigurableSetting> {
    const searchParams = new URLSearchParams({name});

    const response = await fetch(`${API_BASE}/client/modules/settings?${searchParams.toString()}`);
    const data = await response.json();

    return data;
}

/** A refused request (4xx / 5xx) is a failure: fetch only rejects when the request could not be sent at all. */
function ensureOk(response: Response, what: string): void {
    if (!response.ok) {
        throw new Error(`${what} was refused by the client: HTTP ${response.status}`);
    }
}

export async function setModuleSettings(name: string, settings: ConfigurableSetting) {
    const searchParams = new URLSearchParams({name});

    const response = await fetch(`${API_BASE}/client/modules/settings?${searchParams.toString()}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(settings)
    });
    ensureOk(response, `Saving the settings of ${name}`);
}

export async function getSpooferSettings(): Promise<ConfigurableSetting> {
    const response = await fetch(`${API_BASE}/client/spoofer`);
    const data = await response.json();

    return data;
}

export async function setSpooferSettings(settings: ConfigurableSetting) {
    await fetch(`${API_BASE}/client/spoofer`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(settings)
    });
}

export async function getGlobalSettings(): Promise<ConfigurableSetting> {
    const response = await fetch(`${API_BASE}/client/global`);
    const data = await response.json();

    return data;
}

export async function setGlobalSettings(settings: ConfigurableSetting) {
    await fetch(`${API_BASE}/client/global`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(settings)
    });
}

export async function setModuleEnabled(name: string, enabled: boolean) {
    const response = await fetch(`${API_BASE}/client/modules/toggle`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            name,
            enabled
        })
    });
    // used to pass silently: the GUI showed a module as switched that the client had refused
    ensureOk(response, `Switching ${name}`);
}

export async function getPersistentStorageItems(): Promise<PersistentStorageItem[]> {
    const response = await fetch(`${API_BASE}/client/localStorage/all`);
    const data: PersistentStorageItem[] = (await response.json()).items;

    return data;
}

export async function setPersistentStorageItems(items: PersistentStorageItem[]) {
    await fetch(`${API_BASE}/client/localStorage/all`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({items})
    })
}

export async function getVirtualScreen(): Promise<VirtualScreen> {
    const response = await fetch(`${API_BASE}/client/virtualScreen`);
    const data: VirtualScreen = await response.json();

    return data;
}

export async function confirmVirtualScreen(name: string) {
    await fetch(`${API_BASE}/client/virtualScreen`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({name})
    });
}

export async function getPlayerData(): Promise<PlayerData> {
    const response = await fetch(`${API_BASE}/client/player`);
    const data: PlayerData = await response.json();

    return data;
}

export async function openFileDialog(body: FileSelectDialog): Promise<FileSelectResult> {
    const response = await fetch(`${API_BASE}/client/fileDialog`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    return await response.json();
}

export async function getPlayerInventory(): Promise<PlayerInventory> {
    const response = await fetch(`${API_BASE}/client/player/inventory`);
    const data: PlayerInventory = await response.json();

    return data;
}

export async function getCrosshairData(): Promise<HitResult> {
    const response = await fetch(`${API_BASE}/client/crosshair`);
    const data: HitResult = await response.json();

    return data;
}

export async function getPrintableKeyName(key: string): Promise<PrintableKey> {
    const searchParams = new URLSearchParams({key});

    const response = await fetch(`${API_BASE}/client/input?${searchParams.toString()}`);
    const data: PrintableKey = await response.json();

    return data;
}

export async function getMinecraftKeybinds(): Promise<MinecraftKeybind[]> {
    const response = await fetch(`${API_BASE}/client/keybinds`);
    const data: MinecraftKeybind[] = await response.json();

    return data;
}

export async function getRegistryItems(name: string): Promise<Record<string, RegistryItem>> {
    const response = await fetch(`${API_BASE}/client/registry/${name}`);
    const data: Record<string, RegistryItem> = await response.json();

    return data;
}

export async function getSession(): Promise<Session> {
    const response = await fetch(`${API_BASE}/client/session`);
    const data: Session = await response.json();

    return data;
}

export async function browse(target: string) {
    await fetch(`${API_BASE}/client/browse`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({target})
    });
}

export async function browsePath(path: string) {
    await fetch(`${API_BASE}/client/browsePath`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({path})
    });
}

export async function exitClient() {
    await fetch(`${API_BASE}/client/exit`, {
        method: "POST"
    });
}

export async function openScreen(name: string) {
    await fetch(`${API_BASE}/client/screen`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({name})
    });
}

export async function deleteScreen() {
    await fetch(`${API_BASE}/client/screen`, {
        method: "DELETE"
    });
}

export async function getServers(): Promise<Server[]> {
    const response = await fetch(`${API_BASE}/client/servers`);
    const data: Server[] = await response.json();

    return data;
}

export async function getLanServers(): Promise<Server[]> {
    const response = await fetch(`${API_BASE}/client/servers/lan`);

    if (!response.ok) {
        return [];
    }

    const data: Server[] = await response.json();

    return data;
}

export async function connectToServer(address: string) {
    gameLeave.at = performance.now();
    await fetch(`${API_BASE}/client/servers/connect`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({address})
    });
}

export async function removeServer(id: number) {
    const response = await fetch(`${API_BASE}/client/servers/remove`, {
        method: "DELETE",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({id})
    });
    ensureOk(response, "Removing the server");
}

export async function addServer(name: string, address: string, resourcePackPolicy: string) {
    const response = await fetch(`${API_BASE}/client/servers/add`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({name, address, resourcePackPolicy})
    });
    // a refused entry (4xx / 5xx) keeps the dialog open instead of closing as if it had been saved
    ensureOk(response, "Adding the server");
}

export async function editServer(id: number, name: string, address: string, resourcePackPolicy: string) {
    const response = await fetch(`${API_BASE}/client/servers/edit`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({id, name, address, resourcePackPolicy})
    });
    // a refused entry (4xx / 5xx) keeps the dialog open instead of closing as if it had been saved
    ensureOk(response, "Saving the server");
}

export async function orderServers(order: number[]) {
    await fetch(`${API_BASE}/client/servers/order`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({order})
    });
}

export async function getProtocols(): Promise<Protocol[]> {
    const response = await fetch(`${API_BASE}/client/protocols`);
    const data: Protocol[] = await response.json();

    return data;
}

export async function getSelectedProtocol(): Promise<Protocol> {
    const response = await fetch(`${API_BASE}/client/protocols/protocol`);
    const data: Protocol = await response.json();

    return data;
}

export async function setSelectedProtocol(protocol: Protocol) {
    await fetch(`${API_BASE}/client/protocols/protocol`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({version: protocol.version})
    });
}

export async function restoreSession() {
    isLoggingIn.set(true);
    await fetch(`${API_BASE}/client/account/restore`, {
        method: "POST",
    }).finally(() => isLoggingIn.set(false));
}

export async function orderAccounts(order: number[]) {
    const response = await fetch(`${API_BASE}/client/accounts/order`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({order})
    });
    ensureOk(response, "Saving the account order");
}


export async function addCrackedAccount(username: string, online: boolean) {
    await fetch(`${API_BASE}/client/accounts/new/cracked`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({username, online})
    });
}

export async function addSessionAccount(token: string) {
    await fetch(`${API_BASE}/client/accounts/new/session`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({token})
    });
}

export async function addAlteningAccount(token: string) {
    await fetch(`${API_BASE}/client/accounts/new/altening`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({token})
    });
}

export async function addMicrosoftAccountWebView() {
    await fetch(`${API_BASE}/client/accounts/new/microsoft/webview`, {
        method: "POST",
    });
}

export async function addMicrosoftAccountDeviceCode() {
    await fetch(`${API_BASE}/client/accounts/new/microsoft/device-code`, {
        method: "POST",
    });
}

export async function addMicrosoftAccountDeviceCodeCopyUrl() {
    await fetch(`${API_BASE}/client/accounts/new/microsoft/device-code/clipboard`, {
        method: "POST",
    });
}

export async function addMicrosoftAccountCredentials(email: string, password: string) {
    await fetch(`${API_BASE}/client/accounts/new/microsoft/credentials`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({email, password})
    });
}

export async function setAccountFavorite(id: number, favorite: boolean) {
    const response = await fetch(`${API_BASE}/client/account/favorite`, {
        method: favorite ? "PUT" : "DELETE",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({id})
    });
    ensureOk(response, "Changing the account favorite");
}

export async function removeAccount(id: number) {
    const response = await fetch(`${API_BASE}/client/account`, {
        method: "DELETE",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({id})
    });
    ensureOk(response, "Removing the account");
}

export async function loginToAccount(id: number) {
    isLoggingIn.set(true);
    await fetch(`${API_BASE}/client/account/login`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({id})
    }).finally(() => isLoggingIn.set(false));
}

export async function directLoginToCrackedAccount(username: string, online: boolean) {
    isLoggingIn.set(true);
    await fetch(`${API_BASE}/client/account/login/cracked`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({username, online})
    }).finally(() => isLoggingIn.set(false));
}

export async function directLoginToSessionAccount(token: string) {
    isLoggingIn.set(true);
    await fetch(`${API_BASE}/client/account/login/session`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({token})
    }).finally(() => isLoggingIn.set(false));
}

export async function getAccounts(): Promise<Account[]> {
    const response = await fetch(`${API_BASE}/client/accounts`);
    const data: Account[] = await response.json();

    return data;
}

export async function getWorlds(): Promise<World[]> {
    const response = await fetch(`${API_BASE}/client/worlds`);
    const data: World[] = await response.json();

    return data;
}

export async function openWorld(name: string) {
    gameLeave.at = performance.now();
    const response = await fetch(`${API_BASE}/client/worlds/join`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({name})
    });
}

export async function editWorld(name: string) {
    const response = await fetch(`${API_BASE}/client/worlds/edit`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({name})
    });
}

export async function removeWorld(name: string) {
    const response = await fetch(`${API_BASE}/client/worlds/delete`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({name})
    });
    ensureOk(response, "Removing the world");
}

export async function getProxies(): Promise<Proxy[]> {
    const response = await fetch(`${API_BASE}/client/proxies`);
    const data: Proxy[] = await response.json();

    return data;
}

export async function checkProxy(id: number) {
    await fetch(`${API_BASE}/client/proxies/check`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({id})
    });
}

export async function getCurrentProxy(): Promise<Proxy | null> {
    const response = await fetch(`${API_BASE}/client/proxy`);

    if (response.status !== 200) {
        return null;
    }

    const data: Proxy = await response.json();

    return data;
}

export async function disconnectFromProxy() {
    await fetch(`${API_BASE}/client/proxy`, {
        method: "DELETE",
    });
}

export async function setProxyFavorite(id: number, favorite: boolean) {
    const response = await fetch(`${API_BASE}/client/proxies/favorite`, {
        method: favorite ? "PUT" : "DELETE",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({id})
    });
    ensureOk(response, "Changing the proxy favorite");
}

export async function addProxy(host: string, port: number, username: string, password: string, type: string, forwardAuthentication: boolean, proxyResourcePacks: boolean, proxyDns: boolean) {
    await fetch(`${API_BASE}/client/proxies/add`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({host, port, username, password, type, forwardAuthentication, proxyResourcePacks, proxyDns})
    });
}

export async function editProxy(id: number, host: string, port: number, username: string, password: string, type: string, forwardAuthentication: boolean, proxyResourcePacks: boolean, proxyDns: boolean) {
    await fetch(`${API_BASE}/client/proxies/edit`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({id, host, port, username, password, type, forwardAuthentication, proxyResourcePacks, proxyDns})
    })
}

export async function addProxyFromClipboard() {
    await fetch(`${API_BASE}/client/proxies/add/clipboard`, {
        method: "POST"
    });
}

export async function removeProxy(id: number) {
    const response = await fetch(`${API_BASE}/client/proxies/remove`, {
        method: "DELETE",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({id})
    });
    ensureOk(response, "Removing the proxy");
}

export async function connectToProxy(id: number) {
    await fetch(`${API_BASE}/client/proxy`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({id})
    });
}

export async function getGameWindow(): Promise<GameWindow> {
    const response = await fetch(`${API_BASE}/client/window`);
    const data: GameWindow = await response.json();

    return data;
}

// The client keeps a single "HUD editor selected" flag, so the last request to arrive wins. These calls come from several places
// (the GUI route resets it when it opens, the HUD editor tab sets it and clears it when it goes away) and are fired without being
// awaited: when the GUI is reopened on the HUD editor tab they used to overlap, a late `false` could land after the editor's `true`,
// and the editor came up empty. Sending them one after another, in call order, makes the last call the last to arrive.
let hudEditorSelectedQueue: Promise<unknown> = Promise.resolve();

export function setHudEditorSelected(selected: boolean): Promise<void> {
    const request = hudEditorSelectedQueue.then(async () => {
        await fetch(`${API_BASE}/client/hud-editor`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({selected})
        });
    });
    // a failed request must not block the ones after it (the caller still sees the error through the returned promise)
    hudEditorSelectedQueue = request.catch(() => {});
    return request;
}

/**
 * @param id Use the ID from [getMetadata].
 */
export async function getTheme(id: string): Promise<Theme> {
    const response = await fetch(`${API_BASE}/client/theme/${id}`);
    return await response.json();
}

/**
 * @param id Use the ID from [getMetadata].
 */
export async function getComponents(id: string): Promise<HudComponent[]> {
    const response = await fetch(`${API_BASE}/client/components/${id}`);
    return await response.json();
}

export async function getNativeComponents(): Promise<HudComponent[]> {
    const response = await fetch(`${API_BASE}/client/components/native`);
    return await response.json();
}

export async function getComponentCatalog(id: string): Promise<HudComponentCatalogEntry[]> {
    const response = await fetch(`${API_BASE}/client/components/${id}/catalog`);
    return await response.json();
}

export async function addComponent(id: string): Promise<void> {
    const response = await fetch(`${API_BASE}/client/components/${id}`, {
        method: "POST"
    });

    if (!response.ok) {
        throw new Error(`Failed to add HUD component (HTTP ${response.status})`);
    }
}

export async function setComponentAlignment(id: string, alignment: Alignment): Promise<void> {
    const response = await fetch(`${API_BASE}/client/components/${id}/alignment`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(alignment)
    });

    // a refused save used to pass silently: the editor showed the new position, the client never got it
    if (!response.ok) {
        throw new Error(`Failed to save the HUD component position (HTTP ${response.status})`);
    }
}

export async function bringComponentToFront(id: string): Promise<number> {
    const response = await fetch(`${API_BASE}/client/components/${id}/z-index`, {
        method: "POST"
    });

    const data: { zIndex: number } = await response.json();
    return data.zIndex;
}

export async function getComponentSettings(id: string): Promise<ConfigurableSetting> {
    const response = await fetch(`${API_BASE}/client/components/${id}/settings`);
    return await response.json();
}

export function getComponentFileUrl(id: string, cacheKey?: string): string {
    const url = `${API_BASE}/client/components/${id}/file`;
    return cacheKey === undefined ? url : `${url}?v=${encodeURIComponent(cacheKey)}`;
}

export async function setComponentSettings(id: string, settings: ConfigurableSetting): Promise<void> {
    const response = await fetch(`${API_BASE}/client/components/${id}/settings`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(settings)
    });

    // a refused save used to pass silently: the GUI showed the change, the client never got it
    if (!response.ok) {
        // the client's answer usually names the cause of an error: keep (a short part of) it
        const detail = (await response.text().catch(() => "")).trim().slice(0, 200);
        throw new Error(`Failed to save the HUD component settings (HTTP ${response.status}${detail ? `: ${detail}` : ""})`);
    }
}

export async function getClientInfo(): Promise<ClientInfo> {
    const response = await fetch(`${API_BASE}/client/info`);
    const data: ClientInfo = await response.json();

    return data;
}

export async function getClientUpdate(): Promise<ClientUpdate> {
    const response = await fetch(`${API_BASE}/client/update`);
    const data: ClientUpdate = await response.json();

    return data;
}

export async function reconnectToServer() {
    gameLeave.at = performance.now();
    await fetch(`${API_BASE}/client/reconnect`, {
        method: "POST",
    });
}

export async function toggleBackgroundShaderEnabled() {
    await fetch(`${API_BASE}/client/shader`, {
        method: "POST",
    });
}

export async function toggleBasicMode() {
    await fetch(`${API_BASE}/client/basic-mode`, {
        method: "POST",
    });
}

export async function getBrowser(): Promise<Browser> {
    const response = await fetch(`${API_BASE}/client/browser`);
    const data: Browser = await response.json();

    return data;
}

export async function browserNavigate(url: string) {
    await fetch(`${API_BASE}/client/browser/navigate`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({url})
    })
}

export async function browserGoForward() {
    await fetch(`${API_BASE}/client/browser/forward`, {
        method: "POST",
    });
}

export async function browserGoBack() {
    await fetch(`${API_BASE}/client/browser/back`, {
        method: "POST",
    });
}

export async function browserReload() {
    await fetch(`${API_BASE}/client/browser/reload`, {
        method: "POST",
    });
}

export async function browserForceReload() {
    await fetch(`${API_BASE}/client/browser/forceReload`, {
        method: "POST",
    });
}

export async function browserClose() {
    await fetch(`${API_BASE}/client/browser/close`, {
        method: "POST",
    });
}

/**
 * A fresh random username on every call. It is made here and not by the client: the client's generator
 * (`/client/account/random-name`) only picks from a fixed list of names.
 */
export async function randomUsername(): Promise<string> {
    return generateUsername();
}

let lastTypingState: boolean | null = null;
// What the page asks for (a text field has focus) and what a screen wants regardless of that (see setTypingBaseline).
// The client gets the two combined, so one cannot switch the other off.
let wantTyping = false;
let baselineTyping = false;

async function sendTyping() {
    const typing = wantTyping || baselineTyping;
    if (typing === lastTypingState) return;
    lastTypingState = typing;
    await fetch(`${API_BASE}/client/typing`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({typing})
    });
}

export async function setTyping(typing: boolean) {
    wantTyping = typing;
    await sendTyping();
}

/**
 * Keeps the client's keyboard handling off (Esc and keybinds stay with the page) for as long as a screen asks for it, whatever
 * `setTyping` says in the meantime. The title screen uses it: Esc there must not make the client close and re-open its title
 * screen (the wallpaper blanked for a moment and the mouse was centred again).
 */
export async function setTypingBaseline(on: boolean) {
    baselineTyping = on;
    await sendTyping();
}

export async function getClientUser(): Promise<ClientUser | null> {
    const response = await fetch(`${API_BASE}/client/user`);

    if (!response.ok) {
        if (response.status === 401) {
            return null;
        }
        throw new Error(`Failed to get client user: ${response.status} ${response.statusText}`);
    }

    const data: ClientUser = await response.json();
    return data;
}

export async function loginClientUser() {
    await fetch(`${API_BASE}/client/user/login`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        }
    });
}

export async function logoutClientUser() {
    await fetch(`${API_BASE}/client/user/logout`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        }
    });
}

export function itemTextureUrl(identifier: string) {
    return `${API_BASE}/client/resource/itemTexture?id=${identifier}`
}

export function effectTextureUrl(effectId: string) {
    return `${API_BASE}/client/resource/effectTexture?id=${effectId}`
}
