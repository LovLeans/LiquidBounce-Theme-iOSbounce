<script lang="ts">
	let { name }: { name: 'plus' | 'trash' | 'stk' | 'ap' | 'eye' | 'photo' } = $props();
</script>

{#if name === 'plus'}
	<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
{:else if name === 'trash'}
	<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
		><path d="M4 7h16M9.5 7V4.8h5V7M6.2 7l.9 12a2 2 0 0 0 2 1.8h5.8a2 2 0 0 0 2-1.8l.9-12M10 11v6M14 11v6" /></svg
	>
{:else if name === 'stk'}
	<svg viewBox="0 0 24 24" fill="#fff"><rect x="3" y="4.5" width="18" height="6" rx="2" opacity=".55" /><rect x="3" y="13.5" width="18" height="6" rx="2" /></svg>
{:else if name === 'ap'}
	<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="none" stroke="#fff" stroke-width="2" /><path d="M12 5.5a6.5 6.5 0 0 1 0 13z" fill="#fff" /></svg>
{:else if name === 'eye'}
	<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4l5 5-3 1.5-7.5 7.5H6v-3.5L13.5 7zM5 19l1-1" /></svg>
{:else if name === 'photo'}
	<svg viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"
		><rect x="6" y="9" width="36" height="30" rx="6" /><circle cx="17" cy="20" r="3" fill="#fff" stroke="none" /><path d="M8 35l10-9 7 6 6-5 9 8" /></svg
	>
{/if}
