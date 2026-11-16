# iOSbounce

<p align="center">
  <img src="screenshots/main-menu.png" width="32%">
  <img src="screenshots/wallpaper-editor.png" width="32%">
  <img src="screenshots/hud.png" width="32%">
</p>

## Download

**[Download the latest build](../../releases/latest/download/iosbounce.zip)**: compiled from the newest commit.

### Install

1. In the client, run `.client theme browse` to open the themes folder.
2. Unzip the download there, so you end up with a folder `iosbounce` that has `metadata.json` directly inside.
3. Apply it with `.client theme set iosbounce`.

<!-- Add a screenshot here: ![iOSbounce](docs/screenshot.png) -->

## What's in it

- **Lock-screen main menu**: the title screen is a customizable lock screen with a clock, date and icons. It ships with six built-in wallpapers, and you can add your own photos from the **+** menu.
- **iOS ClickGUI and HUD editor**: a rebuilt ClickGUI with an iOS look, plus an editor for the HUD components (`src/routes/clickgui-ios/`).
- **iOS-style menus**: the multiplayer, singleplayer, alt manager and proxy manager screens use a shared set of iOS components (`src/routes/menu/ios/`).

## Development

You need [Node.js](https://nodejs.org/) (the current LTS is recommended).

1. Install dependencies:

    ```bash
    npm install
    ```

2. Start the LiquidBounce client, then start the dev server:

    ```bash
    npm run dev
    ```

3. In the client, point the theme at the dev server's URL (for example `http://localhost:5173/`):

    ```
    .client theme set <live-url>
    ```

4. To open a screen of the theme in your system browser, run this in the client and pick the UI:

    ```
    .client integration menu
    ```

## Building

```bash
npm run build
```

The production build is written to `dist/`. To install it:

1. Open your LiquidBounce themes folder with `.client theme browse`.
2. Copy `dist/` into it and rename the copy to the theme name you want, for example `iosbounce`.
3. Apply it with `.client theme set iosbounce`.

## Notes

- The built-in wallpapers are inlined into the JavaScript bundle (`?inline` imports in `src/routes/menu/title/main-menu/wallpapers.ts`). Larger image files make the bundle bigger and use more memory when the menu decodes them.
- Photos imported through the **+** menu are scaled down to at most 3840 px on the longest side and saved in the client's storage. If a photo is too large to be saved, the menu shows a toast and the photo is only kept until restart.

## Credits and license

iOSbounce is made by LovLean. It is based on the LiquidBounce default theme by [CCBlueX](https://github.com/CCBlueX) and is released under the [GNU General Public License v3.0 or later](LICENSE).

The Inter font in `public/fonts/` is © The Inter Project Authors and is licensed under the SIL Open Font License 1.1 (see [`public/fonts/OFL.txt`](public/fonts/OFL.txt)).

Made with extra 💜 All Lovleans
