<script setup lang="ts">
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import InputText from "primevue/inputtext";

import { CTree, type TreeItem } from "@/components/common/CTree";

defineProps<{
  items: TreeItem[];
}>();
const filter = defineModel<string>("filter");

const expandedKeys = defineModel<Set<string>>("expandedKeys");
const selectionKeys = defineModel<Set<string>>("selectionKeys");

const emit = defineEmits<{
  (e: "nodeSelect", item: TreeItem): void;
}>();

const onItemClick = (_event: MouseEvent, item: TreeItem) => {
  emit("nodeSelect", item);
};
</script>

<template>
  <div class="flex flex-col h-full w-full">
    <div class="p-2 border-b border-surface-700 search-box">
      <IconField>
        <InputIcon class="fas fa-search" />
        <InputText
          v-model="filter"
          placeholder="Filter..."
          class="w-full h-8 text-sm"
        />
      </IconField>
    </div>

    <div class="flex-1 min-h-0 bg-surface-900/30">
      <!-- item-height=24 for compact sitemap look -->
      <CTree
        v-if="items.length > 0"
        v-model:expanded-keys="expandedKeys"
        v-model:selection-keys="selectionKeys"
        :items="items"
        :item-height="24"
        :search="filter"
        @item-click="onItemClick"
      >
        <template #default="{ item }">
          <span
            class="text-sm text-surface-300 group-hover:text-surface-0 transition-colors truncate"
          >
            {{ item.label }}
          </span>
        </template>
        <template #empty>
          <div class="text-center p-4 text-surface-500 text-sm">
            No results found
          </div>
        </template>
      </CTree>

      <div
        v-else
        class="h-full flex flex-col items-center justify-center text-surface-500 p-4"
      >
        <i class="fas fa-exclamation-triangle text-3xl mb-3"></i>
        <div class="text-sm">No introspection support or empty schema</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-box :deep(.p-inputtext) {
  background: var(--surface-800);
  border-color: var(--surface-700);
}

.search-box :deep(.p-inputtext:focus) {
  border-color: var(--surface-500);
}
</style>
