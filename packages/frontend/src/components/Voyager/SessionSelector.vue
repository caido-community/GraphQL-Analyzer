<script setup lang="ts">
import Button from "primevue/button";
import Card from "primevue/card";

import type { ExplorerSession } from "./types";

defineProps<{
  sessions: ExplorerSession[];
  selectedSessionId: string | undefined;
}>();

defineEmits<{
  select: [sessionId: string];
}>();
</script>

<template>
  <Card
    v-if="sessions.length > 0"
    class="h-fit"
    :pt="{
      body: { class: 'h-fit p-0' },
      content: { class: 'h-fit flex flex-col' },
    }"
  >
    <template #content>
      <div class="p-3">
        <div class="flex gap-2 flex-wrap">
          <Button
            v-for="session in sessions"
            :key="session.id"
            :class="[
              selectedSessionId === session.id
                ? '!border-secondary-400'
                : '!border-surface-700',
              '!bg-surface-900 border-[1px] rounded-md !ring-0',
            ]"
            severity="contrast"
            size="small"
            outlined
            @click="$emit('select', session.id)"
          >
            <div class="flex items-center gap-2">
              <div
                :class="[
                  'w-1.5 h-1.5 rounded-full',
                  session.status === 'success'
                    ? 'bg-success-500'
                    : session.status === 'error'
                      ? 'bg-red-500'
                      : session.status === 'warning'
                        ? 'bg-yellow-500'
                        : 'bg-surface-400',
                ]"
              ></div>
              <span class="px-1 whitespace-nowrap">{{ session.title }}</span>
            </div>
          </Button>
        </div>
      </div>
    </template>
  </Card>
</template>
