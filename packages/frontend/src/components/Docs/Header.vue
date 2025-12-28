<script setup lang="ts">
import Card from "primevue/card";
</script>

<template>
  <Card
    class="h-fit"
    :pt="{
      body: { class: 'h-fit p-0 flex flex-col' },
      content: { class: 'h-fit flex flex-col' },
    }"
  >
    <template #header>
      <div class="flex items-center justify-between">
        <div class="p-4">
          <h2 class="text-lg font-semibold">GraphQL Analyzer Documentation</h2>
          <p class="text-sm text-surface-400">
            Complete guide to using GraphQL Analyzer for comprehensive GraphQL
            security testing and schema analysis in Caido.
          </p>
        </div>
      </div>
    </template>
  </Card>
</template>
