<script setup generic="T, U = string" lang="ts">
import { ref } from "vue";

import Row from "./Row.vue";
import type { TreeItem } from "./types";
import { useForm } from "./useForm";

type Props<T, U> = {
  items: TreeItem<T, U>[];
  itemHeight: number;
  search?: string;
};

const props = defineProps<Props<T, U>>();

const expandedKeys = defineModel<Set<U>>("expandedKeys", {
  required: false,
  default: () => new Set<U>(),
});

const selectionKeys = defineModel<Set<U>>("selectionKeys", {
  required: false,
  default: () => new Set<U>(),
});

const emit = defineEmits<{
  (e: "itemContextmenu", event: MouseEvent, item: TreeItem<T, U>): void;
  (e: "itemClick", event: MouseEvent, item: TreeItem<T, U>): void;
}>();

const {
  parentRef,
  resolvedRows,
  resolvedItems,
  onToggleExpand,
  onToggleSelect,
  isExpanded,
  isSelected,
} = useForm({
  items: () => props.items,
  itemHeight: () => props.itemHeight,
  search: () => props.search ?? "",
  expandedKeys,
  selectionKeys,
});

const tbodyRef = ref<HTMLElement>();
</script>

<template>
  <div ref="parentRef" class="relative w-full h-full overflow-y-auto">
    <table v-if="resolvedItems.length > 0" class="w-full h-full">
      <tbody
        ref="tbodyRef"
        class="block relative w-full"
        :style="{
          height: `${resolvedItems.length * itemHeight}px`,
        }"
      >
        <Row
          v-for="row in resolvedRows"
          :key="row.virtualItem.index"
          :row="row"
          :is-draggable="false"
          :is-expanded="isExpanded"
          :is-selected="isSelected"
          :on-toggle-expand="onToggleExpand"
          :on-toggle-select="onToggleSelect"
          @contextmenu="emit('itemContextmenu', $event, row.resolvedItem)"
          @click="emit('itemClick', $event, row.resolvedItem)"
          @toggle-click="onToggleExpand"
          @select-click="onToggleSelect"
        >
          <template #default="slotProps">
            <slot v-bind="slotProps" />
          </template>

          <template #actions="slotProps">
            <slot name="actions" v-bind="slotProps" />
          </template>
        </Row>
      </tbody>
    </table>
    <div v-else>
      <slot name="empty" />
    </div>
  </div>
</template>
