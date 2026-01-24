<script setup lang="ts">
import Button from "primevue/button";
import Card from "primevue/card";

type DashboardActivity = {
  id: string;
  title: string;
  url: string;
  description?: string;
  createdAt: Date;
  status: string;
  type: string;
  attackSessionId?: string;
};

defineProps<{
  recentSessions: DashboardActivity[];
}>();

const emit = defineEmits(["select-session", "delete-all-data"]);

const formatDate = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};
</script>

<template>
  <Card
    class="flex-1 h-full"
    :pt="{
      body: { class: 'h-full p-0' },
      content: { class: 'h-full flex flex-col' },
    }"
  >
    <template #content>
      <div class="p-4 h-full flex flex-col">
        <div class="mb-4">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-lg font-semibold">Recent Activity</h3>
            <Button
              icon="fas fa-trash"
              severity="danger"
              text
              size="small"
              title="Delete all sessions and activities"
              @click="emit('delete-all-data')"
            />
          </div>
          <p class="text-sm text-surface-400">
            Your recently scanned GraphQL endpoints and analysis results.
          </p>
        </div>

        <div
          v-if="recentSessions.length > 0"
          class="flex-1 overflow-auto space-y-3"
        >
          <div
            v-for="session in recentSessions"
            :key="session.id"
            :class="[
              'border rounded-lg transition-all duration-200 shadow-sm',
              session.type === 'attack'
                ? 'border-red-600 bg-red-900/20 cursor-default'
                : 'border-surface-600 bg-surface-800 hover:bg-surface-700 hover:border-surface-500 cursor-pointer',
            ]"
            @click="emit('select-session', session)"
          >
            <div class="p-3">
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2 flex-1 min-w-0">
                  <div class="font-semibold text-surface-100 truncate">
                    {{ session.title }}
                  </div>
                  <div class="text-xs text-surface-500">
                    {{ formatDate(session.createdAt) }}
                  </div>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <div
                    :class="{
                      'text-red-400':
                        session.type === 'attack' || session.status === 'error',
                      'text-green-400': session.status === 'success',
                      'text-yellow-400': session.status === 'warning',
                    }"
                  >
                    <i
                      class="text-sm"
                      :class="{
                        'fas fa-shield-alt': session.type === 'attack',
                        'fas fa-check-circle': session.status === 'success',
                        'fas fa-exclamation-triangle':
                          session.status === 'warning',
                        'fas fa-times-circle': session.status === 'error',
                      }"
                    ></i>
                  </div>
                </div>
              </div>
              <div class="text-sm text-surface-400 truncate">
                {{
                  session.type === "attack" ? session.description : session.url
                }}
              </div>
            </div>
          </div>
        </div>
        <div v-else class="flex-1 flex items-center justify-center">
          <div class="text-center text-surface-500">
            <i class="fas fa-clock text-3xl mb-3"></i>
            <div>
              No recent scans. Start by scanning a GraphQL endpoint above.
            </div>
          </div>
        </div>
      </div>
    </template>
  </Card>
</template>
