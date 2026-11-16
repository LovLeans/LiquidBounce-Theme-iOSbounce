<script lang="ts">
    import {afterUpdate} from "svelte";
    import {setModuleEnabled} from "../../../../integration/rest";
    import {convertToSpacedString, spaceSeperatedNames} from "../../../../theme/theme_config";
    import HudIcon from "../HudIcon.svelte";

    export let name: string;
    export let enabled: boolean;
    export let selected: boolean;

    let moduleElement: HTMLElement;

    afterUpdate(() => {
        if (moduleElement && selected) {
            moduleElement.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
            });
        }
    });

    async function handleKeyDown(e: KeyboardEvent) {
        if (selected && e.key === "Enter") {
            try {
                await setModuleEnabled(name, !enabled);
            } catch (e) {
                // the client refused (setModuleEnabled throws on a non-2xx answer now): nothing to undo here, the state comes from its events
                console.warn("[TabGui] could not switch", name, e);
            }
        }
    }
</script>

<svelte:window on:keydown={handleKeyDown} />

<!-- Like an iOS menu: a tick marks what is on. The highlight is TabGui's sliding pill (a row is exactly --row high). -->
<div class="module" class:enabled class:selected bind:this={moduleElement}>
    <div class="name">{$spaceSeperatedNames ? convertToSpacedString(name) : name}</div>
    <span class="tick"><HudIcon name="check" size={14}/></span>
</div>

<style lang="scss">

    .module {
        position: relative; // above the sliding pill
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        height: var(--row);
        padding: 0 12px 0 14px;
        font-weight: 500;
        font-size: 13px;
        letter-spacing: -.01em;
        color: var(--tabgui-text-dimmed-color);
        transition: color .25s;

        .name {
            white-space: nowrap;
        }

        .tick {
            display: flex;
            color: var(--accent-color);
            opacity: 0;
            transform: scale(.6);
            transition: opacity .2s, transform .35s var(--hud-spring);
        }

        &.enabled {
            color: var(--tabgui-text-color);

            .tick {
                opacity: 1;
                transform: none;
            }
        }
    }
</style>
