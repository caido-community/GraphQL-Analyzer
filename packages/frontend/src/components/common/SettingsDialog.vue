<script setup lang="ts">
import Button from "primevue/button";
import Card from "primevue/card";
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

const DEFAULT_MAX_DEPTH = 3;

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
  if (maxDepth.value < 1 || maxDepth.value > 10) {
    sdk.window.showToast("Max Depth must be between 1 and 10", {
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
      root: { class: 'p-0' },
      header: {
        class:
          'p-4 border-b border-surface-700 bg-surface-800 flex items-center justify-between',
      },
      content: { class: 'p-4 bg-surface-900' },
      footer: {
        class:
          'p-4 border-t border-surface-700 flex justify-end gap-2 bg-surface-800',
      },
      closeButton: { class: 'text-surface-300 hover:text-surface-100' },
      closeButtonIcon: { class: 'text-surface-300' },
    }"
  >
    <template #header>
      <span class="text-lg font-semibold text-surface-100">Settings</span>
    </template>
    <template #content>
      <Card
        :pt="{
          root: { class: 'bg-transparent border-0 shadow-none' },
          body: { class: 'p-0' },
          content: { class: 'p-0' },
        }"
      >
        <template #content>
          <div class="space-y-4">
            <div>
              <div class="flex items-center gap-2 mb-2">
                <label class="text-sm font-medium text-surface-200"
                  >Max Depth</label
                >
                <i
                  v-tooltip="
                    'Recommended to keep max depth under 5. Increasing this value will generate longer GraphQL queries with more nested fields, which may impact performance and readability.'
                  "
                  class="fas fa-eye text-surface-400 cursor-help hover:text-surface-300 transition-colors"
                />
              </div>
              <div class="flex items-center gap-3">
                <InputNumber
                  v-model="maxDepth"
                  :min="1"
                  :max="10"
                  show-buttons
                  class="w-32"
                  :pt="{
                    input: {
                      class:
                        'bg-surface-800 border-surface-700 text-surface-100',
                    },
                    buttonGroup: { class: 'bg-surface-800 border-surface-700' },
                    incrementButton: {
                      class: 'text-surface-300 hover:text-surface-100',
                    },
                    decrementButton: {
                      class: 'text-surface-300 hover:text-surface-100',
                    },
                  }"
                />
              </div>
              <p class="text-xs text-surface-400 mt-2">
                Controls the maximum nesting depth for generated GraphQL
                queries. Lower values produce shorter, more readable queries.
              </p>
            </div>
          </div>
        </template>
      </Card>
    </template>
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
