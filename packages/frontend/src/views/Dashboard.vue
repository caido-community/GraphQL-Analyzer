<script setup lang="ts">
import Button from "primevue/button";
import Card from "primevue/card";

import InputText from "primevue/inputtext";
import { onMounted, onUnmounted, ref } from "vue";

import { useSDK } from "../plugins/sdk";
import type { Result } from "backend";

const sdk = useSDK();

const props = defineProps<{
  navigateTo?: (page: "Dashboard" | "Explorer" | "Voyager" | "Attacks" | "History") => void;
}>();

const scanUrl = ref("");
const isScanning = ref(false);
const recentSessions = ref<any[]>([]);

const handleScan = async () => {
  if (!scanUrl.value.trim()) {
    sdk.window.showToast("Please enter a GraphQL endpoint URL", { variant: "warning" });
    return;
  }

  // Validate URL format
  try {
    const url = new URL(scanUrl.value.trim());
    if (!['http:', 'https:'].includes(url.protocol)) {
      sdk.window.showToast("Invalid URL: Only HTTP and HTTPS protocols are supported", { variant: "error" });
      return;
    }
  } catch (error) {
    sdk.window.showToast("Invalid URL format. Please enter a valid URL (e.g., https://example.com/graphql)", { variant: "error" });
    return;
  }

  isScanning.value = true;

  try {
    const result: Result<{ supportsIntrospection: boolean; schema?: any }> = 
      await sdk.backend.testGraphQLEndpoint(scanUrl.value.trim());

    if (result.kind === "Error") {
      sdk.window.showToast(`Scan failed: ${result.error}`, { variant: "error" });
    } else {
      // Store the scan result for Explorer to pick up
      const sessionData = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        title: getDomainName(scanUrl.value.trim()),
        url: scanUrl.value.trim(),
        schema: result.value.schema,
        supportsIntrospection: result.value.supportsIntrospection,
        createdAt: new Date(),
        status: result.value.supportsIntrospection ? "success" : "warning"
      };

      // Store session in Explorer storage
      const currentStorage = sdk.storage.get() as any || {};
      
      // Initialize Explorer sessions if not present
      if (!currentStorage.explorerSessions || !Array.isArray(currentStorage.explorerSessions)) {
        currentStorage.explorerSessions = [];
      }
      
      // Add to Explorer sessions
      currentStorage.explorerSessions.push(sessionData);
      currentStorage.selectedExplorerSessionId = sessionData.id;
      
      // Add to Dashboard activities
      if (!currentStorage.dashboardActivities || !Array.isArray(currentStorage.dashboardActivities)) {
        currentStorage.dashboardActivities = [];
      }
      
      const activityData = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        title: `Schema scan: ${sessionData.title}`,
        url: sessionData.url,
        description: result.value.supportsIntrospection ? "Successfully scanned GraphQL schema" : "Endpoint found but no introspection support",
        createdAt: sessionData.createdAt,
        status: sessionData.status,
        type: "scan"
      };
      
      currentStorage.dashboardActivities.unshift(activityData);
      
      // Keep only recent 20 activities
      if (currentStorage.dashboardActivities.length > 20) {
        currentStorage.dashboardActivities = currentStorage.dashboardActivities.slice(0, 20);
      }
      
      await sdk.storage.set(currentStorage);
      await loadRecentSessions();

      if (!result.value.supportsIntrospection) {
        sdk.window.showToast("Endpoint does not support introspection", { variant: "warning" });
      } else {
        sdk.window.showToast("Schema scanned successfully!", { variant: "success" });
      }

      scanUrl.value = "";

      setTimeout(() => {
        if (props.navigateTo) {
          props.navigateTo("Explorer");
        }
      }, 800);
    }
  } catch (err) {
    sdk.window.showToast("Scan failed. Please check the URL and try again.", { variant: "error" });
  } finally {
    isScanning.value = false;
  }
};

const getDomainName = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return "Unknown";
  }
};

const loadRecentSessions = async () => {
  try {
    const stored = sdk.storage.get() as { dashboardActivities?: any[] } | null;
    if (stored?.dashboardActivities && Array.isArray(stored.dashboardActivities)) {
      recentSessions.value = stored.dashboardActivities
        .map(s => ({
          ...s,
          createdAt: new Date(s.createdAt)
        }))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } else {
      recentSessions.value = [];
    }
  } catch (error) {
    recentSessions.value = [];
  }
};

const selectSession = (session: any) => {
  if (session.type === "attack") {
    // Navigate to attacks page with specific attack session
    if (props.navigateTo) {
      // Store attack session ID for navigation
      localStorage.setItem('graphql-analyzer-navigate-to-attack', session.attackSessionId || '');
      props.navigateTo("Attacks");
    }
    return;
  }
  
  // Navigate to explorer for scan sessions
  if (props.navigateTo) {
    props.navigateTo("Explorer");
  }
};

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

const deleteAttackActivity = async (sessionId: string) => {
  try {
    const stored = sdk.storage.get() as any || {};
    if (stored.dashboardActivities) {
      // Find the attack activity to get the attackSessionId
      const attackActivity = stored.dashboardActivities.find((s: any) => s.id === sessionId);
      
      // Remove the attack activity from dashboard activities
      stored.dashboardActivities = stored.dashboardActivities.filter((s: any) => s.id !== sessionId);
      
      // Find and remove the corresponding attack session if it exists
      if (stored.attackSessions && attackActivity?.attackSessionId) {
        stored.attackSessions = stored.attackSessions.filter((s: any) => s.id !== attackActivity.attackSessionId);
      }
      
      await sdk.storage.set(stored);
      
      // Update the UI
      loadRecentSessions();
      
      sdk.window.showToast("Attack activity deleted", { variant: "success" });
    }
  } catch (error) {
    sdk.window.showToast("Failed to delete attack activity", { variant: "error" });
  }
};

const deleteAllData = async () => {
  try {
    // Clear all storage data
    await sdk.storage.set({});
    
    // Clear UI state
    recentSessions.value = [];
    
    sdk.window.showToast("All sessions and data deleted successfully", { variant: "success" });
  } catch (error) {
    sdk.window.showToast("Failed to delete all data", { variant: "error" });
  }
};

const handleContextScan = (event: CustomEvent) => {
  const url = event.detail.url;
  if (url) {
    scanUrl.value = url;
    handleScan();
  }
};

onMounted(() => {
  window.addEventListener('graphql-analyzer-context-scan', handleContextScan as EventListener);
  loadRecentSessions();
  
  const pendingUrl = localStorage.getItem('graphql-analyzer-context-scan-url');
  if (pendingUrl) {
    localStorage.removeItem('graphql-analyzer-context-scan-url');
    scanUrl.value = pendingUrl;
    handleScan();
  }
});

onUnmounted(() => {
  window.removeEventListener('graphql-analyzer-context-scan', handleContextScan as EventListener);
});
</script>

<script lang="ts">
export default {
  name: "Dashboard",
};
</script>

<template>
  <div class="flex flex-col h-full gap-1 overflow-hidden">
    <!-- Header - Match Explorer style -->
    <Card class="h-fit" :pt="{ body: { class: 'h-fit p-0' }, content: { class: 'h-fit flex flex-col' } }">
      <template #content>
        <div class="flex justify-between items-center p-4">
          <div>
            <h3 class="text-lg font-semibold">GraphQL Schema Scanner</h3>
            <p class="text-sm text-surface-300">
              Discover and analyze GraphQL endpoints to identify schema information and security insights.
            </p>
          </div>
        </div>
      </template>
    </Card>

     <!-- Main Content - 3 Card Layout -->
     <div class="flex gap-2 flex-1 min-h-0">
      <!-- Left Column - Contains top and bottom cards -->
      <div class="flex-1 flex flex-col gap-2">
        <!-- Scan Card - Top Left (50% width, 50% height) -->
        <Card 
          class="flex-1"
          :pt="{ body: { class: 'h-full p-0' }, content: { class: 'h-full flex flex-col' } }"
        >
          <template #content>
            <div class="p-6 h-full flex flex-col">
              <div class="mb-6">
                <h3 class="text-xl font-bold mb-3">Scan GraphQL Endpoint</h3>
                <p class="text-base text-surface-300">
                  Enter a GraphQL endpoint URL to perform introspection and discover the schema structure.
                </p>
              </div>

              <div class="flex-1 flex flex-col justify-center space-y-4">
                <div>
                  <label for="scan-url" class="block text-base font-semibold mb-3">
                    GraphQL Endpoint URL
                  </label>
                  <InputText
                    id="scan-url"
                    v-model="scanUrl"
                    placeholder="https://example.com/graphql"
                    class="w-full text-base p-3"
                    size="large"
                    :disabled="isScanning"
                    @keyup.enter="handleScan"
                  />
                </div>
                <div class="flex justify-center">
                  <Button
                    label="Scan"
                    icon="fas fa-search"
                    size="large"
                    class="px-16 py-3 min-w-48"
                    :loading="isScanning"
                    @click="handleScan"
                  />
                </div>
              </div>
            </div>
          </template>
        </Card>

        <!-- HTTP Requests Card - Bottom Left (50% width, 50% height) -->
        <Card 
          class="flex-1"
          :pt="{ body: { class: 'h-full p-0' }, content: { class: 'h-full flex flex-col' } }"
        >
          <template #content>
            <div class="p-4 h-full flex flex-col items-center justify-center text-center">
              <div class="flex items-center justify-center w-16 h-16">
                <i class="fas fa-exchange-alt text-white text-2xl"></i>
              </div>
              <div class="mb-4">
                <h3 class="text-lg font-semibold mb-2">Scan From HTTP History</h3>
                <p class="text-sm text-surface-400 max-w-sm">
                  Right-click any GraphQL request in HTTP History and select "Send to GraphQL Analyzer" to scan it directly.
                </p>
              </div>

            </div>
          </template>
        </Card>
      </div>

      <!-- Recent Activity Card - Right (50% width, 100% height) -->
      <Card 
        class="flex-1 h-full"
        :pt="{ body: { class: 'h-full p-0' }, content: { class: 'h-full flex flex-col' } }"
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
                  @click="deleteAllData"
                  title="Delete all sessions and activities"
                />
              </div>
              <p class="text-sm text-surface-400">
                Your recently scanned GraphQL endpoints and analysis results.
              </p>
            </div>
            
            <div v-if="recentSessions.length > 0" class="flex-1 overflow-auto space-y-3">
              <div 
                v-for="session in recentSessions" 
                :key="session.id"
                :class="[
                  'border rounded-lg transition-all duration-200 shadow-sm',
                  session.type === 'attack' 
                    ? 'border-red-600 bg-red-900/20 cursor-default' 
                    : 'border-surface-600 bg-surface-800 hover:bg-surface-700 hover:border-surface-500 cursor-pointer'
                ]"
                @click="selectSession(session)"
              >
                <div class="p-3">
                  <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2 flex-1 min-w-0">
                      <div class="font-semibold text-surface-100 truncate">{{ session.title }}</div>
                      <div class="text-xs text-surface-500">{{ formatDate(session.createdAt) }}</div>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                      <div 
                        :class="{
                          'text-red-400': session.type === 'attack' || session.status === 'error',
                          'text-green-400': session.status === 'success',
                          'text-yellow-400': session.status === 'warning'
                        }"
                      >
                        <i 
                          class="text-sm"
                          :class="{
                            'fas fa-shield-alt': session.type === 'attack',
                            'fas fa-check-circle': session.status === 'success',
                            'fas fa-exclamation-triangle': session.status === 'warning',
                            'fas fa-times-circle': session.status === 'error'
                          }"
                        ></i>
                      </div>

                    </div>
                  </div>
                  <div class="text-sm text-surface-400 truncate">
                    {{ session.type === 'attack' ? session.description : session.url }}
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="flex-1 flex items-center justify-center">
              <div class="text-center text-surface-500">
                <i class="fas fa-clock text-3xl mb-3"></i>
                <div>No recent scans. Start by scanning a GraphQL endpoint above.</div>
              </div>
            </div>
          </div>
        </template>
      </Card>
    </div>
  </div>


</template>