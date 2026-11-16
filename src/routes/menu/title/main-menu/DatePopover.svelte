<script lang="ts">
	import { untrack } from 'svelte';
	import Slider from '../../../../components/Slider.svelte';
	import Swatches from './Swatches.svelte';
	import { h2r, hsv, r2s } from './color';
	import { CS, wall } from './lockscreen.svelte';

	// Date: size, colour, remove / show.
	let { changed, openColor, track }: { changed: () => void; openColor: () => void; track: () => void } = $props();

	const c = $derived(wall.p[wall.cur].ck);
	const sv = $derived(Math.round(c.ds * 100));
	/** thumb size of the popover sliders (see FontPopover) */
	const BIG = 1.5;
	const cu = $derived(!CS.includes(c.dc));
	const hs = $derived(r2s(...h2r(c.dc)));

	let prevCu: boolean | undefined;
	$effect(() => {
		const v = cu;
		untrack(() => {
			if (prevCu !== undefined && prevCu !== v) track();
			prevCu = v;
		});
	});

	const pickColor = (k: string) => {
		if (c.dh) return;
		if (k === 'custom') return openColor();
		c.dc = k;
		changed();
	};
</script>

<div class="ph"><b>Date</b><span style="width:28px"></span></div>
<div class="dcn" class:off={!!c.dh}>
	<div class="rl" style="margin-top:0">Size</div>
	<div class="rr">
		<Slider
			label="Date size"
			min={40}
			max={250}
			step={1}
			big={BIG}
			value={sv}
			oninput={(v) => {
				c.ds = v / 100;
				changed();
			}}
		/>
		<output>{sv}%</output>
	</div>
	<Swatches cur={c.dc} onpick={pickColor} />
	<div class="xr" class:on={cu}>
		<div class="rr">
			<Slider
				label="Date brightness"
				min={0}
				max={100}
				big={BIG}
				value={hs[2] * 100}
				track="linear-gradient(90deg,#000,{hsv(hs[0], hs[1], 1)})"
				oninput={(v) => {
					c.dc = hsv(hs[0], hs[1], v / 100);
					changed();
				}}
			/>
		</div>
	</div>
</div>
<div class="bt2">
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		class="bt"
		onclick={() => {
			c.dh = c.dh ? 0 : 1;
			changed();
		}}
	>
		{c.dh ? 'Show Date' : 'Remove Date'}
	</div>
</div>
