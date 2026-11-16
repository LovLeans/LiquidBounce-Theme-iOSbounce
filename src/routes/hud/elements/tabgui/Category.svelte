<script lang="ts">
    import {fade} from "svelte/transition";

    export let name: string;
    export let selected: boolean;

    $: iconPath = `img/hud/tabgui/${name.toLowerCase()}.svg`;
</script>

<!-- The highlight is not drawn here: TabGui.svelte has one selection pill that slides from row to row (spring), this row only changes
     its text / icon colour. A row is exactly --row high, the pill's position is index * --row. -->
<div class="category" class:selected>
    <div class="icon">
        <span
            class="category-icon"
            aria-hidden="true"
            transition:fade={{ duration: 200 }}
            style={`mask-image: url('${location.origin}${location.pathname}/${iconPath}');`}
        >
            <img class="category-icon-size" src={iconPath} alt="" />
        </span>
    </div>
    <div class="name">
        {name}
    </div>
</div>

<style lang="scss">

    .category {
        position: relative; // above the sliding pill
        display: flex;
        align-items: center;
        gap: 10px;
        height: var(--row);
        padding: 0 14px 0 10px;
        color: var(--tabgui-text-dimmed-color);
        transition: color .25s;

        &.selected {
            color: #fff;
        }
    }

    .name {
        font-weight: 600;
        font-size: 13px;
        letter-spacing: -.01em;
        white-space: nowrap;
    }

    .icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        flex: none;
    }

    .category-icon {
        display: inline-block;
        background-color: currentColor;
        mask-position: center;
        mask-repeat: no-repeat;
        mask-size: contain;
    }

    // the icon file's own size is only used to size the mask: 18px, whatever the file is
    .category-icon-size {
        display: block;
        width: 18px;
        height: 18px;
        object-fit: contain;
        visibility: hidden;
    }
</style>
