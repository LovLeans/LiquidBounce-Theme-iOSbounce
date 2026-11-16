<script lang="ts">
    import {onMount} from "svelte";
    import type {GroupedModules, Module as TModule,} from "../../../../integration/types";
    import {getModules, setModuleEnabled} from "../../../../integration/rest";
    import {groupByCategory} from "../../../../integration/util";
    import Category from "./Category.svelte";
    import {getTextWidth} from "../../../../integration/text_measurement";
    import {listenSticky} from "../../../../integration/ws";
    import {pop, popOut} from "../../motion";
    import Module from "./Module.svelte";
    import type {KeyEvent, ModuleToggleEvent} from "../../../../integration/events";

    let modules: TModule[] = [];
    let groupedModules: GroupedModules = {};
    let categories: string[] = [];
    let selectedCategoryIndex = 0;
    let selectedModuleIndex = 0;
    let renderedModules: TModule[] = [];
    let categoriesElement: HTMLElement;

    onMount(async () => {
        modules = (await getModules()).filter((m) => m.category !== "Client");
        groupedModules = groupByCategory(modules);
        categories = Object.keys(groupedModules).sort(
            (a, b) =>
                getTextWidth(b, "600 13px Inter") - getTextWidth(a, "600 13px Inter"),
        );
    });

    async function handleKeyDown(e: KeyEvent) {
        if (e.action !== 1) {
            return;
        }

        switch (e.key) {
            case "key.keyboard.down":
                if (renderedModules.length === 0) {
                    selectedCategoryIndex =
                        (selectedCategoryIndex + 1) %
                        Object.keys(categories).length;
                } else {
                    selectedModuleIndex =
                        (selectedModuleIndex + 1) % renderedModules.length;
                }
                break;
            case "key.keyboard.up":
                if (renderedModules.length === 0) {
                    selectedCategoryIndex =
                        (selectedCategoryIndex -
                            1 +
                            Object.keys(categories).length) %
                        Object.keys(categories).length;
                } else {
                    selectedModuleIndex =
                        (selectedModuleIndex - 1 + renderedModules.length) % renderedModules.length;
                }
                break;
            case "key.keyboard.left":
                renderedModules = [];
                selectedModuleIndex = 0;
                break;
            case "key.keyboard.right":
                if (renderedModules.length > 0) {
                    return;
                }
                renderedModules =
                    groupedModules[categories[selectedCategoryIndex]];
                break;
            case "key.keyboard.enter":
                if (renderedModules.length === 0) {
                    return;
                }
                const mod = renderedModules[selectedModuleIndex];
                try {
                    await setModuleEnabled(mod.name, !mod.enabled);
                } catch (e) {
                    // refused by the client: the list keeps following its moduleToggle events
                    console.warn("[TabGui] could not switch", mod.name, e);
                }
                break;
        }
    }

    listenSticky("key", handleKeyDown);

    listenSticky("moduleToggle", (e: ModuleToggleEvent) => {
        const moduleName = e.moduleName;
        const moduleEnabled = e.enabled;

        const mod = modules.find((m) => m.name === moduleName);
        if (!mod) return;

        mod.enabled = moduleEnabled;
        groupedModules = groupByCategory(modules);
        if (renderedModules.length > 0) {
            renderedModules = groupedModules[categories[selectedCategoryIndex]];
        }
    });
</script>

<!-- iPadOS sidebar + iOS menu. Both lists have fixed-height rows (--row), so ONE selection pill per list can sit at
     index * --row and slide there on a spring; the rows themselves only recolour. -->
<div class="tabgui">
    <div class="categories" bind:this={categoriesElement}>
        <div class="rows" style="--row: 34px; --i: {selectedCategoryIndex}">
            <div class="pill accent"></div>
            {#each categories as name, index}
                <Category {name} selected={index === selectedCategoryIndex} />
            {/each}
        </div>
    </div>

    {#if renderedModules.length > 0}
        <div class="modules" in:pop={{ x: -12, from: .94 }} out:popOut={{ x: -10 }} style="height: {categoriesElement.offsetHeight}px">
            <div class="rows" style="--row: 32px; --i: {selectedModuleIndex}">
                <div class="pill"></div>
                {#each renderedModules as { name, enabled }, index}
                    <Module {name} {enabled} selected={selectedModuleIndex === index} />
                {/each}
            </div>
        </div>
    {/if}
</div>

<style lang="scss">
    @use "../../glass" as *;

    .tabgui {
        display: flex;
        align-items: flex-start;
        gap: 8px;
    }

    .categories, .modules {
        @include hud-glass(var(--hud-r-card), var(--tabgui-background-color));

        padding: 5px;
    }

    .modules {
        min-width: 150px;
        box-sizing: border-box;
        overflow: auto;

        &::-webkit-scrollbar {
            width: 0;
        }
    }

    .rows {
        position: relative;
    }

    // the sliding selection: same corner radius as the card minus its padding (concentric)
    .pill {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: var(--row);
        border-radius: 15px;
        transform: translateY(calc(var(--i) * var(--row)));
        transition: transform .5s var(--hud-spring);
        will-change: transform;
        background: var(--tabgui-module-selected-background-color);

        &.accent {
            background: var(--tabgui-category-active-background-color);
            box-shadow: 0 2px 10px color-mix(in srgb, var(--tabgui-category-active-background-color) 45%, transparent);
        }

        @supports (corner-shape: squircle) {
            corner-shape: squircle;
        }
    }
</style>
