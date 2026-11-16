import "./app.scss";
import "./fonts";
import App from "./App.svelte";
import {mount} from "svelte";
import {loadGuiFonts} from "./routes/clickgui-ios/lib/fonts.js";

// Download the web fonts now, not when the ClickGUI first draws text with them (that was the sudden font change on the first open)
loadGuiFonts(0);

const target = document.getElementById("app");
if (!target) {
    throw new Error("Unable to mount app: #app element not found");
}

const app = mount(App, {
    target
});

export default app;
