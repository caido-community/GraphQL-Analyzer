<script setup lang="ts">
import Button from "primevue/button";
import Card from "primevue/card";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";

const props = defineProps<{
  maxDepth: number;
  batchSize: number;
  customHeaders: Array<{ name: string; value: string }>;
}>();

const emit = defineEmits<{
  "update:maxDepth": [value: number];
  "update:batchSize": [value: number];
  "update:customHeaders": [value: Array<{ name: string; value: string }>];
  "add-header": [];
  "remove-header": [index: number];
}>();

const updateHeader = (index: number, field: "name" | "value", value: string) => {
  const newHeaders = [...props.customHeaders];
  if (newHeaders[index] !== undefined) {
    newHeaders[index] = { ...newHeaders[index], [field]: value };
    emit("update:customHeaders", newHeaders);
  }
};
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
      <div class="p-4 space-y-4">
        <div>
          <h4 class="text-base font-semibold mb-4">Configuration</h4>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-2">Max Depth</label>
            <InputNumber
              :model-value="maxDepth"
              :min="1"
              :max="100"
              class="w-full"
              @update:model-value="emit('update:maxDepth', $event ?? 10)"
            />
            <p class="text-xs text-surface-400 mt-1">
              For depth-limit attacks
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium mb-2">Batch Size</label>
            <InputNumber
              :model-value="batchSize"
              :min="1"
              :max="50"
              class="w-full"
              @update:model-value="emit('update:batchSize', $event ?? 5)"
            />
            <p class="text-xs text-surface-400 mt-1">
              For batch-query attacks
            </p>
          </div>

          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="block text-sm font-medium">Custom Headers</label>
              <Button
                v-if="customHeaders.length < 10"
                icon="fas fa-plus"
                size="small"
                severity="danger"
                text
                @click="emit('add-header')"
              />
            </div>
            <div
              v-if="customHeaders.length === 0"
              class="text-xs text-surface-500 italic"
            >
              Click + to add custom headers
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="(header, index) in customHeaders"
                :key="index"
                class="flex gap-2 items-center"
              >
                <InputText
                  :model-value="header.name"
                  placeholder="Header name"
                  class="flex-1 text-sm"
                  @update:model-value="updateHeader(index, 'name', $event ?? '')"
                />
                <InputText
                  :model-value="header.value"
                  placeholder="Header value"
                  class="flex-1 text-sm"
                  @update:model-value="updateHeader(index, 'value', $event ?? '')"
                />
                <Button
                  icon="fas fa-times"
                  size="small"
                  severity="danger"
                  text
                  @click="emit('remove-header', index)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </Card>
</template>

