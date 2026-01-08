<script setup lang="ts">
import Button from "primevue/button";
import Card from "primevue/card";

defineProps<{
  navigateTo?: (
    page: "Dashboard" | "Explorer" | "Voyager" | "Attacks" | "History",
  ) => void;
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
          <h3 class="text-lg font-semibold">GraphQL Voyager</h3>
          <p class="text-sm text-surface-300">
            Interactive exploration of GraphQL schema relationships and
            structure.
          </p>
        </div>
        <Button
          label="Back to Explorer"
          icon="fas fa-arrow-left"
          severity="secondary"
          @click="navigateTo?.('Explorer')"
        />
      </div>
    </template>
  </Card>
</template>
