<script lang="ts">
	import { pressPhysics } from './pressPhysics';
	import ColorPicker from './ColorPicker.svelte';
	import Segmented from './Segmented.svelte';
	import Slider from '../../../../components/Slider.svelte';
	import { aim, cl, lerp, sm, spring } from './launcher';

	// The colour screen of "New Lock Screen". The + button is a MorphingMenu now (Photos / Colors); its "Colors" row calls
	// openColor(), which grows a window out of the menu's box into the fullscreen colour screen (same springs, tilt and blur as
	// before). Cancel / Add / Escape fade the window out where it is.
	// (The delete confirmation is its own bottom sheet: DeleteSheet.svelte.)
	let {
		we,
		ek,
		time,
		date,
		onadd,
		locked
	}: {
		we: number;
		/** how far the carousel has shrunk the live screen (1 = full size): the window only shows while it is small */
		ek: () => number;
		time: string;
		date: string;
		onadd: (wp: string) => void;
		/** true while the editor is busy (a lock screen is being deleted): the window must stay closed */
		locked?: () => boolean;
	} = $props();

	const MW = 400;
	const MH = 232;

	let winEl: HTMLDivElement;
	let scrimEl: HTMLDivElement;
	let editEl: HTMLDivElement;

	/** colour screen: m = solid | gradient, sel = which colour the picker edits */
	let NS = $state({ m: 's' as 's' | 'g', a: '#6a5cff', b: '#ff7ab6', sel: 0 as 0 | 1, ang: 160 });
	const grad = $derived(NS.m === 'g');
	const paint = $derived(grad ? `linear-gradient(${NS.ang}deg,${NS.a},${NS.b})` : NS.a);

	const sc = spring(0.002, 0.03);
	sc.k = 150;
	sc.c = 24;
	const o = {
		mode: 0 as 0 | 1, // 0 = closed / small window, 1 = fullscreen colour screen
		isOpen: false,
		active: false,
		pe: '',
		bf: '',
		ev: '',
		sv: '',
		sp: '',
		ch: { cx: spring(0.4, 4), cy: spring(0.4, 4), w: spring(0.4, 4), h: spring(0.4, 4), m: spring(0.002, 0.03), op: spring(0.002, 0.03), sc }
	};

	let raf = 0;
	let last = 0;
	const kick = () => {
		if (!raf) {
			last = performance.now();
			raf = requestAnimationFrame(tick);
		}
	};

	function targets() {
		const c = o.ch;
		if (o.isOpen) {
			aim(c.cx, 683, 210, 1);
			aim(c.cy, 384, 210, 1);
			if (o.mode) {
				aim(c.w, 1366, 300, 1);
				aim(c.h, 768, 185, 1);
			} else {
				aim(c.w, MW, 300, 1);
				aim(c.h, MH, 185, 1);
			}
			aim(c.m, 1, 330, 1);
			aim(c.sc, 1, 150, 1);
			aim(c.op, 1, 260, 1);
		} else {
			// closing: the window stays exactly where (and as big as) it is and only fades with the scrim; the other
			// springs keep their targets
			aim(c.sc, 0, 190, 1);
			aim(c.op, 0, 300, 1);
		}
		kick();
	}

	function render() {
		const c = o.ch;
		const w = c.w.x;
		const h = c.h.x;
		const m = cl(c.m.x, 0, 1);
		const u = cl(c.sc.x, 0, 1);
		const S = winEl.style;
		const TW = MW;
		const TH = MH;
		// q: how far the menu has grown into the fullscreen screen
		const q = (cl((w - TW) / (1366 - TW), 0, 1) + cl((h - TH) / (768 - TH), 0, 1)) / 2;
		const kf = cl(cl((1 - ek()) / 0.3, 0, 1) * 1.7 - 0.1, 0, 1);
		S.width = w + 'px';
		S.height = h + 'px';
		S.translate = `${c.cx.x - w / 2}px ${c.cy.x - h / 2}px`;
		S.opacity = String(cl(c.op.x, 0, 1) * kf);
		S.boxShadow = `0 ${lerp(1, 16, m)}px ${lerp(3, 56, m)}px rgba(0,0,0,${lerp(0.25, 0.42, m)}),inset 0 0 0 1px rgba(255,255,255,.08)`;
		S.borderRadius = lerp(0.5 * Math.min(w, h), lerp(34, 38, q), m) + 'px';
		const bl = Math.max(14 * 4 * m * (1 - m) * (1 - sm(0.7, 0.95, m)), 14 * 4 * q * (1 - q) * (1 - sm(0.7, 0.95, q)));
		const bf = bl > 0.4 ? `blur(${bl.toFixed(1)}px)` : '';
		if (o.bf !== bf) {
			o.bf = bf;
			S.filter = bf;
		}
		const fs = cl((w - 44) / (TW - 44), 0, 1);
		S.transform = `perspective(1500px) rotateX(${-40 * (fs * (1 - fs) + q * (1 - q))}deg)`;
		// colour page: grows with the window like an app opening from its icon
		editEl.style.transform = `scale(${(w / 1366).toFixed(4)},${(h / 768).toFixed(4)})`;
		editEl.style.opacity = sm(0.25, 0.75, q).toFixed(3);
		const ev = q > 0.01 ? 'visible' : 'hidden';
		if (o.ev !== ev) {
			o.ev = ev;
			editEl.style.visibility = ev;
		}
		const pe = o.isOpen && o.mode && q > 0.7 ? 'e' : '';
		if (o.pe !== pe) {
			o.pe = pe;
			winEl.dataset.p = pe;
		}
		scrimEl.style.opacity = (u * kf).toFixed(3);
		const sv = u > 0.001 ? 'visible' : 'hidden';
		if (o.sv !== sv) {
			o.sv = sv;
			scrimEl.style.visibility = sv;
		}
		const sp = o.isOpen ? 'auto' : 'none';
		if (o.sp !== sp) {
			o.sp = sp;
			scrimEl.style.pointerEvents = sp;
		}
	}

	export function finish() {
		o.active = false;
		winEl.style.display = 'none';
		winEl.style.filter = '';
		o.bf = '';
		o.pe = '';
		winEl.dataset.p = '';
		scrimEl.style.visibility = 'hidden';
		scrimEl.style.pointerEvents = 'none';
		o.sv = 'hidden';
		o.sp = 'none';
	}

	function tick(now: number) {
		const dt = cl((now - last) / 1000, 0.001, 0.05);
		last = now;
		const n = Math.ceil(dt / 0.004);
		const hh = dt / n;
		const step = (c: ReturnType<typeof spring>) => {
			for (let i = 0; i < n; i++) {
				c.v += (c.k * (c.t - c.x) - c.c * c.v) * hh;
				c.x += c.v * hh;
			}
			return Math.abs(c.t - c.x) <= c.e && Math.abs(c.v) <= c.ve;
		};
		raf = 0;
		if (!o.active) return;
		let settled = true;
		for (const q of Object.values(o.ch)) if (!step(q)) settled = false;
		if (settled) {
			for (const q of Object.values(o.ch)) {
				q.x = q.t;
				q.v = 0;
			}
			render();
			if (!o.isOpen) finish();
		} else {
			render();
			raf = requestAnimationFrame(tick);
		}
	}

	// ---------- API used by the editor ----------
	export const isOpen = () => o.isOpen;
	export const isActive = () => o.active;

	/** `from` = the box (stage units, centre + size) the window starts in, i.e. the menu row that was picked; default: the middle of the stage */
	export function openColor(from?: { cx: number; cy: number; w: number; h: number }) {
		if (o.isOpen || we !== 1 || locked?.()) return;
		const c = o.ch;
		if (!o.active) {
			// starts as a small untilted box (m = 1: no menu-to-window blur) and grows into the fullscreen colour screen; the scrim fades in
			const f = from ?? { cx: 683, cy: 384, w: MW, h: MH };
			o.active = true;
			winEl.style.display = 'block';
			Object.assign(c.cx, { x: f.cx, v: 0 });
			Object.assign(c.cy, { x: f.cy, v: 0 });
			Object.assign(c.w, { x: f.w, v: 0 });
			Object.assign(c.h, { x: f.h, v: 0 });
			Object.assign(c.m, { x: 1, v: 0 });
			Object.assign(c.op, { x: 0, v: 0 });
			Object.assign(c.sc, { x: 0, v: 0 });
		}
		if (NS.m !== 'g') NS.sel = 0;
		o.isOpen = true;
		o.mode = 1;
		render();
		targets();
	}
	export function close() {
		if (!o.isOpen) return;
		o.isOpen = false;
		o.mode = 0;
		targets();
	}
	/** called once everything else is at rest: a window that is still shrinking away can finish */
	export function settle() {
		if (o.active && !o.isOpen) finish();
	}

	// ---------- interaction ----------
	function edAdd() {
		if (!o.isOpen || o.mode !== 1) return;
		const g = paint;
		close();
		onadd(g);
	}
</script>

<div id="nsc" bind:this={scrimEl}></div>
<div id="nwin" bind:this={winEl}>
	<div id="nedit" class="ct" class:ngr={grad} bind:this={editEl} style:width="1366px" style:height="768px">
		<div id="npv" style:background={paint}></div>
		<div class="nsd"></div>
		<div id="ntd">{date}</div>
		<div id="ntt">{time}</div>
		<b class="nb" id="nbc" use:pressPhysics onclick={close}><span data-press-label>Cancel</span></b>
		<div id="nbt">Color</div>
		<b class="nb" id="nba" use:pressPhysics onclick={edAdd}><span data-press-label>Add</span></b>
		<div class="npn">
			<Segmented
				cls="nmd"
				items={[
					['s', 'Solid'],
					['g', 'Gradient']
				]}
				value={NS.m}
				onpick={(v) => {
					if (NS.m === v) return;
					NS.m = v as 's' | 'g';
					if (v !== 'g') NS.sel = 0;
				}}
			/>
			<div class="nbd">
				<div class="nlc">
					<div class="nst" class:on={(grad ? NS.sel : 0) === 0} data-s="0" onclick={() => (NS.sel = 0)}>
						<i style:background={NS.a}></i>
						<div><span>{grad ? 'Start' : 'Color'}</span><b>{NS.a.toUpperCase()}</b></div>
					</div>
					<div class="xr" id="ngx" class:on={grad}>
						<div>
							<div class="nst" class:on={NS.sel === 1} data-s="1" onclick={() => (NS.sel = 1)}>
								<i style:background={NS.b}></i>
								<div><span>End</span><b>{NS.b.toUpperCase()}</b></div>
							</div>
							<div class="nan">
								<div class="rl">Angle</div>
								<div class="rr">
									<Slider label="Angle" min={0} max={360} step={1} big={1.5} value={NS.ang} oninput={(v) => (NS.ang = v)} />
									<output>{NS.ang}°</output>
								</div>
							</div>
						</div>
					</div>
					<p class="ncp">One color fills the whole screen.</p>
				</div>
				<div class="npk">
					<ColorPicker
						variant="wide"
						color={grad && NS.sel ? NS.b : NS.a}
						onpick={(h) => {
							if (grad && NS.sel) NS.b = h;
							else NS.a = h;
						}}
					/>
				</div>
			</div>
		</div>
	</div>
</div>
