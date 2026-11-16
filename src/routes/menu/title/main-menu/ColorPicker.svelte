<script lang="ts">
	import { untrack } from 'svelte';
	import { pressPhysics } from './pressPhysics';
	import Segmented from './Segmented.svelte';
	import Slider from '../../../../components/Slider.svelte';
	import { GD, g3, h2r, hsv, r2h, r2s } from './color';
	import { cl } from './launcher';
	import { save, wall } from './lockscreen.svelte';

	type Tab = 'gr' | 'sp' | 'sl';
	/** thumb size of the sliders (see FontPopover) */
	const BIG = 1.5;
	// Grid / Spectrum / Sliders + hex + favourites. 'pop' is the popover layout, 'wide' the New Lock Screen panel.
	let {
		color,
		onpick,
		variant = 'pop',
		tab = $bindable<Tab>('gr')
	}: { color: string; onpick: (hex: string) => void; variant?: 'pop' | 'wide'; tab?: Tab } = $props();

	const TABS: [string, string][] = [
		['gr', 'Grid'],
		['sp', 'Spectrum'],
		['sl', 'Sliders']
	];
	const rgb = $derived(h2r(color));
	const hv = $derived(r2s(rgb[0], rgb[1], rgb[2]));
	let spEl: HTMLDivElement | undefined = $state();
	let cbEl: HTMLDivElement | undefined = $state();
	let hexEl: HTMLInputElement | undefined = $state();
	let drag = $state<{ x: number; y: number } | null>(null);
	let down = false;
	// while dragging, the thumb follows the pointer exactly instead of the rounded colour
	const thumb = $derived(drag ?? { x: (hv[2] > 0.999 ? hv[1] / 2 : 0.5 + (1 - hv[2]) / 2) * 100, y: hv[0] / 3.6 });

	// the picker body fades in when the tab changes
	let first = true;
	$effect(() => {
		void tab;
		untrack(() => {
			if (first) {
				first = false;
				return;
			}
			cbEl?.animate?.([{ opacity: 0, transform: 'translateY(6px) scale(.985)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.32,.72,0,1)' });
		});
	});

	let hex = $state(color.slice(1).toUpperCase());
	$effect(() => {
		const c = color;
		untrack(() => {
			if (document.activeElement !== hexEl) hex = c.slice(1).toUpperCase();
		});
	});
	const onHex = () => {
		if (/^[0-9a-f]{6}$/i.test(hex)) onpick('#' + hex.toLowerCase());
	};
	const onRgb = (i: number, v: number) => {
		const a = [...rgb];
		a[i] = v;
		onpick(r2h(a[0], a[1], a[2]));
	};
	const spMove = (e: PointerEvent) => {
		if (!spEl) return;
		const r = spEl.getBoundingClientRect();
		const x = cl((e.clientX - r.left) / r.width, 0, 1);
		const y = cl((e.clientY - r.top) / r.height, 0, 0.999);
		drag = { x: x * 100, y: y * 100 };
		onpick(hsv(y * 360, x < 0.5 ? x * 2 : 1, x < 0.5 ? 1 : 2 - 2 * x));
	};
	const addFav = () => {
		wall.fav = [...wall.fav.filter((x) => x !== color), color].slice(-6);
		save();
	};
</script>

<Segmented cls="tb" items={TABS} value={tab} onpick={(v) => (tab = v as Tab)} />
<div class="cb" bind:this={cbEl}>
	{#if tab === 'gr'}
		<div class="gd">
			{#each GD as c}
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<i style:background={c} onclick={() => onpick(c)}></i>
			{/each}
		</div>
	{:else if tab === 'sp'}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="spc"
			bind:this={spEl}
			onpointerdown={(e) => {
				spEl?.setPointerCapture(e.pointerId);
				down = true;
				spMove(e);
			}}
			onpointermove={(e) => down && spMove(e)}
			onpointerup={() => {
				down = false;
				drag = null;
			}}
		>
			<b style:left="{thumb.x}%" style:top="{thumb.y}%"></b>
		</div>
	{:else if variant === 'pop'}
		{#each ['Red', 'Green', 'Blue'] as nm, i}
			<div class="rl">{nm}</div>
			<div class="rr">
				<Slider label={nm} min={0} max={255} step={1} big={BIG} value={rgb[i]} track={g3(rgb, i)} oninput={(v) => onRgb(i, v)} />
				<output>{rgb[i]}</output>
			</div>
		{/each}
		<div class="hx">
			<span>sRGB Hex Color #</span>
			<input bind:this={hexEl} bind:value={hex} maxlength="6" spellcheck="false" oninput={onHex} />
		</div>
	{:else}
		{#each ['Red', 'Green', 'Blue'] as nm, i}
			<div class="rr nsr">
				<span class="rl">{nm}</span>
				<Slider label={nm} min={0} max={255} step={1} big={BIG} value={rgb[i]} track={g3(rgb, i)} oninput={(v) => onRgb(i, v)} />
				<output>{rgb[i]}</output>
			</div>
		{/each}
	{/if}
</div>

{#if variant === 'pop'}
	<div class="bt2">
		<i id="cur" style:background={color}></i>
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<b class="ad" use:pressPhysics onclick={addFav}>+</b>
		<span class="fvs">
			{#each wall.fav as f (f)}
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<i class="fv" style:background={f} onclick={() => onpick(f)}></i>
			{/each}
		</span>
	</div>
{:else}
	<div class="nft">
		<div class="nhx">
			<span>#</span>
			<input class="nhi" bind:this={hexEl} bind:value={hex} maxlength="6" spellcheck="false" autocomplete="off" oninput={onHex} />
		</div>
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<b class="ad" use:pressPhysics onclick={addFav}>+</b>
		<span class="fvs">
			{#each wall.fav as f (f)}
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<i class="fv" style:background={f} onclick={() => onpick(f)}></i>
			{/each}
		</span>
	</div>
{/if}
