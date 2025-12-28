<script setup lang="ts">
import Button from "primevue/button";
import MenuBar from "primevue/menubar";
import { ref } from "vue";

import SettingsDialog from "./SettingsDialog.vue";

type PageType = "Dashboard" | "Explorer" | "Voyager" | "Attacks" | "Docs";
defineProps<{
  currentPage: PageType;
}>();
defineEmits<{
  (e: "page-change", page: PageType): void;
}>();
const items = [
  {
    label: "Dashboard",
    class: "mx-1",
    page: "Dashboard" as PageType,
  },
  {
    label: "Explorer",
    class: "mx-1",
    page: "Explorer" as PageType,
  },
  {
    label: "Voyager",
    class: "mx-1",
    page: "Voyager" as PageType,
  },
  {
    label: "Attacks",
    class: "mx-1",
    page: "Attacks" as PageType,
  },
  {
    label: "Docs",
    class: "mx-1",
    page: "Docs" as PageType,
  },
];
const handleLabel = (
  label: string | ((...args: unknown[]) => string) | undefined,
) => {
  if (typeof label === "function") {
    return label();
  }
  return label;
};

const showSettings = ref(false);
</script>
<template>
  <MenuBar :model="items" class="h-12 gap-2">
    <template #start>
      <div class="px-2 font-bold">GraphQL Analyzer</div>
    </template>
    <template #item="{ item }">
      <Button
        :severity="currentPage === item.page ? 'secondary' : 'contrast'"
        :outlined="currentPage === item.page"
        size="small"
        :text="currentPage !== item.page"
        :label="handleLabel(item.label)"
        @mousedown="$emit('page-change', item.page)"
      />
    </template>
    <template #end>
      <Button
        icon="fas fa-cog"
        severity="contrast"
        size="small"
        text
        v-tooltip="'Settings'"
        @click="showSettings = true"
      />
    </template>
  </MenuBar>
  <SettingsDialog v-model:visible="showSettings" />
</template>
