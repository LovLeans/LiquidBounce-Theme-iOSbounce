<!--
    iOS-style segmented control: a glass track with a pill that follows the pointer (springs, swell, stretch) and settles on the
    chosen option. Arrow keys move the choice. Give it a `label` and it is shown above it.
    The motion lives in components/pillTabs.ts (see the header there): `.opts` holds the real buttons, `.fg` a same-layout copy of
    the labels that is clipped to the pill (the text inside the pill).
-->
<script lang="ts">
    import {onMount, untrack} from "svelte";
    import {createPill, type Pill} from "../../../components/pillTabs";

    interface Props {
        options: string[];
        value?: string;
        label?: string;
    }

    let {options, value = $bindable(""), label}: Props = $props();

    const index = $derived(options.indexOf(value));

    let track = $state<HTMLDivElement>();
    let lens = $state<HTMLElement>();
    let opts = $state<HTMLDivElement>();
    let fg = $state<HTMLDivElement>();
    let ready = $state(false);
    let pill: Pill | undefined;

    onMount(() => {
        if (!track || !lens || !opts || !fg) {
            return;
        }

        const p = createPill({
            track,
            lens,
            base: opts,
            fg,
            index: () => index,
            pick: (i) => {
                value = options[i];
                // the parent may keep the old value: follow what it really holds
                queueMicrotask(() => pill?.sync());
            },
            ready: (ok) => (ready = ok)
        });
        pill = p;
        p.layout();

        return () => {
            p.destroy();
            pill = undefined;
        };
    });

    // `value` was changed from outside (or the options changed): move the pill / re-measure
    $effect(() => {
        void index;
        untrack(() => pill?.sync());
    });
    $effect(() => {
        void options.join("\u0001");
        untrack(() => pill?.layout());
    });

    function onKeyDown(e: KeyboardEvent) {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") {
            return;
        }

        e.preventDefault();
        const from = index < 0 ? 0 : index;
        const to = Math.max(0, Math.min(options.length - 1, from + (e.key === "ArrowRight" ? 1 : -1)));
        value = options[to];
        pill?.go(to, true);
    }
</script>

<div class="segmented">
    {#if label}
        <span class="label">{label}</span>
    {/if}

    <div class="track" role="radiogroup" aria-label={label} style:--n={options.length} bind:this={track}>
        <span class="thumb" class:off={!ready} aria-hidden="true" bind:this={lens}></span>

        <div class="opts" bind:this={opts}>
            {#each options as option}
                <button class="option"
                        class:on={!ready && option === value}
                        type="button"
                        role="radio"
                        aria-checked={option === value}
                        tabindex={option === value || (index < 0 && option === options[0]) ? 0 : -1}
                        onkeydown={onKeyDown}
                        onclick={(e) => {
                            // a mouse / touch press is handled by the pill (pointerup); this is Enter / Space on a focused button
                            if (e.detail === 0) {
                                value = option;
                            }
                        }}>
                    {option}
                </button>
            {/each}
        </div>

        <div class="fg" class:rdy={ready} aria-hidden="true" bind:this={fg}>
            {#each options as option}
                <button class="option on" type="button" tabindex="-1">{option}</button>
            {/each}
        </div>
    </div>
</div>

<style>
    .segmented {
        flex: none;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .label {
        padding: 0 4px;
        font-size: 13px;
        font-weight: 600;
        color: var(--ios-text-dim);
    }

    .track {
        position: relative;
        height: 40px;
        box-sizing: border-box;
        padding: 3px;
        border-radius: 13px;
        background: var(--ios-field);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
        touch-action: pan-y;
        user-select: none;
        -webkit-user-select: none;
    }

    .opts,
    .fg {
        display: grid;
        grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    }

    .opts {
        height: 100%;
    }

    /* a copy of the labels with the same grid, clipped to the pill by the engine */
    .fg {
        position: absolute;
        inset: 0;
        padding: 3px;
        box-sizing: border-box;
        pointer-events: none;
        visibility: hidden;
    }

    .fg.rdy {
        visibility: visible;
    }

    /* the pill: left / top / width / height / radius are set by the engine every frame; until the bar is measured it is hidden */
    .thumb {
        position: absolute;
        left: 3px;
        top: 3px;
        width: 0;
        height: 0;
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.2);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16), 0 2px 8px rgba(0, 0, 0, 0.25);
    }

    .thumb.off {
        display: none;
    }

    /* the pressed pill lifts: a lighter wash and a ring (the engine sets --p on the pill) */
    .thumb::after {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: rgba(255, 255, 255, calc(var(--p, 0) * 0.1));
        box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, calc(var(--p, 0) * 0.42));
    }

    .option {
        position: relative;
        min-width: 0;
        height: 100%;
        padding: 0 8px;
        border: 0;
        border-radius: 10px;
        background: transparent;
        color: var(--ios-text-dim);
        font-family: inherit;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        transition: color 0.2s;
    }

    .option.on {
        color: var(--ios-text);
    }

    .option:focus-visible {
        outline: 3px solid #ffffff;
        outline-offset: 1px;
    }

    @media (prefers-reduced-motion: reduce) {
        .option {
            transition: none;
        }
    }
</style>
