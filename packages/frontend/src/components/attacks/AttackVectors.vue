<script setup lang="ts">
import Card from "primevue/card";
import Checkbox from "primevue/checkbox";
import type { AttackType } from "shared";
import { computed } from "vue";

const props = defineProps<{
  selectedAttacks: AttackType[];
  availableAttacks: Array<{
    value: AttackType;
    label: string;
    description: string;
    severity: string;
  }>;
}>();

const emit = defineEmits<{
  "update:selectedAttacks": [value: AttackType[]];
  "toggle-select-all": [];
}>();

const allSelected = computed(() => {
  return props.selectedAttacks.length === props.availableAttacks.length;
});

const toggleAttack = (attackType: AttackType) => {
  const newSelection = [...props.selectedAttacks];
  const index = newSelection.indexOf(attackType);
  if (index > -1) {
    newSelection.splice(index, 1);
  } else {
    newSelection.push(attackType);
  }
  emit("update:selectedAttacks", newSelection);
};

const getSeverityIcon = (severity: string) => {
  switch (severity) {
    case "Critical":
    case "High":
      return "fas fa-exclamation-triangle text-red-400";
    case "Medium":
      return "fas fa-exclamation-triangle text-yellow-400";
    case "Low":
      return "fas fa-info-circle text-blue-400";
    default:
      return "fas fa-info-circle text-gray-400";
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
      <div class="p-4">
        <div class="flex items-center justify-between mb-4">
          <h4 class="text-base font-semibold">Attack Vectors</h4>
          <button
            class="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1"
            @click="emit('toggle-select-all')"
          >
            <i
              :class="allSelected ? 'fas fa-check-square' : 'far fa-square'"
            ></i>
            <span>Select All</span>
          </button>
        </div>

        <div class="space-y-3">
          <div
            v-for="attack in availableAttacks"
            :key="attack.value"
            class="flex items-start gap-3 p-3 bg-surface-800 rounded border border-surface-700 hover:border-surface-600 transition-colors"
          >
            <Checkbox
              :model-value="selectedAttacks.includes(attack.value)"
              :binary="true"
              class="mt-1"
              @update:model-value="toggleAttack(attack.value)"
            />
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1">
                <span class="font-medium text-sm">{{ attack.label }}</span>
                <i :class="getSeverityIcon(attack.severity)"></i>
                <span
                  class="text-xs px-2 py-0.5 rounded"
                  :class="{
                    'bg-red-900 text-red-400': attack.severity === 'High',
                    'bg-yellow-900 text-yellow-400':
                      attack.severity === 'Medium',
                    'bg-blue-900 text-blue-400': attack.severity === 'Low',
                  }"
                >
                  {{ attack.severity }}
                </span>
              </div>
              <p class="text-xs text-surface-400">{{ attack.description }}</p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </Card>
</template>
