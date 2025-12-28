<script setup lang="ts">
import { useDebounceFn, whenever } from "@vueuse/core";
import Button from "primevue/button";
import ContextMenu from "primevue/contextmenu";
import type { AttackSession } from "shared";
import { nextTick, ref } from "vue";

const isEditable = defineModel<boolean>("isEditable", { default: false });

const props = defineProps<{
  isSelected: boolean;
  attackSession: AttackSession;
}>();

const emit = defineEmits<{
  (e: "select", event: MouseEvent): void;
  (e: "rename", newName: string): void;
  (e: "delete"): void;
}>();

const newValue = ref("");
const inputRef = ref<HTMLInputElement>();
const contextMenuRef = ref<InstanceType<typeof ContextMenu>>();

const contextMenuItems = [
  {
    label: "Rename",
    icon: "fas fa-pencil",
    command: () => {
      isEditable.value = true;
    },
  },
  {
    label: "Delete",
    icon: "fas fa-trash",
    command: () => {
      emit("delete");
    },
  },
];

const getStatusIcon = (status: string) => {
  switch (status) {
    case "completed":
      return "fas fa-circle";
    case "failed":
      return "fas fa-times";
    case "cancelled":
      return "fas fa-ban";
    case "running":
      return "fas fa-spinner fa-spin";
    default:
      return "fas fa-circle";
  }
};

const onDoubleClick = () => {
  isEditable.value = true;
};

const onRightClick = (event: MouseEvent) => {
  contextMenuRef.value?.show(event);
};

whenever(isEditable, async () => {
  newValue.value = props.attackSession.title;
  await nextTick();

  const input = inputRef.value;
  if (input !== undefined) {
    input.focus();
    input.select();
  }
});

const onSubmit = useDebounceFn(() => {
  if (newValue.value !== props.attackSession.title) {
    emit("rename", newValue.value);
  }

  isEditable.value = false;
}, 10);

const onSelect = (event: MouseEvent) => {
  emit("select", event);
};
</script>

<template>
  <div
    :data-is-selected="isSelected"
    :data-is-editable="isEditable"
    @dblclick="onDoubleClick"
    @contextmenu.prevent="onRightClick"
  >
    <Button
      :class="[
        isSelected ? '!border-secondary-400' : '!border-surface-700',
        '!bg-surface-900 border-[1px] rounded-md !ring-0 flex-1',
      ]"
      severity="contrast"
      size="small"
      outlined
      @mousedown="onSelect"
    >
      <div class="flex items-center gap-2 min-w-0 w-full">
        <i
          :class="[
            'text-xs flex-shrink-0',
            getStatusIcon(attackSession.status),
          ]"
        ></i>

        <template v-if="isEditable">
          <div class="relative flex-1 min-w-0">
            <span class="invisible px-1 whitespace-nowrap">{{ newValue }}</span>
            <input
              ref="inputRef"
              v-model="newValue"
              autocomplete="off"
              name="label"
              class="absolute top-0 left-0 w-full h-full px-1 text-sm focus:outline outline-1 outline-secondary-400 rounded-sm bg-surface-900 overflow-hidden text-ellipsis"
              @focusout.prevent="onSubmit"
              @keydown.enter.prevent="onSubmit"
            />
          </div>
        </template>
        <div v-else class="flex-1 min-w-0">
          <span class="px-1 whitespace-nowrap text-ellipsis overflow-hidden">{{
            attackSession.title
          }}</span>
        </div>
      </div>
    </Button>

    <ContextMenu ref="contextMenuRef" :model="contextMenuItems" />
  </div>
</template>
