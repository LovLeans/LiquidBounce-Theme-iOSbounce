// Inner SVG markup for a 16x16 viewBox, keyed by LiquidBounce category name.
export const icons = {
  Exploit: '<circle cx="8" cy="10" r="5" fill="#fff"/><path d="M10 4l3-2" stroke="#fff" stroke-width="1.6"/>',
  World: '<circle cx="8" cy="8" r="6.5" fill="none" stroke="#fff" stroke-width="1.6"/><path d="M1.5 8h13M8 1.5c-3 3-3 10 0 13M8 1.5c3 3 3 10 0 13" fill="none" stroke="#fff" stroke-width="1.2"/>',
  Render: '<path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" fill="#fff"/><circle cx="8" cy="8" r="2.2" fill="#555"/>',
  Movement: '<circle cx="10" cy="3" r="1.8" fill="#fff"/><path d="M3 9l4-2 3 2 2 4M7 7l-1 4-3 3" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  Combat: '<path d="M2 2l12 12M14 2L2 14" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>',
  Misc: '<circle cx="8" cy="8" r="7" fill="#fff"/><path d="M6 6.2a2 2 0 114 .3c0 1.3-2 1.5-2 3" fill="none" stroke="#444" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="12" r=".9" fill="#444"/>',
  Player: '<circle cx="8" cy="5" r="3" fill="#fff"/><path d="M2 14c0-3.5 3-5 6-5s6 1.5 6 5z" fill="#fff"/>',
  Client: '<circle cx="8" cy="8" r="7" fill="#fff"/>',
  Fun: '<path d="M2 14l3-9 6 6zM8 3l1-2M11 5l2-1M12 8l2 .5" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
};

// Fallback for categories without a dedicated icon
export const fallbackIcon = '<circle cx="8" cy="8" r="6" fill="#fff"/>';
