<script setup lang="ts">
import Button from "primevue/button";
import Card from "primevue/card";
import InputText from "primevue/inputtext";

defineProps<{
  customHeaders: Array<{ name: string; value: string }>;
  parsedHeaders: Record<string, string>;
  isScanning: boolean;
}>();

const emit = defineEmits(["add-header", "remove-header"]);
</script>

<template>
  <Card
    class="flex-1 min-h-0"
    :pt="{
      body: { class: 'h-full p-0' },
      content: { class: 'h-full flex flex-col' },
    }"
  >
    <template #content>
      <div class="p-4 h-full flex flex-col" style="max-height: 100%">
        <div class="mb-3 flex-shrink-0">
          <div class="flex items-center justify-between mb-2">
            <div>
              <h3 class="text-lg font-semibold">Custom Headers</h3>
              <p class="text-sm text-surface-400">
                Add custom headers for authenticated scanning
              </p>
            </div>
            <div class="flex items-center gap-2">
              <span
                class="text-xs text-surface-500 px-2 py-1 bg-surface-700 rounded"
              >
                <i class="fas fa-key mr-1"></i>
                {{ Object.keys(parsedHeaders).length }} headers
              </span>
              <Button
                v-tooltip="
                  customHeaders.length >= 20
                    ? 'Maximum 20 headers allowed'
                    : 'Add custom header'
                "
                :disabled="customHeaders.length >= 20 || isScanning"
                icon="fas fa-plus"
                size="small"
                severity="secondary"
                @click="emit('add-header')"
              />
            </div>
          </div>
        </div>

        <div
          class="flex-1 overflow-y-auto overflow-x-hidden pr-2"
          style="min-height: 0"
        >
          <div
            v-if="customHeaders.length === 0"
            class="text-center text-surface-500 py-8"
          >
            <i class="fas fa-plus-circle text-3xl mb-3"></i>
            <div class="text-sm">No custom headers added</div>
            <div class="text-xs mt-1">
              Click + to add Authorization, Cookie, or other headers
            </div>
          </div>

          <div v-else class="space-y-2 pb-2">
            <div
              v-for="(header, index) in customHeaders"
              :key="index"
              class="flex items-center gap-2"
            >
              <InputText
                v-model="header.name"
                placeholder="Header name (e.g. Authorization)"
                class="flex-1"
                size="small"
                :disabled="isScanning"
              />
              <InputText
                v-model="header.value"
                placeholder="Header value"
                class="flex-1"
                size="small"
                :disabled="isScanning"
              />
              <Button
                v-tooltip="'Remove header'"
                icon="fas fa-times"
                size="small"
                text
                severity="danger"
                :disabled="isScanning"
                @click="emit('remove-header', index)"
              />
            </div>
          </div>
        </div>

        <div
          class="mt-3 text-xs text-surface-500 flex-shrink-0 border-t border-surface-600 pt-3"
        >
          <i class="fas fa-info-circle mr-1"></i>
          Headers are automatically included when scanning from HTTP History
        </div>
      </div>
    </template>
  </Card>
</template>
