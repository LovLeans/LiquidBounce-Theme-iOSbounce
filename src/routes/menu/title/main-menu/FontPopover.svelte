<script lang="ts">
	import { untrack } from 'svelte';
	import Icon from './Icon.svelte';
	import Slider from '../../../../components/Slider.svelte';
	import Swatches from './Swatches.svelte';
	import { h2r, hsv, r2s } from './color';
	import { weightInfo, type WeightInfo } from './fontweights';
	import { cl } from './launcher';
	import { CS, FN, FT, wall } from './lockscreen.svelte';

	// Clock: stacked layout, font, weight, colour, opacity.
	let {
		changed,
		fontChanged,
		openColor,
		track
	}: {
		/** something about the clock changed: re-apply, re-fit, re-anchor, save */
		changed: () => void;
		/** the font family changed (the clock does a small fade) */
		fontChanged: () => void;
		/** 'custom' swatch: open the colour picker */
		openColor: () => void;
		/** the popover is about to change height: keep its arrow in step */
		track: () => void;
	} = $props();

	/** thumb size of the popover sliders (1 = the reference slider; the popovers are narrow, so a bigger thumb is easier to hold) */
	const BIG = 1.5;

	const c = $derived(wall.p[wall.cur].ck);
	const f = $derived(FT[c.f]);
	const wv = $derived(cl(c.w, f[2], f[3]));

	// What each font can really do on this machine (see fontweights.ts). Unknown until probed, which takes a moment.
	let info = $state<Record<string, WeightInfo>>({});
	$effect(() => {
		let dead = false;
		for (const k of Object.keys(FT))
			void weightInfo(k).then((i) => {
				if (!dead) info[k] = i;
			});
		return () => {
			dead = true;
		};
	});
	const wi = $derived(info[c.f]);
	/** static font: the slider walks through the weights that really exist, so every notch changes the clock */
	const stepped = $derived(!!wi && !wi.smooth);
	const steps = $derived(stepped ? wi!.steps : []);
	/** nothing to change: not probed yet, or the font draws the same at every weight */
	const locked = $derived(!wi || (stepped && steps.length < 2));
	const si = $derived(
		steps.reduce((best, s, i) => (Math.abs(s - c.w) < Math.abs(steps[best] - c.w) ? i : best), 0)
	);
	const rmin = $derived(stepped ? 0 : f[2]);
	const rmax = $derived(stepped ? Math.max(steps.length - 1, 0) : f[3]);
	const pos = $derived(stepped ? si : wv);
	const shown = $derived(stepped && steps.length > 1 ? steps[si] : wv);
	const cu = $derived(!CS.includes(c.c));
	const hs = $derived(r2s(...h2r(c.c)));

	let prevCu: boolean | undefined;
	$effect(() => {
		const v = cu;
		untrack(() => {
			if (prevCu !== undefined && prevCu !== v) track();
			prevCu = v;
		});
	});

	const toggle = (k: 'st') => {
		c[k] = c[k] ? 0 : 1;
		changed();
	};
	const pickFont = (k: string) => {
		if (c.f === k) return;
		c.f = k;
		c.w = FT[k][1];
		fontChanged();
		changed();
	};
	const pickColor = (k: string) => {
		if (k === 'custom') return openColor();
		c.c = k;
		changed();
	};
</script>

<div class="ph">
	<b>Font &amp; Color</b>
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="ib" class:on={!!c.st} onclick={() => toggle('st')}><Icon name="stk" /></div>
</div>
<div class="fr">
	{#each Object.keys(FT) as k (k)}
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div class="fo" class:on={c.f === k} title={FN[k]} style:font-family={FT[k][0]} onclick={() => pickFont(k)}>12</div>
	{/each}
</div>
<div class="fs">
	<div class="rl">Weight</div>
	<div class="rr" class:dis={locked} title={wi && locked ? 'This font only has one weight' : undefined}>
		{#key `${c.f}:${stepped}:${steps.length}`}
			<Slider
				label="Weight"
				step={stepped ? 1 : 10}
				min={rmin}
				max={rmax}
				big={BIG}
				value={pos}
				disabled={locked}
				oninput={(v) => {
					c.w = stepped ? steps[v] : v;
					changed();
				}}
			/>
		{/key}
		<output>{shown}</output>
	</div>
</div>
<Swatches cur={c.c} onpick={pickColor} />
<div class="xr" class:on={cu}>
	<div>
		<div class="rr">
			<Slider
				label="Brightness"
				min={0}
				max={100}
				big={BIG}
				value={hs[2] * 100}
				track="linear-gradient(90deg,#000,{hsv(hs[0], hs[1], 1)})"
				oninput={(v) => {
					c.c = hsv(hs[0], hs[1], v / 100);
					changed();
				}}
			/>
		</div>
	</div>
</div>
<div class="rl" style="margin-top:12px">Opacity</div>
<div class="rr">
	<Slider
		label="Opacity"
		min={15}
		max={100}
		big={BIG}
		value={Math.round(c.o * 100)}
		track="linear-gradient(90deg,rgba(255,255,255,.14),#fff)"
		oninput={(v) => {
			c.o = v / 100;
			changed();
		}}
	/>
</div>
