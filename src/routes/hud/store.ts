import {type Writable, writable} from "svelte/store";

// the client's operating system (used to print key names), set by <Hud> when it mounts
export const os: Writable<string | null> = writable<string | null>(null);
