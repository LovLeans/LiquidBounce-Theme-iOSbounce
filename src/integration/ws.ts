import {WS_BASE} from "./host";
import type {EventMap} from "./events";
import {onDestroy} from "svelte";

console.log("Connecting to server at: ", WS_BASE);

let ws: WebSocket;

function connect() {
    ws = new WebSocket(WS_BASE);

    ws.onopen = () => {
        console.log("[WS] Connected to server");
        dispatch(alwaysListeners.get("socketReady"), undefined, "socketReady");
    };

    ws.onclose = () => {
        console.log("[WS] Disconnected from server, attempting to reconnect...");
        setTimeout(() => {
            connect();
        }, 1000);
    };

    ws.onerror = (error) => {
        console.error("[WS] WebSocket error: ", error)
    };

    ws.onmessage = (event) => {
        let json;
        try {
            json = JSON.parse(event.data);
        } catch (e) {
            // one malformed frame must not throw inside the socket handler
            console.error("[WS] Dropped a frame that is not valid JSON", e);
            return;
        }
        const eventName = json.name;
        const eventData = json.event;

        dispatch(alwaysListeners.get(eventName), eventData, eventName);
        dispatch(listeners.get(eventName), eventData, eventName);
    }
}

/**
 * Calls every listener, each on its own. A listener that throws used to abort the forEach, so every listener registered after it
 * (other HUD elements, other screens) silently stopped receiving that event for good.
 */
function dispatch(callbacks: Function[] | undefined, eventData: unknown, eventName: string) {
    if (!callbacks) {
        return;
    }
    for (const callback of callbacks) {
        try {
            const result = callback(eventData);
            // async listeners fail as a rejected promise, not as a throw
            if (result && typeof result.catch === "function") {
                result.catch((e: unknown) => console.error(`[WS] listener of "${eventName}" failed`, e));
            }
        } catch (e) {
            console.error(`[WS] listener of "${eventName}" failed`, e);
        }
    }
}

const alwaysListeners = new Map<keyof EventMap, Function[]>();
const listeners = new Map<keyof EventMap, Function[]>();

export function listenAlways<NAME extends keyof EventMap>(eventName: NAME, callback: (event: EventMap[NAME]) => void) {
    if (!alwaysListeners.has(eventName)) {
        alwaysListeners.set(eventName, []);
    }

    alwaysListeners.get(eventName)!!.push(callback);
}

/**
 * Like {@link listen}, but the router's `cleanupListeners()` does not remove it: it lives exactly as long as the component.
 *
 * `cleanupListeners()` runs on every route change, also while a screen that is still mounted is on its way out or turns around
 * (the iOS ClickGUI does that). A plain `listen` made by a component of such a screen is gone while the component is still on screen.
 *
 * Should only be used inside a Svelte component.
 */
export function listenSticky<NAME extends keyof EventMap>(eventName: NAME, callback: (event: EventMap[NAME]) => void) {
    listenAlways(eventName, callback);
    onDestroy(() => {
        alwaysListeners.set(eventName, alwaysListeners.get(eventName)?.filter(handler => handler !== callback) ?? []);
    });
}

/**
 * Registers a event listener that will be called on every event of the given name.
 *
 * @param eventName
 * @param callback
 * @return A function that can be called to remove the listener.
 */
function listenNonComponent<NAME extends keyof EventMap>(eventName: NAME, callback: (event: EventMap[NAME]) => void) {
    if (!listeners.has(eventName)) {
        listeners.set(eventName, []);
    }

    listeners.get(eventName)!!.push(callback);

    return () => deleteListener(eventName, callback);
}

/**
 * Registers a event listener that will be called on every event of the given name.
 *
 * The listener will be automatically removed when the component is destroyed.
 *
 * Should only be used inside a Svelte component.
 *
 * @param eventName
 * @param callback
 */
export function listen<NAME extends keyof EventMap>(eventName: NAME, callback: (event: EventMap[NAME]) => void) {
    const onDestroyHook = listenNonComponent(eventName, callback);
    onDestroy(onDestroyHook);
}

/**
 * Wait next event which matches given {@link predicate}.
 */
export async function waitMatches<NAME extends keyof EventMap>(eventName: NAME, predicate: (event: EventMap[NAME]) => boolean): Promise<EventMap[NAME]> {
    return new Promise((resolve, reject) => {
        const deleteHandler = listenNonComponent(eventName, (e) => {
            try {
                if (predicate(e)) {
                    resolve(e);
                    deleteHandler();
                }
            } catch (e) {
                reject(e);
                deleteHandler();
            }
        })
    });
}

export function cleanupListeners() {
    listeners.clear();
    console.log("[WS] Cleaned up event listeners");
}

export function deleteListener<NAME extends keyof EventMap>(eventName: NAME, cb: (event: EventMap[NAME]) => void) {
    listeners.set(
        eventName,
        listeners.get(eventName)?.filter(handler => handler !== cb) ?? []
    );
}

const PING_PAYLOAD = JSON.stringify({ name: "ping", event: {} });

// Send ping to server every 5 seconds
setInterval(() => {
    if (!ws) return;
    if (ws.readyState !== 1) return;

    ws.send(PING_PAYLOAD);
}, 5000);

connect();
