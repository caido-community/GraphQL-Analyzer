<script setup lang="ts">
import Card from "primevue/card";
import Checkbox from "primevue/checkbox";
import Dropdown from "primevue/dropdown";
import { computed } from "vue";

import type { ExplorerSession } from "@/components/Explorer/useSessions";

const props = defineProps<{
  useCustomUrl: boolean;
  useSelectedRequest: boolean;
  selectedSessionId: string | undefined;
  sessions: ExplorerSession[];
  customUrl: string;
  selectedRequest:
    | {
        id?: string;
        host?: string;
        port?: number;
        path?: string;
        url?: string;
        method?: string;
      }
    | undefined;
  targetUrl: string;
}>();

const emit = defineEmits<{
  "update:useCustomUrl": [value: boolean];
  "update:useSelectedRequest": [value: boolean];
  "update:selectedSessionId": [value: string | undefined];
  "update:customUrl": [value: string];
}>();

const selectedSession = computed(() => {
  if (props.selectedSessionId === undefined) {
    return undefined;
  }
  return props.sessions.find((s) => s.id === props.selectedSessionId);
});

const formatDate = (date: Date) => {
  return new Date(date).toLocaleString();
};

const handleCustomUrlInput = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target !== null) {
    emit("update:customUrl", target.value);
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
        <div class="mb-4">
          <h4 class="text-base font-semibold">Target Selection</h4>
        </div>

        <div class="flex flex-wrap gap-6 mb-4">
          <div class="flex items-center gap-2">
            <Checkbox
              :model-value="!useCustomUrl && !useSelectedRequest"
              :binary="true"
              input-id="target-session"
              @update:model-value="
                (value: boolean) => {
                  if (value) {
                    emit('update:useCustomUrl', false);
                    emit('update:useSelectedRequest', false);
                  }
                }
              "
            />
            <label for="target-session" class="text-sm font-medium cursor-pointer"
              >Use Session</label
            >
          </div>

          <div class="flex items-center gap-2">
            <Checkbox
              :model-value="useCustomUrl"
              :binary="true"
              input-id="target-custom"
              @update:model-value="
                (value: boolean) => {
                  if (value) {
                    emit('update:useCustomUrl', true);
                    emit('update:useSelectedRequest', false);
                  }
                }
              "
            />
            <label for="target-custom" class="text-sm font-medium cursor-pointer"
              >Use Custom URL</label
            >
          </div>

          <div class="flex items-center gap-2">
            <Checkbox
              :model-value="useSelectedRequest"
              :binary="true"
              input-id="target-request"
              :disabled="!selectedRequest"
              @update:model-value="
                (value: boolean) => {
                  if (value) {
                    emit('update:useSelectedRequest', true);
                    emit('update:useCustomUrl', false);
                  }
                }
              "
            />
            <label
              for="target-request"
              class="text-sm font-medium cursor-pointer"
              :class="{ 'text-surface-500': !selectedRequest }"
            >
              Use Selected Request
            </label>
            <span v-if="!selectedRequest" class="text-xs text-surface-500"
              >(None selected)</span
            >
          </div>
        </div>

        <div v-if="!useCustomUrl && !useSelectedRequest" class="space-y-2">
          <label class="block text-sm font-medium">Select Session</label>
          <Dropdown
            :model-value="selectedSessionId"
            :options="sessions"
            option-label="title"
            option-value="id"
            placeholder="Choose a scanned session"
            class="w-full"
            :disabled="sessions.length === 0"
            @update:model-value="emit('update:selectedSessionId', $event)"
          />
          <div
            v-if="selectedSession"
            class="bg-surface-800 rounded p-3 text-sm"
          >
            <div class="flex items-center gap-2 mb-2">
              <div
                class="w-2 h-2 rounded-full"
                :class="{
                  'bg-green-500': selectedSession.status === 'success',
                  'bg-yellow-500': selectedSession.status === 'warning',
                  'bg-red-500': selectedSession.status === 'error',
                  'bg-surface-500': !selectedSession.status,
                }"
              ></div>
              <span class="font-medium">{{ selectedSession.title }}</span>
            </div>
            <div class="text-xs text-surface-400">
              <div><strong>URL:</strong> {{ selectedSession.url }}</div>
              <div>
                <strong>Introspection:</strong>
                {{
                  selectedSession.supportsIntrospection
                    ? "Supported"
                    : "Not supported"
                }}
              </div>
              <div>
                <strong>Scanned:</strong>
                {{ formatDate(selectedSession.createdAt) }}
              </div>
            </div>
          </div>
        </div>

        <div v-if="useCustomUrl" class="space-y-2">
          <label class="block text-sm font-medium">GraphQL Endpoint URL</label>
          <input
            :value="customUrl"
            type="text"
            placeholder="https://api.example.com/graphql"
            class="w-full px-3 py-2 bg-surface-700 border border-surface-600 rounded text-sm"
            @input="handleCustomUrlInput"
          />
        </div>

        <div
          v-if="useSelectedRequest && selectedRequest"
          class="space-y-2 bg-surface-800 rounded p-3"
        >
          <div class="text-sm font-medium mb-2">Selected Request</div>
          <div class="text-xs text-surface-400 space-y-1">
            <div v-if="selectedRequest.id">
              <strong>ID:</strong> {{ selectedRequest.id }}
            </div>
            <div v-if="selectedRequest.host">
              <strong>Host:</strong> {{ selectedRequest.host }}
            </div>
            <div v-if="selectedRequest.path">
              <strong>Path:</strong> {{ selectedRequest.path }}
            </div>
            <div v-if="selectedRequest.url">
              <strong>Target:</strong> {{ selectedRequest.url }}
            </div>
          </div>
        </div>
      </div>
    </template>
  </Card>
</template>
