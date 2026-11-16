<script lang="ts">
    import MainMenu from "./main-menu/MainMenu.svelte";

    interface Props {
        /** a real screen (singleplayer, multiplayer, ...) is drawn on top of the menu */
        overlayActive?: boolean;
        /** the client's name of that screen ('multiplayer', ...), null when there is none */
        overlayScreen?: string | null;
        /** the screen the client opened on its own with no menu under it; its window opens over it when the menu is mounted */
        adoptScreen?: string | null;
    }

    let {overlayActive = false, overlayScreen = null, adoptScreen = null}: Props = $props();
</script>

<MainMenu {overlayActive} {overlayScreen} {adoptScreen}/>
