/**
 * What the Add Account and Direct Login windows share: one request at a time (`busy`), the line under the buttons (`status`), and what
 * the client's answer does. The client answers a request with an event (`accountManagerAddition` / `accountManagerLogin`):
 * without an error the window shrinks back into its button, with one it stays open and shows the error (the banner of the screen
 * is behind the dimmed screen). `accountManagerMessage` (e.g. the device code) is shown in the same line.
 *
 * Call it while a component is initialised (it registers listeners). `watchdogMs` frees `busy` if the client never answers.
 */
import {onDestroy} from "svelte";
import {listen} from "../../../integration/ws";
import type {AccountManagerMessageEvent} from "../../../integration/events";

export type AccountFormKind = "addition" | "login";

export function createAccountForm(kind: AccountFormKind, close: () => void) {
    let busy = $state(false);
    let status = $state({text: "", error: false});
    let timer: ReturnType<typeof setTimeout> | undefined;

    function end() {
        clearTimeout(timer);
        busy = false;
    }

    function run(job: () => Promise<unknown>, watchdogMs = 8000) {
        if (busy) {
            return;
        }

        busy = true;
        status = {text: "", error: false};
        clearTimeout(timer);
        timer = setTimeout(end, watchdogMs);

        job().catch((error) => {
            console.warn("[AccountDialog] the request failed", error);
            end();
            status = {text: "Could not reach the client", error: true};
        });
    }

    function onResult(event: {error: string | null}) {
        end();
        if (event.error) {
            status = {text: event.error, error: true};
        } else {
            close();
        }
    }

    if (kind === "addition") {
        listen("accountManagerAddition", onResult);
    } else {
        listen("accountManagerLogin", onResult);
    }

    listen("accountManagerMessage", (event: AccountManagerMessageEvent) => {
        status = {text: event.message, error: false};
    });

    onDestroy(() => clearTimeout(timer));

    return {
        get busy() {
            return busy;
        },
        get status() {
            return status;
        },
        run
    };
}
