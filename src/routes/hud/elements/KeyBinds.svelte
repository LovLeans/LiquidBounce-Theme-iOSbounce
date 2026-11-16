<script lang="ts">
    import {onDestroy, onMount} from "svelte";
    import {getModules} from "../../../integration/rest";
    import {listenSticky} from "../../../integration/ws";
    import {convertToSpacedString, spaceSeperatedNames} from "../../../theme/theme_config";
    import type {Module} from "../../../integration/types";
    import {UNKNOWN_KEY} from "../../../util/utils";
    import BindDisplay from "./BindDisplay.svelte";
    import HudIcon from "./HudIcon.svelte";

    let modules: Module[] = $state([]);

    // Only the newest refresh may write the list: a slow older answer used to put an outdated one back (same guard as ArrayList).
    let updateSequence = 0;
    let destroyed = false;
    onDestroy(() => destroyed = true);

    async function updateModulesWithBinds() {
        const sequence = ++updateSequence;
        const list = await getModules();
        if (destroyed || sequence !== updateSequence) {
            return;
        }
        modules = list.filter(m => m.keyBind.boundKey !== UNKNOWN_KEY);
    }

    listenSticky("moduleToggle", updateModulesWithBinds);
    listenSticky("valueChanged", async (e) => {
        if (e.value.name === "Bind") {
            await updateModulesWithBinds();
        }
    })

    onMount(async () => {
        await updateModulesWithBinds();
    });
</script>

<div class="keybinds">
    <div class="header">
        <span class="tile"><HudIcon name="keyboard" size={14} line stroke={1.9}/></span>
        <span class="title">Binds</span>
    </div>
    <div class="entries">
        {#each modules as m (m.name)}
            <div class="row" class:enabled={m.enabled}>
                <i class="state"></i>
                <span class="module-name">{$spaceSeperatedNames ? convertToSpacedString(m.name) : m.name}</span>
                <span class="key-bind" class:muted={!m.enabled}>
                    <BindDisplay boundKey={m.keyBind.boundKey} modifiers={m.keyBind.modifiers}/>
                </span>
            </div>
        {:else}
            <div class="no-binds">No key bindings</div>
        {/each}
    </div>
</div>

<style lang="scss">
  @use "../glass" as *;

  // iOS grouped list: a title row with an app tile, then rows separated by hairlines that start at the text (not at the edge)
  .keybinds {
    @include hud-glass(var(--hud-r-card), var(--keybinds-background-color));

    width: max-content;
    overflow: hidden;
    font-size: 13px;
    min-width: 170px;
    max-width: 240px;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 12px 8px;
    background: var(--keybinds-header-background-color);
    box-shadow: 0 1px 0 var(--hud-separator);

    .tile {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border-radius: 6px;
      color: #fff;
      // flat: one solid colour, no border, no gradient, no glow
      background: var(--keybinds-accent-color);
    }

    .title {
      color: var(--keybinds-text-color);
      font-weight: 600;
      letter-spacing: -.01em;
    }
  }

  .entries {
    padding: 2px 0;
    color: var(--keybinds-text-color);

    .no-binds {
      padding: 8px 12px;
      color: var(--keybinds-text-muted-color);
    }
  }

  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 28px;
    padding: 0 12px;
    min-width: 0;

    & + .row::before {
      content: "";
      position: absolute;
      top: 0;
      left: 26px;
      right: 0;
      height: 1px;
      background: var(--hud-separator);
    }

    // enabled modules get a filled dot in the accent colour, the others a hollow one
    .state {
      flex: none;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      box-shadow: inset 0 0 0 1px var(--hud-tx3);
      transition: background-color .3s, box-shadow .3s;
    }

    .module-name {
      color: var(--keybinds-text-muted-color);
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 500;
      transition: color .3s;
    }

    // the key as a small key cap
    .key-bind {
      display: inline-flex;
      align-items: center;
      flex-shrink: 0;
      min-width: max-content;
      height: 20px;
      padding: 0 7px;
      border-radius: 6px;
      background: var(--hud-fill);
      color: var(--keybinds-text-color);
      font-size: 11px;
      font-weight: 600;

      &.muted {
        color: var(--keybinds-text-muted-color);
      }
    }

    &.enabled {
      .state {
        background: var(--keybinds-enabled-color);
        box-shadow: none;
      }

      .module-name {
        color: var(--keybinds-text-color);
      }
    }
  }
</style>
