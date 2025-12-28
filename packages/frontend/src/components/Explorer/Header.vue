<script setup lang="ts">
import Button from "primevue/button";
import Card from "primevue/card";

defineProps<{
  onClearAll?: () => void;
}>();
</script>

<template>
  <Card
    class="h-fit"
    :pt="{
      body: { class: 'h-fit p-0' },
      content: { class: 'h-fit flex flex-col' },
    }"
  >
    <template #content>
      <div class="flex justify-between items-center p-4">
        <div>
          <h3 class="text-lg font-semibold">Schema Explorer</h3>
          <p class="text-sm text-surface-300">
            Browse and analyze GraphQL schema information and security insights.
          </p>
        </div>
        <div>
          <Button
            v-tooltip="'Clear all sessions and data'"
            icon="fas fa-trash"
            severity="danger"
            text
            size="small"
            @click="onClearAll"
          />
        </div>
      </div>
    </template>
  </Card>
</template>
