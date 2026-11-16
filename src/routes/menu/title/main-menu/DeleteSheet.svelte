<script lang="ts">
	import { STY, bgv, clockCss, crop, dateCss, fmtN, type LockScreen } from './lockscreen.svelte';
	import PressButton from './PressButton.svelte';

	// "Delete this theme permanently?": a popup that rises from below the stage to the middle, shows the lock screen that is about to
	// go (its wallpaper, clock font and clock position are the carousel card's own markup, just smaller), and leaves through the top
	// of the stage again, whichever button was pressed. Plain Web Animations (translate + opacity), so nothing here runs a frame loop.
	let {
		we,
		time,
		date,
		onconfirm,
		locked
	}: {
		/** 0 = live lock screen, 1 = carousel, 2 = Customize: the sheet only opens in the carousel */
		we: number;
		time: string;
		date: string;
		/** Confirm was pressed: the editor deletes the lock screen (and closes the sheet itself) */
		onconfirm: () => void;
		/** true while the editor is busy (a lock screen is being deleted): the sheet must stay closed */
		locked?: () => boolean;
	} = $props();

	/** in: starts fast out of frame and settles softly in the middle (ease-out-quint); out: starts gently, then accelerates away (ease-in-cubic) */
	const IN = 'cubic-bezier(.22,1,.36,1)';
	const OUT = 'cubic-bezier(.32,0,.67,0)';
	/** how far below / above its resting place the sheet starts / ends: more than the stage is tall, so it is fully out of frame */
	const FAR = 720;

	let rootEl: HTMLDivElement;
	let scrimEl: HTMLDivElement;
	let sheetEl: HTMLDivElement;
	let lp = $state.raw<LockScreen | null>(null);

	let on = false; // wanted open (false while it is leaving)
	let shown = false; // on screen at all (display: block)
	let anim: Animation | null = null;
	let sAnim: Animation | null = null;

	const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
	// where the sheet / scrim are right now, so that opening or closing in the middle of a flight carries on from there
	const curY = () => {
		const y = parseFloat(getComputedStyle(sheetEl).translate.split(' ')[1] ?? '');
		return Number.isFinite(y) ? y : 0;
	};
	const curA = () => {
		const a = parseFloat(getComputedStyle(scrimEl).opacity);
		return Number.isFinite(a) ? a : 1;
	};

	function done() {
		anim?.cancel();
		sAnim?.cancel();
		anim = sAnim = null;
		shown = false;
		rootEl.style.display = 'none';
		rootEl.dataset.open = '';
	}

	function go(y0: number, y1: number, a0: number, a1: number, easing: string, ms: number, leave: boolean) {
		anim?.cancel();
		sAnim?.cancel();
		const rm = reduced();
		// reduced motion: no flight, a short cross-fade instead
		const kf: Keyframe[] = rm ? [{ opacity: a0 }, { opacity: a1 }] : [{ translate: `0 ${y0}px` }, { translate: `0 ${y1}px` }];
		const a = (anim = sheetEl.animate(kf, { duration: rm ? 160 : ms, easing: rm ? 'ease-out' : easing, fill: 'both' }));
		const s = (sAnim = scrimEl.animate([{ opacity: a0 }, { opacity: a1 }], { duration: rm ? 160 : ms * 0.8, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' }));
		if (leave) {
			a.onfinish = () => {
				if (anim === a) done();
			};
		} else {
			// arrived: the resting style is the end state, so the effects can go (a forwards-filled effect would only keep layers busy)
			a.onfinish = () => {
				if (anim === a) {
					a.cancel();
					anim = null;
				}
			};
			s.onfinish = () => {
				if (sAnim === s) {
					s.cancel();
					sAnim = null;
				}
			};
		}
	}

	// ---------- API used by the editor ----------
	export const isOpen = () => on;
	export const contains = (t: EventTarget | null) => !!t && sheetEl.contains(t as Node);

	export function open(p: LockScreen) {
		if (on || we !== 1 || locked?.()) return;
		lp = p;
		// still on its way out (Cancel, then trash again): rise again from wherever it is
		const y0 = shown ? curY() : FAR;
		const a0 = shown ? curA() : 0;
		on = true;
		shown = true;
		rootEl.style.display = 'block';
		rootEl.dataset.open = '1';
		go(y0, 0, a0, 1, IN, 640, false);
	}

	export function close() {
		if (!on) return;
		on = false;
		rootEl.dataset.open = '';
		go(curY(), -FAR, curA(), 0, OUT, 460, true);
	}

	// the editor left the carousel (or was closed) with the sheet up: let it go rather than leave it over another screen
	$effect(() => {
		if (we !== 1 && on) close();
	});

	function confirm() {
		if (!on) return;
		onconfirm(); // the editor closes the sheet as part of deleting; if it refused, do not leave the sheet stuck
		close();
	}
</script>

<div class="dsw" bind:this={rootEl}>
	<div class="dsc" bind:this={scrimEl}></div>
	<div class="dsh" role="alertdialog" aria-modal="true" aria-label="Delete this theme permanently?" bind:this={sheetEl}>
		<div class="dst">Delete this theme permanently?</div>
		<div class="dpv">
			{#if lp}
				<!-- the carousel card's own markup (.cw wallpaper, .cc date + clock) in a full 1366x768 box that is scaled down, so the
				     clock keeps its font, size and position relative to the wallpaper -->
				<div class="dpi">
					<div class="cw" style:background={bgv(lp)} style:filter={STY[lp.v][1]} style:transform={crop(lp) || undefined}></div>
					<div class="cc"><i style={dateCss(lp)}>{date}</i><span style={clockCss(lp)}>{fmtN(time, lp.ck)}</span></div>
				</div>
			{/if}
		</div>
		<div class="dsb">
			<PressButton width={140} glass danger label="Confirm" onpress={confirm}>
				<span class="pbt-label">Confirm</span>
			</PressButton>
			<PressButton width={140} glass label="Cancel" onpress={close}>
				<span class="pbt-label">Cancel</span>
			</PressButton>
		</div>
	</div>
</div>
