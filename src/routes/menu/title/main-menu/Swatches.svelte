<script lang="ts">
	import { CS } from './lockscreen.svelte';

	// One swatch grid, used by the clock, date and icon popovers. 'auto' follows the wallpaper; 'custom' opens the picker.
	let { cur, onpick }: { cur: string; onpick: (k: string) => void } = $props();

	const cu = $derived(!CS.includes(cur));
	const bg = (k: string) =>
		k === 'auto'
			? 'radial-gradient(circle at 35% 30%,#9cc7ae,#4b5b72)'
			: k === 'custom'
				? // a colour wheel; once a custom colour is picked, that colour sits in its middle
					(cu ? `radial-gradient(circle,${cur} 0 42%,transparent 44%),` : 'radial-gradient(circle,rgba(255,255,255,.85),rgba(255,255,255,0) 68%),') +
						'conic-gradient(#ff6b6b,#ffd25a,#7be87b,#5ee9e9,#6a9bff,#d870ff,#ff6b6b)'
				: k;
</script>

<div class="sq">
	{#each CS as k (k)}
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<i class:on={k === 'custom' ? cu : k === cur} style:background={bg(k)} onclick={() => onpick(k)}></i>
	{/each}
</div>
