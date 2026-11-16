import { getPersistentStorageItems, setPersistentStorageItems } from "./rest";
import type { PersistentStorageItem } from "./types";

let loadedOnce = false;
let persistentDataUpdateTimeout: null | number = null;

let markLoaded: () => void;
export const persistentDataLoaded = new Promise<void>(resolve => markLoaded = resolve);

// When the client's HTTP server is not answering yet at page load (App.svelte already retries the theme colors for the same reason) this
// request failed, and the failure used to escape into App's onMount: the rest of it never ran, so the `socketReady` / `virtualScreen`
// listeners that do ALL the routing were never registered and the UI stayed dead; `persistentDataLoaded` never resolved either.
// Now it never throws: after a failed first try it retries in the background, and nothing is written back to the client until the
// stored data has really been loaded (`loadedOnce`), so the client's data cannot be overwritten with an empty copy.
const RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 15000];

async function loadPersistentData(): Promise<boolean> {
    try {
        const items = await getPersistentStorageItems();

        for (const { key, value } of items) {
            localStorage.setItem(key, value);
        }
        loadedOnce = true;
        markLoaded();
        return true;
    } catch (e) {
        console.warn("[PersistentStorage] could not load the stored data", e);
        return false;
    }
}

export async function insertPersistentData() {
    if (await loadPersistentData()) {
        return;
    }

    // the caller (App.svelte) must not wait for these: it still has to register its listeners
    void (async () => {
        for (const delay of RETRY_DELAYS_MS) {
            await new Promise(resolve => setTimeout(resolve, delay));
            if (await loadPersistentData()) {
                return;
            }
        }
        console.warn("[PersistentStorage] giving up: the stored data could not be loaded, it is not written back either");
    })();
}

export async function updatePersistentData() {
    if (persistentDataUpdateTimeout !== null) {
        clearTimeout(persistentDataUpdateTimeout);
    }

    persistentDataUpdateTimeout = setTimeout(async () => {
        if (!loadedOnce) {
            return;
        }

        const items: PersistentStorageItem[] = [];

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)!!;
            const value = localStorage.getItem(key)!!;

            items.push({
                key,
                value
            });
        }

        try {
            await setPersistentStorageItems(items);
        } catch (e) {
            // was an unhandled rejection inside the timer; the next change sends everything again
            console.warn("[PersistentStorage] could not save the data", e);
        }
    }, 200);
}

export async function setItem(name: string, value: string) {
    localStorage.setItem(name ,value);
    await updatePersistentData();
}