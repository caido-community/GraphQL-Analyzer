<script setup lang="ts">
import Button from "primevue/button";
import Card from "primevue/card";

defineEmits<{
  (e: "import-schema"): void;
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
          <h3 class="text-lg font-semibold">GraphQL Schema Scanner</h3>
          <p class="text-sm text-surface-300">
            Discover and analyze GraphQL endpoints to identify schema
            information and security insights.
          </p>
        </div>
        <Button
          label="Import Schema"
          icon="fas fa-file-import"
          severity="secondary"
          outlined
          size="small"
          @click="$emit('import-schema')"
        />
      </div>
    </template>
  </Card>
</template>
