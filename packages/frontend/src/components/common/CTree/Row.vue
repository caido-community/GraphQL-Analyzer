<script setup generic="T, U" lang="ts">
import type { ResolvedRow } from "./types";

defineProps<{
  row: ResolvedRow<T, U>;
  isExpanded: (id: U) => boolean;
  isSelected: (id: U) => boolean;
}>();

const emit = defineEmits<{
  (e: "toggleClick", id: U): void;
  (e: "selectClick", id: U): void;
}>();
</script>

<template>
  <tr
    class="c-tree-row"
    :class="[
      'flex absolute w-full leading-none items-stretch data-[is-odd=true]:bg-surface-900/50 data-[selected=true]:bg-surface-0/10 hover:bg-surface-800/50 cursor-pointer border-l-2 border-b-[1px] border-surface-900',
      isSelected(row.resolvedItem.id)
        ? 'border-l-primary-400'
        : 'border-l-transparent',
    ]"
    :data-id="row.resolvedItem.id"
    :data-is-odd="row.virtualItem.index % 2 === 1"
    :data-selected="isSelected(row.resolvedItem.id)"
    :style="{
      height: `${row.virtualItem.size}px`,
      transform: `translateY(${row.virtualItem.start}px)`,
    }"
    @click="emit('selectClick', row.resolvedItem.id)"
  >
    <td class="flex p-0 items-center w-full">
      <div class="flex gap-1 items-center w-full">
        <div
          class="flex-shrink-0"
          :style="{
            width: `${row.resolvedItem.depth}rem`,
          }"
        />

        <button
          v-if="row.resolvedItem.hasChildren"
          class="flex-shrink-0 h-6 w-8 flex items-center justify-center hover:bg-surface-700/50 rounded"
          @click.stop="emit('toggleClick', row.resolvedItem.id)"
        >
          <i
            :class="[
              'text-xs text-surface-400',
              isExpanded(row.resolvedItem.id)
                ? 'fas fa-chevron-down'
                : 'fas fa-chevron-right',
            ]"
          />
        </button>
        <div v-else class="flex-shrink-0 w-8" />

        <div
          v-if="row.resolvedItem.icon"
          class="flex-shrink-0 w-4 h-4 flex items-center justify-center mr-1"
        >
          <i :class="['text-xs text-surface-400', row.resolvedItem.icon]" />
        </div>

        <!-- Label Content -->
        <div class="flex-1 min-w-0">
          <slot
            :item="row.resolvedItem"
            :depth="row.resolvedItem.depth"
            :is-expanded="isExpanded(row.resolvedItem.id)"
            :is-selected="isSelected(row.resolvedItem.id)"
            :has-children="row.resolvedItem.hasChildren"
          />
        </div>

        <div class="flex-shrink-0 pr-2" @click.stop>
          <slot
            name="actions"
            :item="row.resolvedItem"
            :depth="row.resolvedItem.depth"
            :is-expanded="isExpanded(row.resolvedItem.id)"
            :is-selected="isSelected(row.resolvedItem.id)"
            :has-children="row.resolvedItem.hasChildren"
          />
        </div>
      </div>
    </td>
  </tr>
</template>
