<script setup lang="ts">
import Button from "primevue/button";
import Card from "primevue/card";
import InputText from "primevue/inputtext";

const scanUrl = defineModel("scanUrl", { type: String, required: true });

defineProps<{
  isScanning: boolean;
}>();

defineEmits(["scan", "clear-fields"]);
</script>

<template>
  <Card
    class="flex-1"
    :pt="{
      body: { class: 'h-full p-0' },
      content: { class: 'h-full flex flex-col' },
    }"
  >
    <template #content>
      <div class="p-6 h-full flex flex-col">
        <div class="mb-6 flex items-start justify-between">
          <div class="flex-1">
            <h3 class="text-xl font-bold mb-3">Scan GraphQL Endpoint</h3>
            <p class="text-base text-surface-300">
              Enter a GraphQL endpoint URL to perform introspection and discover
              the schema structure.
            </p>
          </div>
          <Button
            v-tooltip="'Clear all fields'"
            icon="fas fa-eraser"
            severity="secondary"
            text
            size="small"
            class="ml-2"
            @click="$emit('clear-fields')"
          />
        </div>

        <div class="flex-1 flex flex-col justify-center space-y-4">
          <div>
            <label for="scan-url" class="block text-base font-semibold mb-3">
              GraphQL Endpoint URL
            </label>
            <InputText
              id="scan-url"
              v-model="scanUrl"
              placeholder="https://example.com/graphql"
              class="w-full text-base p-3"
              size="large"
              :disabled="isScanning"
              @keyup.enter="$emit('scan')"
            />
          </div>
          <div class="flex justify-center">
            <Button
              label="Scan"
              icon="fas fa-search"
              size="large"
              class="px-16 py-3 min-w-48"
              :loading="isScanning"
              @click="$emit('scan')"
            />
          </div>
        </div>
      </div>
    </template>
  </Card>
</template>
