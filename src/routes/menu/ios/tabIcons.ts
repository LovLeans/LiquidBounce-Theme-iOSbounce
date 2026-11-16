/**
 * Icons of the IosTabBar tabs, as the inside of a 24x24 <svg>. They are drawn with `currentColor` (outlined, 1.8 wide, round ends;
 * the Microsoft one is four filled tiles), so the copy of the bar that sits inside the pill can colour them with the accent.
 * Only constants of this file are ever passed to `{@html}`.
 */
export const TAB_ICONS = {
    microsoft:
        '<rect x="3" y="3" width="8.2" height="8.2" rx="1.3" fill="currentColor" stroke="none"/>' +
        '<rect x="12.8" y="3" width="8.2" height="8.2" rx="1.3" fill="currentColor" stroke="none"/>' +
        '<rect x="3" y="12.8" width="8.2" height="8.2" rx="1.3" fill="currentColor" stroke="none"/>' +
        '<rect x="12.8" y="12.8" width="8.2" height="8.2" rx="1.3" fill="currentColor" stroke="none"/>',
    // a key: TheAltening accounts are bought as tokens
    altening:
        '<circle cx="7.6" cy="16.4" r="4"/><path d="M10.5 13.5L20.5 3.5M16.5 7.5l3 3M13.8 10.2l2.2 2.2"/>',
    // a player head with a break through it: an offline ("cracked") account
    cracked:
        '<circle cx="12" cy="7.6" r="3.6"/><path d="M4.6 20.5c0-3.6 3.2-6.2 7.4-6.2s7.4 2.6 7.4 6.2"/><path d="M3.5 3.5l17 17"/>',
    // an id badge: a session token
    session:
        '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="11" r="2"/><path d="M5.8 16.2c.4-1.6 1.7-2.4 3.2-2.4s2.8.8 3.2 2.4M14.5 9.5h3.5M14.5 13h3.5"/>'
} as const;

export type TabIcon = keyof typeof TAB_ICONS;
