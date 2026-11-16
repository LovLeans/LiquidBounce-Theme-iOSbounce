<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { createPill, type Pill } from '../../../../components/pillTabs';

	// A recessed track with one raised pill that follows the pointer (springs, swell, stretch) and settles on an option.
	// The track / pill / label looks still come from lockscreen-editor.css (`.sg`, `.sg>u`, `.sg b`); the engine in
	// components/pillTabs.ts only drives the pill's geometry. Layers: `.bl` = the real labels, `.fg` = a same-layout copy that is
	// clipped to the pill (the text inside the pill), see the header of pillTabs.ts.
	let { items, value, onpick, cls = '' }: { items: [string, string][]; value: string; onpick: (v: string) => void; cls?: string } = $props();
	const idx = $derived(Math.max(0, items.findIndex(([v]) => v === value)));

	let track = $state<HTMLDivElement>();
	let lens = $state<HTMLElement>();
	let bl = $state<HTMLDivElement>();
	let fg = $state<HTMLDivElement>();
	let ready = $state(false);
	let pill: Pill | undefined;

	onMount(() => {
		if (!track || !lens || !bl || !fg) return;
		const p = createPill({
			track,
			lens,
			base: bl,
			fg,
			index: () => idx,
			pick: (i) => {
				onpick(items[i][0]);
				// the parent may keep the old value (e.g. it rejects the change): follow what it really holds
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

	// the parent changed the value (or the options): move the pill / re-measure
	$effect(() => {
		void idx;
		untrack(() => pill?.sync());
	});
	$effect(() => {
		void items.map(([v, l]) => v + '\u0000' + l).join('\u0001');
		untrack(() => pill?.layout());
	});
</script>

<div class="sg {cls}" bind:this={track} role="radiogroup" style:--n={items.length}>
	<u class:off={!ready} bind:this={lens}></u>
	<div class="bl" bind:this={bl}>
		{#each items as [v, label], i (v)}
			<b class:on={!ready && i === idx} role="radio" aria-checked={i === idx}>{label}</b>
		{/each}
	</div>
	<div class="fg" class:rdy={ready} aria-hidden="true" bind:this={fg}>
		{#each items as [v, label] (v)}
			<b class="on">{label}</b>
		{/each}
	</div>
</div>

<style>
	.sg {
		touch-action: pan-y;
		user-select: none;
		-webkit-user-select: none;
	}
	/* until the bar has been measured the CSS-only look is used: no pill, the chosen label is lit by `.on` */
	.off {
		display: none;
	}
	/* same flex layout as the track itself, so the labels sit exactly where the real ones are */
	.bl {
		flex: 1;
		min-width: 0;
		display: flex;
		gap: inherit;
	}
	.fg {
		position: absolute;
		inset: 0;
		display: flex;
		gap: inherit;
		padding: inherit;
		box-sizing: border-box;
		pointer-events: none;
		visibility: hidden;
	}
	.fg.rdy {
		visibility: visible;
	}
	/* the copies carry `.on`, so they get the stylesheet's own highlighted label colour (`.sg b.on`) */
	/* the pressed pill lifts: a lighter wash and a ring (the engine sets --p on the pill) */
	u::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: rgba(255, 255, 255, calc(var(--p, 0) * 0.1));
		box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, calc(var(--p, 0) * 0.42));
	}
</style>
