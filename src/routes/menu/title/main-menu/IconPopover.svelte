<script lang="ts">
	import { untrack } from 'svelte';
	import Segmented from './Segmented.svelte';
	import Swatches from './Swatches.svelte';
	import { glyph } from './glyphs';
	import { lum, tcol, wall } from './lockscreen.svelte';

	// Dock icons: light / dark, default plates or one colour, and which colour.
	let { changed, openColor, track }: { changed: () => void; openColor: () => void; track: () => void } = $props();

	const FIX = ['sp', 'mp', 'st', 'ex'];
	const glyphs = Object.fromEntries(FIX.map((k) => [k, glyph(k)]));
	const p = $derived(wall.p[wall.cur]);
	const ic = $derived(p.ic);
	const tc = $derived(tcol(p));

	let prevTnt: boolean | undefined;
	$effect(() => {
		const v = ic.m === 'tnt';
		untrack(() => {
			if (prevTnt !== undefined && prevTnt !== v) track();
			prevTnt = v;
		});
	});
</script>

<div class="ph" style="margin:0 0 12px"><b>Dock Icons</b></div>
<div class="pv" data-m={ic.m} data-a={ic.a} data-l={lum(tc) > 0.6 ? '1' : '0'} style:--tc={tc}>
	{#each FIX as k (k)}
		<div class="ic" data-k={k}><div class="g">{@html glyphs[k]}</div></div>
	{/each}
</div>
<div class="rw2">
	<span>Appearance</span>
	<Segmented
		items={[
			['l', 'Light'],
			['d', 'Dark']
		]}
		value={ic.a}
		onpick={(v) => {
			ic.a = v as 'l' | 'd';
			changed();
		}}
	/>
</div>
<div class="rw2">
	<span>Style</span>
	<Segmented
		items={[
			['def', 'Default'],
			['tnt', 'One Color']
		]}
		value={ic.m}
		onpick={(v) => {
			ic.m = v as 'def' | 'tnt';
			changed();
		}}
	/>
</div>
<div class="xr" class:on={ic.m === 'tnt'}>
	<div>
		<Swatches
			cur={ic.c}
			onpick={(k) => {
				if (k === 'custom') return openColor();
				ic.c = k;
				changed();
			}}
		/>
	</div>
</div>
