<script lang="ts">
    import {getComponentFileUrl} from "../../../integration/rest";

    interface Props {
        componentId: string;
        settings: { [name: string]: any };
        inEditor?: boolean;
    }

    const {componentId, settings, inEditor = false}: Props = $props();

    const maxVisualHeight = 70;

    let scale = $derived(resolveScale(settings.scale));
    let maxHeight = $derived(`${maxVisualHeight / scale}vh`);
    let source = $derived(resolveSource());

    function resolveSource() {
        const sourceSetting = settings.source;

        if (sourceSetting?.active !== "File") {
            return sourceSetting?.value?.uRL;
        }

        const file = sourceSetting.value?.file;
        return file
            ? getComponentFileUrl(componentId, file)
            : "";
    }

    function resolveScale(value: unknown) {
        const scale = Number(value);

        return Number.isFinite(scale) && scale > 0 ? scale : 1;
    }
</script>

{#if source}
    {#key source}
        <img src={source} alt="" class="image" style:zoom={scale} style:max-height={maxHeight}
             style:opacity="{settings.opacity}%">
    {/key}
{:else if inEditor}
    <!-- a freshly added Image has no file or URL yet and used to draw nothing at all: show that it is there -->
    <div class="placeholder">No image set<br>Open the settings to choose a file or URL</div>
{/if}

<style lang="scss">
  .placeholder {
    box-sizing: border-box;
    min-width: 160px;
    padding: 12px;
    text-align: center;
    font-size: 12px;
    line-height: 1.4;
    color: var(--clickgui-text-dimmed-color, #aaa);
    border: dashed 2px currentColor;
    border-radius: 6px;
  }

  .image {
    display: block;
    height: auto;
    object-fit: contain;
  }
</style>
