<script setup lang="ts">
import * as d3 from "d3";
import { onMounted, ref } from "vue";

import type { D3Node } from "./types";

defineProps<{
  minimapViewBox: { x: number; y: number; width: number; height: number };
  currentTransform: d3.ZoomTransform;
  cachedD3Data: { nodes: D3Node[]; links: unknown[] } | undefined;
}>();

const emit = defineEmits<{
  "minimap-svg-ready": [svg: SVGSVGElement];
}>();

const minimapSvgRef = ref<SVGSVGElement | undefined>(undefined);

onMounted(() => {
  if (minimapSvgRef.value !== undefined) {
    emit("minimap-svg-ready", minimapSvgRef.value);
  }
});
</script>

<template>
  <div
    v-if="cachedD3Data !== undefined"
    class="absolute bottom-4 right-4 w-48 h-32 border border-surface-500 rounded-lg shadow-lg overflow-hidden"
    style="background: hsl(var(--c-surface-900))"
  >
    <svg
      ref="minimapSvgRef"
      class="w-full h-full"
      :viewBox="`${minimapViewBox.x} ${minimapViewBox.y} ${minimapViewBox.width} ${minimapViewBox.height}`"
      style="background: hsl(var(--c-surface-800))"
    >
      <defs>
        <mask id="minimap-mask">
          <rect
            :x="minimapViewBox.x"
            :y="minimapViewBox.y"
            :width="minimapViewBox.width"
            :height="minimapViewBox.height"
            fill="white"
          />
          <rect
            :x="-currentTransform.x / currentTransform.k"
            :y="-currentTransform.y / currentTransform.k"
            :width="minimapViewBox.width / currentTransform.k"
            :height="minimapViewBox.height / currentTransform.k"
            fill="black"
          />
        </mask>
      </defs>

      <g>
        <rect
          v-for="node in cachedD3Data.nodes"
          :key="node.id"
          :x="node.x"
          :y="node.y"
          :width="node.width"
          :height="node.height"
          :fill="node.color"
          opacity="0.6"
          stroke="none"
        />

        <rect
          :x="minimapViewBox.x"
          :y="minimapViewBox.y"
          :width="minimapViewBox.width"
          :height="minimapViewBox.height"
          fill="black"
          opacity="0.25"
          mask="url(#minimap-mask)"
          pointer-events="none"
        />

        <rect
          class="minimap-viewport"
          :x="-currentTransform.x / currentTransform.k"
          :y="-currentTransform.y / currentTransform.k"
          :width="minimapViewBox.width / currentTransform.k"
          :height="minimapViewBox.height / currentTransform.k"
          fill="rgba(255, 255, 255, 0.05)"
          stroke="hsl(var(--c-primary-300))"
          stroke-width="35"
          opacity="0.95"
          style="cursor: move"
        />
      </g>
    </svg>
    <div
      class="absolute top-1 left-1 text-xs text-surface-400 px-2 py-1 rounded"
      style="background: rgba(0, 0, 0, 0.6)"
    >
      Minimap
    </div>
  </div>
</template>

