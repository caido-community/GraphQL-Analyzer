<script setup lang="ts">
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputNumber from "primevue/inputnumber";
import { computed, ref, watch } from "vue";

import { useSDK } from "@/plugins/sdk";
import { createStorageService } from "@/services/storage";

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: "update:visible", value: boolean): void;
}>();

const sdk = useSDK();
const storageService = createStorageService(sdk);

const DEFAULT_MAX_DEPTH = 5;

const maxDepth = ref(DEFAULT_MAX_DEPTH);
const isVisible = computed({
  get: () => props.visible,
  set: (value) => emit("update:visible", value),
});

const loadSettings = () => {
  const stored = storageService.get<number>("graphql-analyzer-max-depth");
  maxDepth.value =
    stored !== undefined && stored > 0 ? stored : DEFAULT_MAX_DEPTH;
};

const saveSettings = async () => {
  if (maxDepth.value < 1 || maxDepth.value > 250) {
    sdk.window.showToast("Max Depth must be between 1 and 250", {
      variant: "error",
    });
    return;
  }
  await storageService.set("graphql-analyzer-max-depth", maxDepth.value);
  sdk.window.showToast("Settings saved successfully", { variant: "success" });
  isVisible.value = false;
};

const resetSettings = () => {
  maxDepth.value = DEFAULT_MAX_DEPTH;
};

watch(
  () => props.visible,
  (newValue) => {
    if (newValue === true) {
      loadSettings();
    }
  },
);
</script>

<template>
  <Dialog
    v-model:visible="isVisible"
    modal
    :style="{ width: '500px' }"
    :pt="{
      root: { class: 'p-0 rounded-lg overflow-hidden' },
      header: {
        class:
          'p-4 border-b border-surface-700 bg-surface-800 flex items-center justify-between',
      },
      content: { class: 'p-4 bg-surface-900' },
      footer: {
        class:
          'p-4 border-t border-surface-700 flex justify-end gap-2 bg-surface-800',
      },
      closeButton: { class: 'text-surface-300 hover:text-surface-100 w-8 h-8 flex items-center justify-center' },
      closeButtonIcon: { class: 'text-surface-300 text-lg' },
    }"
  >
    <template #header>
      <div class="flex items-center justify-between w-full">
        <span class="text-lg font-semibold text-surface-100">Settings</span>
      </div>
    </template>
    <div class="p-4 bg-surface-900 space-y-4">
      <div>
        <div class="flex items-center gap-2 mb-2">
          <label class="text-sm font-medium text-surface-200"
            >Max Depth</label
          >
          <i
            v-tooltip="
              'Recommended to keep max depth under 10. Increasing this value will generate longer GraphQL queries with more nested fields, which may impact performance and readability.'
            "
            class="fas fa-info-circle text-surface-400 cursor-help hover:text-surface-300 transition-colors"
          />
        </div>
        <InputNumber
          v-model="maxDepth"
          :min="1"
          :max="250"
          class="w-full"
          :pt="{
            root: { class: 'w-full' },
            input: {
              class: 'bg-surface-800 border-surface-700 text-surface-100 w-full',
            },
          }"
        />
        <p class="text-xs text-surface-400 mt-2">
          Controls the maximum nesting depth for generated GraphQL queries.
          Lower values produce shorter, more readable queries.
        </p>
      </div>
    </div>
    <template #footer>
      <Button
        label="Reset"
        severity="secondary"
        outlined
        size="small"
        @click="resetSettings"
      />
      <Button
        label="Save"
        severity="primary"
        size="small"
        @click="saveSettings"
      />
    </template>
  </Dialog>
</template>
