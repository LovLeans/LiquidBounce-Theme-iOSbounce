<script lang="ts">
    import {listenSticky} from "../../../integration/ws";
    import type {PlayerData, Scoreboard, TextComponent as TTextComponent} from "../../../integration/types";
    import TextComponent from "../../menu/common/TextComponent.svelte";
    import type {ClientPlayerDataEvent} from "../../../integration/events";
    import {createGlobalRegex, replaceTextComponent} from "../../../util/regex_replace";
    import type {HudScoreboardSettings} from "../components";

    export let settings: { [name: string]: any };

    let cSettings: HudScoreboardSettings;

    $: cSettings = settings as HudScoreboardSettings;

    let scoreboard: Scoreboard | null = null;
    let replaceRegex: RegExp | null = null;
    let processedScoreboard: Scoreboard | null = null;

    $: replaceRegex = createGlobalRegex(cSettings?.replaceRegex);
    $: processedScoreboard = processScoreboard(scoreboard, replaceRegex, cSettings?.replaceWith ?? "");

    function processScoreboard(scoreboard: Scoreboard | null, regex: RegExp | null, replacement: string): Scoreboard | null {
        if (!scoreboard || !regex) {
            return scoreboard;
        }

        return {
            header: replaceTextComponent(scoreboard.header, regex, replacement) as TTextComponent,
            entries: scoreboard.entries.map(({name, score}) => ({
                name: replaceTextComponent(name, regex, replacement) as TTextComponent,
                score: replaceTextComponent(score, regex, replacement) as TTextComponent
            }))
        };
    }

    listenSticky("clientPlayerData", (e: ClientPlayerDataEvent) => {
        const playerData: PlayerData = e.playerData;
        scoreboard = playerData.scoreboard;
    });
</script>

{#if processedScoreboard}
    <div class="scoreboard">
        {#if processedScoreboard.header && cSettings.show.includes('Header')}
            <div class="header">
                <TextComponent fontSize={13} allowPreformatting={true} preFormattingMonospace={false} textComponent={processedScoreboard.header}/>
            </div>
        {/if}
        <div class="entries">
            {#each processedScoreboard.entries as {name, score}}
                <div class="row">
                    {#if cSettings.show.includes('Name')}
                        <TextComponent fontSize={13} allowPreformatting={true} preFormattingMonospace={false} textComponent={name}/>
                    {/if}
                    {#if cSettings.show.includes('Score')}
                        <TextComponent fontSize={13} allowPreformatting={true} preFormattingMonospace={false} textComponent={score}/>
                    {/if}
                </div>
            {/each}
        </div>
    </div>
{/if}

<style lang="scss">
  @use "../glass" as *;

  // one glass card (the old header / body were two differently tinted boxes); the header is separated by a hairline
  .scoreboard {
    @include hud-glass(var(--hud-r-card), var(--scoreboard-background-color));

    width: max-content;
    overflow: hidden;
    font-size: 13px;
  }

  .header {
    text-align: center;
    font-weight: 600;
    background: var(--scoreboard-header-background-color);
    box-shadow: 0 1px 0 var(--hud-separator);
    padding: 9px 14px 8px;
  }

  .entries {
    padding: 8px 14px 10px;
    display: flex;
    flex-direction: column;
    row-gap: 3px;
  }

  .row {
    display: flex;
    column-gap: 16px;
    justify-content: space-between;
    align-items: center;
    min-height: 16px; // Text component height
    font-variant-numeric: tabular-nums;
  }
</style>
