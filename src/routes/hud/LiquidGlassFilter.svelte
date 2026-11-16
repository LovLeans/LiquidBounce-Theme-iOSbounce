<script lang="ts">
    // The refraction of the HUD's liquid glass. `--hud-frost` (colors.scss) puts `url(#hud-liquid-glass)` into every glass element's
    // `backdrop-filter`, so what is behind the glass is bent along its rim and stays sharp in the middle, like a lens of thick glass.
    //
    // How: an SVG displacement map, stretched over the element with `feImage` + `preserveAspectRatio="none"`. Red moves the picture left /
    // right, green up / down; 128 = no move. Both gradients are 128 over the middle 40 % and run out to the edges, pulling the picture from
    // the inside of the glass towards its rim (so nothing is ever sampled from outside the box, where there is no backdrop). The rim's width is
    // a share of the element's size (not a fixed number of pixels), which suits the HUD: wide cards get a wide rim, thin capsules a thin one.
    // `SCALE` is the strength in px (the map is +-0.5 at the very edge, so the edge moves by SCALE / 2).
    //
    // The filter region is deliberately left at the SVG default (-10 % .. 120 % of the element): with an explicit `x/y/width/height="0 0 100%
    // 100%"` Chromium clipped the result by SCALE / 2 on the right and bottom at a device pixel ratio of 2 (checked in headless Chromium at 1x,
    // 1.5x, 2x). The map is therefore laid out for that region: the element is the middle 1 / 1.2 of it, see `m()`.
    //
    // Chromium only (the client's browser is); anywhere else the unknown filter makes the whole `backdrop-filter` invalid and the glass is just
    // the translucent fill. One copy is enough per page: it is referenced by id.
    const SCALE = 110;

    // element-space offset (0 = left / top edge of the element, 1 = right / bottom) -> offset in the map (which spans -10 % .. 110 %)
    const m = (e: number) => (e + 0.1) / 1.2;

    function channelMap(vertical: boolean): string {
        const c = (v: number) => (vertical ? `rgb(0,${v},0)` : `rgb(${v},0,0)`);
        const stops: [number, number][] = [
            [-0.1, 255], [0, 255], [0.04, 205], [0.1, 168], [0.3, 128],
            [0.7, 128], [0.9, 88], [0.96, 51], [1, 0], [1.1, 0]
        ];
        const svg =
            `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" preserveAspectRatio="none">` +
            `<defs><linearGradient id="g" x1="0" y1="0" x2="${vertical ? 0 : 1}" y2="${vertical ? 1 : 0}">` +
            stops.map(([e, v]) => `<stop offset="${m(e).toFixed(4)}" stop-color="${c(v)}"/>`).join("") +
            `</linearGradient></defs><rect width="100" height="100" fill="url(#g)"/></svg>`;
        return `data:image/svg+xml,${encodeURIComponent(svg)}`;
    }

    const mapX = channelMap(false);
    const mapY = channelMap(true);
</script>

<svg width="0" height="0" aria-hidden="true" style="position: absolute; pointer-events: none">
    <filter id="hud-liquid-glass" color-interpolation-filters="sRGB">
        <feImage href={mapX} preserveAspectRatio="none" result="mx"/>
        <feImage href={mapY} preserveAspectRatio="none" result="my"/>
        <feComposite in="mx" in2="my" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="map"/>
        <feDisplacementMap in="SourceGraphic" in2="map" scale={SCALE} xChannelSelector="R" yChannelSelector="G"/>
    </filter>
</svg>
