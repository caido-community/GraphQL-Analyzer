<script setup lang="ts">
import Button from "primevue/button";

defineEmits<{
  "zoom-in": [];
  "zoom-out": [];
  "fit-to-view": [];
  "reset-zoom": [];
}>();
</script>

<template>
  <div
    class="absolute top-4 right-4 flex flex-col gap-2 bg-surface-900 border border-surface-600 rounded-lg p-2 shadow-lg"
  >
    <Button
      v-tooltip="'Zoom In'"
      icon="fas fa-search-plus"
      size="small"
      text
      class="w-10 h-10"
      @click="$emit('zoom-in')"
    />
    <Button
      v-tooltip="'Zoom Out'"
      icon="fas fa-search-minus"
      size="small"
      text
      class="w-10 h-10"
      @click="$emit('zoom-out')"
    />
    <div class="border-t border-surface-600 my-1"></div>
    <Button
      v-tooltip="'Fit to View'"
      icon="fas fa-compress-arrows-alt"
      size="small"
      text
      class="w-10 h-10"
      @click="$emit('fit-to-view')"
    />
    <Button
      v-tooltip="'Reset Zoom'"
      icon="fas fa-undo"
      size="small"
      text
      class="w-10 h-10"
      @click="$emit('reset-zoom')"
    />
  </div>
</template>
