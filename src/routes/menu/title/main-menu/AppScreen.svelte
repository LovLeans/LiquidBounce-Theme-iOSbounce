<script lang="ts">
	// The demo screens that fill each app window while it is open. Replace the markup with your real content,
	// or leave them as placeholders and hand over to a real screen via REAL_SCREEN in MainMenu.svelte.
	let { kind, onclose, onquit }: { kind: string; onclose: () => void; onquit: () => void } = $props();

	const warnings = ['Review Apple Account phone number', 'Services Included with Purchase', 'Finish Setting Up Your iPad'];
	const sidebar: [string, string, string?][][] = [
		[
			['#0a84ff', 'Wi-Fi', 'Off'],
			['#0a84ff', 'Bluetooth', 'Not Connected'],
			['#30d158', 'Battery'],
			['#0a84ff', 'VPN', 'Not Connected']
		],
		[
			['#8e8e93', 'General'],
			['#0a84ff', 'Accessibility'],
			['#3a3a3d', 'Appearance'],
			['#48484a', 'Apple Pencil'],
			['#8e8e93', 'Camera'],
			['#8e8e93', 'Control Center']
		]
	];
	const cards = [
		['About', 'Software Update', 'iPad Storage'],
		['AppleCare & Warranty'],
		['AirDrop', 'AirPlay & Continuity', 'Screen Capture'],
		['AutoFill & Passwords', 'Background App Refresh', 'Date & Time', 'Dictionary']
	];
	const worlds: [string, string, number][] = [
		['New World', 'Survival Mode · 1.21 · 2 hours ago', 210],
		['Creative Build', 'Creative Mode · 1.21 · Yesterday', 150],
		['Hardcore Run', 'Hardcore · Day 142 · 3 days ago', 350],
		['Skyblock', 'Survival Mode · 1.20 · Last week', 190]
	];
	const servers: [string, string, string, number][] = [
		['Hypixel', 'mc.hypixel.net', '41,203 / 200,000', 4],
		['Local Server', '192.168.1.12:25565', '2 / 20', 4],
		['CubeCraft', 'play.cubecraft.net', '8,411 / 15,000', 3],
		['Minemen Club', 'minemen.club', '1,902 / 5,000', 2]
	];
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="app">
	{#if kind === 'st'}
		<div class="sbr">
			<div class="srch">Search</div>
			<div class="prof">
				<div class="av"></div>
				<div><b>Xxmag Hutchens</b><span>Apple Account, iCloud, and more</span></div>
			</div>
			{#each warnings as t}
				<div class="sr w" style="font-size:15px">{t}<b class="n">1</b></div>
			{/each}
			<div style="height:14px"></div>
			<div class="sr"><u style="background:#ff9f0a"></u>Airplane Mode<span class="tg"></span></div>
			{#each sidebar[0] as [c, t, e]}
				<div class="sr"><u style="background:{c}"></u>{t}{#if e}<em>{e}</em>{/if}</div>
			{/each}
			<div style="height:12px"></div>
			{#each sidebar[1] as [c, t]}
				<div class="sr" class:s={t === 'General'}><u style="background:{c}"></u>{t}</div>
			{/each}
		</div>
		<div class="mn">
			<div class="card">
				<div class="hd">
					<div class="gi"></div>
					<h2>General</h2>
					<p>Manage your overall setup and preferences for iPad, such as software updates, device language, CarPlay, AirDrop, and more.</p>
				</div>
			</div>
			{#each cards as rows}
				<div class="card">
					{#each rows as r}<div class="rw"><u></u>{r}</div>{/each}
				</div>
			{/each}
		</div>
	{:else if kind === 'sp'}
		<div class="gm">
			<h1>Singleplayer</h1>
			<p class="sub">Choose a world to play</p>
			{#each worlds as [name, meta, hue], i}
				<div class="wr" class:s={i === 0}>
					<div class="th" style="background:linear-gradient(135deg,hsl({hue} 60% 55%),hsl({hue + 40} 55% 22%))"></div>
					<div><b>{name}</b><span>{meta}</span></div>
				</div>
			{/each}
			<div class="btns"><b class="pri">Play Selected World</b><b>Create New World</b><b>Edit</b><b class="dg">Delete</b></div>
		</div>
	{:else if kind === 'mp'}
		<div class="gm">
			<h1>Multiplayer</h1>
			<p class="sub">Join a server and play with friends</p>
			{#each servers as [name, addr, count, bars], i}
				<div class="wr" class:s={i === 0}>
					<div class="th" style="background:linear-gradient(135deg,hsl({120 + i * 45} 55% 45%),hsl({160 + i * 45} 50% 16%))"></div>
					<div><b>{name}</b><span>{addr}</span></div>
					<em>{count}</em>
					<div class="pg" style="margin-left:18px">
						{#each [8, 12, 16, 21] as h, j}<i style="height:{h}px;{j >= bars ? 'background:#48484a' : ''}"></i>{/each}
					</div>
				</div>
			{/each}
			<div class="btns"><b class="pri">Join Server</b><b>Direct Connect</b><b>Add Server</b><b>Refresh</b></div>
		</div>
	{:else if kind === 'ex'}
		<div class="ex">
			<div>
				<svg viewBox="0 0 100 100">
					<g fill="none" stroke="#ff4a3f" stroke-width="8.5" stroke-linecap="round"><path d="M34 29a30 30 0 1 0 32 0" /><path d="M50 18v31" /></g>
				</svg>
				<h2>Quit game?</h2>
				<p>Any unsaved progress will be lost.</p>
				<div class="btns" style="margin-top:34px">
					<b onclick={onclose}>Cancel</b>
					<b class="dg" onclick={onquit}>Quit</b>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	* {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	}
	.app {
		position: absolute;
		inset: 0;
		display: flex;
		background: #000;
	}
	/* settings */
	.sbr {
		width: 372px;
		background: #161618;
		padding: 46px 18px 0;
		overflow: hidden;
	}
	.srch {
		height: 36px;
		border-radius: 10px;
		background: #2a2a2d;
		color: #8e8e93;
		font-size: 16px;
		line-height: 36px;
		padding-left: 34px;
		margin-bottom: 22px;
	}
	.prof {
		display: flex;
		gap: 12px;
		align-items: center;
		margin: 0 6px 20px;
	}
	.av {
		width: 50px;
		height: 50px;
		border-radius: 50%;
		background: radial-gradient(circle at 40% 35%, #e8c9b5, #7a5a4c 70%);
	}
	.prof b {
		display: block;
		font-size: 19px;
	}
	.prof span {
		font-size: 12px;
		color: #8e8e93;
	}
	.sr {
		display: flex;
		align-items: center;
		gap: 12px;
		height: 42px;
		padding: 0 10px;
		font-size: 17px;
		border-radius: 12px;
		white-space: nowrap;
	}
	.sr.s {
		background: #2c2c2f;
	}
	.sr em {
		margin-left: auto;
		font-style: normal;
		color: #8e8e93;
		font-size: 14px;
	}
	.sr u {
		width: 23px;
		height: 23px;
		border-radius: 6px;
		flex: none;
	}
	.sr .n {
		margin-left: auto;
		width: 19px;
		height: 19px;
		border-radius: 50%;
		background: #ff3347;
		font-size: 12px;
		text-align: center;
		line-height: 19px;
		font-weight: 700;
	}
	.sr.w {
		font-size: 16px;
		padding-left: 10px;
		height: 38px;
		color: #e5e5ea;
	}
	.tg {
		margin-left: auto;
		width: 50px;
		height: 30px;
		border-radius: 15px;
		background: #39393d;
		position: relative;
	}
	.tg:after {
		content: '';
		position: absolute;
		left: 2px;
		top: 2px;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: #fff;
	}
	.mn {
		flex: 1;
		padding: 44px 28px 0;
		overflow: hidden;
		background: #000;
	}
	.card {
		background: #1c1c1e;
		border-radius: 24px;
		margin-bottom: 22px;
		overflow: hidden;
	}
	.hd {
		padding: 24px 24px 22px;
	}
	.hd .gi {
		width: 34px;
		height: 34px;
		border: 2px solid #8e8e93;
		border-radius: 50%;
		margin-bottom: 12px;
	}
	.hd h2 {
		font-size: 21px;
	}
	.hd p {
		font-size: 15px;
		color: #98989f;
		margin-top: 6px;
		line-height: 1.35;
	}
	.rw {
		display: flex;
		align-items: center;
		gap: 14px;
		height: 56px;
		padding: 0 20px;
		font-size: 17px;
		border-top: 1px solid #2c2c2e;
	}
	.rw:first-child {
		border: 0;
	}
	.rw u {
		width: 22px;
		height: 22px;
		border-radius: 6px;
		background: #3a3a3d;
	}
	.rw:after {
		content: '›';
		margin-left: auto;
		color: #6b6b70;
		font-size: 22px;
	}
	/* singleplayer / multiplayer */
	.gm {
		flex: 1;
		padding: 54px 160px 0;
		background: radial-gradient(900px 600px at 70% 0, #1d2338, #0b0b0d 70%);
	}
	.gm h1 {
		font-size: 46px;
		font-weight: 700;
		letter-spacing: -0.5px;
	}
	.gm .sub {
		color: #8e8e93;
		font-size: 18px;
		margin: 4px 0 20px;
	}
	.wr {
		display: flex;
		align-items: center;
		gap: 20px;
		padding: 12px 22px;
		border-radius: 22px;
		background: #1c1c1e;
		margin-bottom: 12px;
	}
	.wr.s {
		background: #26262a;
		box-shadow: inset 0 0 0 2px #0a84ff;
	}
	.wr b {
		display: block;
		font-size: 20px;
	}
	.wr span {
		font-size: 14px;
		color: #8e8e93;
	}
	.wr em {
		margin-left: auto;
		font-style: normal;
		font-size: 15px;
		color: #8e8e93;
	}
	.th {
		width: 60px;
		height: 60px;
		border-radius: 15px;
		flex: none;
	}
	.pg {
		margin-left: auto;
		display: flex;
		gap: 3px;
		align-items: flex-end;
		height: 22px;
	}
	.pg i {
		width: 5px;
		border-radius: 2px;
		background: #30d158;
	}
	.btns {
		display: flex;
		gap: 14px;
		margin-top: 26px;
	}
	.btns b {
		flex: 1;
		text-align: center;
		padding: 17px;
		border-radius: 17px;
		background: #2c2c2e;
		font-weight: 600;
		font-size: 17px;
		cursor: pointer;
	}
	.btns .pri {
		background: #0a84ff;
	}
	.btns .dg {
		background: #ff453a;
	}
	/* quit */
	.ex {
		flex: 1;
		display: grid;
		place-items: center;
		background: radial-gradient(700px 420px at 50% 30%, #3a1c20, #17171a 75%);
	}
	.ex > div {
		width: 520px;
		text-align: center;
	}
	.ex svg {
		width: 96px;
		height: 96px;
	}
	.ex h2 {
		font-size: 34px;
		margin: 18px 0 8px;
	}
	.ex p {
		color: #98989f;
		font-size: 17px;
	}
</style>
