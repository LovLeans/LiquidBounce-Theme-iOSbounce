<script lang="ts">
	import { untrack, type Snippet } from 'svelte';

	// A positioned glass popover. The editor decides where it goes; this just applies it, and when the
	// popover switches sides (a big jump) it glides there instead of snapping.
	let {
		id,
		on,
		left,
		top,
		right,
		bottom,
		width,
		ay = 60,
		ad = 'block',
		aside = 'l',
		ox,
		oy,
		na = false,
		glide = false,
		el = $bindable(),
		children
	}: {
		id: string;
		on: boolean;
		left?: number;
		top?: number;
		right?: number;
		bottom?: number;
		width?: number;
		ay?: number;
		ad?: 'block' | 'none';
		/** which edge the arrow is on: 'l' when the popover sits right of what it points at, 'r' when it sits left of it */
		aside?: 'l' | 'r';
		ox?: string;
		oy?: string;
		na?: boolean;
		glide?: boolean;
		el?: HTMLDivElement;
		children: Snippet;
	} = $props();

	let pl: number | undefined;
	let pt: number | undefined;
	let wasOn = false;
	$effect(() => {
		const l = left;
		const t = top;
		const o = on;
		const th = glide ? 4 : 48;
		untrack(() => {
			// A popover that is only now opening is not "moving": it grows out of its arrow right where it belongs.
			const open = o && wasOn;
			wasOn = o;
			if (l == null || t == null) return;
			if (pl != null && pt != null && open && el?.animate && (Math.abs(pl - l) > th || Math.abs(pt - t) > th)) {
				el.animate([{ translate: `${pl - l}px ${pt - t}px` }, { translate: '0 0' }], { duration: 420, easing: 'cubic-bezier(.32,.72,0,1)' });
			}
			pl = l;
			pt = t;
		});
	});
</script>

<div
	class="pop"
	class:on
	class:na
	class:ar={aside === 'r'}
	{id}
	bind:this={el}
	style:left={left != null ? left + 'px' : undefined}
	style:top={top != null ? top + 'px' : undefined}
	style:right={right != null ? right + 'px' : undefined}
	style:bottom={bottom != null ? bottom + 'px' : undefined}
	style:width={width != null ? width + 'px' : undefined}
	style:--ay="{ay}px"
	style:--ad={ad}
	style:--ox={ox}
	style:--oy={oy}
>
	{@render children()}
</div>
