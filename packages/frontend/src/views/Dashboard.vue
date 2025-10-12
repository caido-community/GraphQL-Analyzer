<script setup lang="ts">
import Button from "primevue/button";
import Card from "primevue/card";
import InputText from "primevue/inputtext";
import { onMounted, onUnmounted, ref, computed } from "vue";

import { useSDK } from "../plugins/sdk";
import type { Result } from "backend";

const sdk = useSDK();

const props = defineProps<{
  navigateTo?: (page: "Dashboard" | "Explorer" | "Voyager" | "Attacks" | "History") => void;
}>();

const scanUrl = ref("");
const isScanning = ref(false);
const recentSessions = ref<any[]>([]);

// Custom headers for scanning
const customHeaders = ref<Array<{ name: string; value: string }>>([]);

// Add custom header
const addCustomHeader = () => {
  if (customHeaders.value.length < 20) {
    customHeaders.value.push({ name: "", value: "" });
  }
};

// Remove custom header
const removeCustomHeader = (index: number) => {
  customHeaders.value.splice(index, 1);
};

// Build headers object from custom headers
const parsedHeaders = computed(() => {
  const headers: Record<string, string> = {};
  customHeaders.value.forEach(header => {
    if (header.name.trim() && header.value.trim()) {
      headers[header.name.trim()] = header.value.trim();
    }
  });
  return headers;
});

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
    // Ensure we only send valid headers (no null/undefined values)
    const validHeaders: Record<string, string> = {};
    Object.entries(parsedHeaders.value).forEach(([key, value]) => {
      if (key && value && typeof value === 'string') {
        validHeaders[key] = value;
      }
    });
    
    // Always pass an object, never undefined (undefined becomes null in RPC serialization)
    const headersToSend = Object.keys(validHeaders).length > 0 ? validHeaders : {};
    
    const result: Result<{ supportsIntrospection: boolean; schema?: any }> = 
      await sdk.backend.testGraphQLEndpoint(scanUrl.value.trim(), headersToSend);

    if (result.kind === "Error") {
      sdk.window.showToast(`Scan failed: ${result.error}`, { variant: "error" });
    } else {
      const currentStorage: any = sdk.storage.get() || {};
      
      // Initialize Dashboard activities if not present
      if (!currentStorage.dashboardActivities || !Array.isArray(currentStorage.dashboardActivities)) {
        currentStorage.dashboardActivities = [];
      }

      if (result.value.supportsIntrospection && result.value.schema) {
        // Only create Explorer session if introspection is successful
        const sessionData = {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2),
          title: getDomainName(scanUrl.value.trim()),
          url: scanUrl.value.trim(),
          schema: result.value.schema,
          supportsIntrospection: true,
          createdAt: new Date(),
          status: "success"
        };

        // Initialize Explorer sessions if not present
        if (!currentStorage.explorerSessions || !Array.isArray(currentStorage.explorerSessions)) {
          currentStorage.explorerSessions = [];
        }
        
        // Add to Explorer sessions
        currentStorage.explorerSessions.push(sessionData);
        currentStorage.selectedExplorerSessionId = sessionData.id;
        
        // Add success activity to Dashboard
        const activityData = {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2),
          title: `Schema scan: ${sessionData.title}`,
          url: sessionData.url,
          description: "Successfully scanned GraphQL schema",
          createdAt: sessionData.createdAt,
          status: "success",
          type: "scan"
        };
        
        currentStorage.dashboardActivities.unshift(activityData);
        
        // Keep only recent 20 activities
        if (currentStorage.dashboardActivities.length > 20) {
          currentStorage.dashboardActivities = currentStorage.dashboardActivities.slice(0, 20);
        }
        
        // @ts-ignore - Storage type is overly strict
        await sdk.storage.set(currentStorage);
        await loadRecentSessions();

        sdk.window.showToast("Schema scanned successfully!", { variant: "success" });
        scanUrl.value = "";
        customHeaders.value = [];

        setTimeout(() => {
          if (props.navigateTo) {
            props.navigateTo("Explorer");
          }
        }, 800);
      } else { 
        // Introspection not supported - add warning activity but don't create Explorer session
        const activityData: any = {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2),
          title: `Scan attempted: ${getDomainName(scanUrl.value.trim())}`,
          url: scanUrl.value.trim(),
          description: "GraphQL endpoint found but introspection is disabled",
          createdAt: new Date(),
          status: "warning",
          type: "scan"
        };
        
        currentStorage.dashboardActivities.unshift(activityData);
        
        // Keep only recent 20 activities
        if (currentStorage.dashboardActivities.length > 20) {
          currentStorage.dashboardActivities = currentStorage.dashboardActivities.slice(0, 20);
        }
        
        // @ts-ignore - Storage type is overly strict
        await sdk.storage.set(currentStorage);
        await loadRecentSessions();

        sdk.window.showToast("GraphQL endpoint detected, but introspection is disabled. Cannot explore schema.", { variant: "warning" });
        scanUrl.value = "";
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    sdk.window.showToast(`Scan failed: ${errorMsg}. Please check the URL and try again.`, { variant: "error" });
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

const deleteAllData = async () => {
  try {
    // Clear all storage data
    const emptyStorage: any = {};
    // @ts-ignore - Storage type is overly strict
    await sdk.storage.set(emptyStorage);
    
    // Clear UI state
    recentSessions.value = [];
    
    sdk.window.showToast("All sessions and data deleted successfully", { variant: "success" });
  } catch (error) {
    sdk.window.showToast("Failed to delete all data", { variant: "error" });
  }
};

const handleContextScan = (event: CustomEvent) => {
  const url = event.detail.url;
  const headers = event.detail.headers;
  
  if (url) {
    scanUrl.value = url;
    
    // Populate custom headers from HTTP History request
    if (headers && Object.keys(headers).length > 0) {
      customHeaders.value = [];
      Object.entries(headers).forEach(([key, value]) => {
        if (key.toLowerCase() !== 'content-length' && key && value) {
          customHeaders.value.push({ name: key, value: value as string });
        }
      });
    }
    
    handleScan();
  }
};

onMounted(() => {
  window.addEventListener('graphql-analyzer-context-scan', handleContextScan as EventListener);
  loadRecentSessions();
  
  const pendingUrl = localStorage.getItem('graphql-analyzer-context-scan-url');
  const pendingHeaders = localStorage.getItem('graphql-analyzer-context-scan-headers');
  const scanProcessed = sessionStorage.getItem('graphql-analyzer-scan-processed');
  
  if (pendingUrl && !scanProcessed) {
    scanUrl.value = pendingUrl;
    
    if (pendingHeaders) {
      try {
        const headers = JSON.parse(pendingHeaders);
        if (Object.keys(headers).length > 0) {
          customHeaders.value = [];
          Object.entries(headers).forEach(([key, value]) => {
            if (key.toLowerCase() !== 'content-length' && key && value) {
              customHeaders.value.push({ name: key, value: value as string });
            }
          });
        }
      } catch {
      }
    }
    
    localStorage.removeItem('graphql-analyzer-context-scan-url');
    localStorage.removeItem('graphql-analyzer-context-scan-headers');
    sessionStorage.setItem('graphql-analyzer-scan-processed', 'true');
    
    setTimeout(() => handleScan(), 100);
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
              <div class="mb-6 flex items-start justify-between">
                <div class="flex-1">
                  <h3 class="text-xl font-bold mb-3">Scan GraphQL Endpoint</h3>
                  <p class="text-base text-surface-300">
                    Enter a GraphQL endpoint URL to perform introspection and discover the schema structure.
                  </p>
                </div>
                <Button
                  icon="fas fa-eraser"
                  severity="secondary"
                  text
                  size="small"
                  @click="() => { scanUrl = ''; customHeaders = []; }"
                  v-tooltip="'Clear all fields'"
                  class="ml-2"
                />
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

        <!-- Custom Headers Card - Bottom Left (50% width, 50% height) -->
        <Card 
          class="flex-1 min-h-0"
          :pt="{ body: { class: 'h-full p-0' }, content: { class: 'h-full flex flex-col' } }"
        >
          <template #content>
            <div class="p-4 h-full flex flex-col" style="max-height: 100%;">
              <div class="mb-3 flex-shrink-0">
                <div class="flex items-center justify-between mb-2">
                  <div>
                    <h3 class="text-lg font-semibold">Custom Headers</h3>
                    <p class="text-sm text-surface-400">Add custom headers for authenticated scanning</p>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-surface-500 px-2 py-1 bg-surface-700 rounded">
                      <i class="fas fa-key mr-1"></i>
                      {{ Object.keys(parsedHeaders).length }} headers
                    </span>
                    <Button
                      :disabled="customHeaders.length >= 20"
                      icon="fas fa-plus"
                      size="small"
                      severity="secondary"
                      @click="addCustomHeader"
                      v-tooltip="customHeaders.length >= 20 ? 'Maximum 20 headers allowed' : 'Add custom header'"
                    />
                  </div>
                </div>
              </div>
              
              <div class="flex-1 overflow-y-auto overflow-x-hidden pr-2" style="min-height: 0;">
                <div v-if="customHeaders.length === 0" class="text-center text-surface-500 py-8">
                  <i class="fas fa-plus-circle text-3xl mb-3"></i>
                  <div class="text-sm">No custom headers added</div>
                  <div class="text-xs mt-1">Click + to add Authorization, Cookie, or other headers</div>
                </div>
                
                <div v-else class="space-y-2 pb-2">
                  <div 
                    v-for="(header, index) in customHeaders" 
                    :key="index"
                    class="flex items-center gap-2"
                  >
                    <InputText
                      v-model="header.name"
                      placeholder="Header name (e.g. Authorization)"
                      class="flex-1"
                      size="small"
                    />
                    <InputText
                      v-model="header.value"
                      placeholder="Header value"
                      class="flex-1"
                      size="small"
                    />
                    <Button
                      icon="fas fa-times"
                      size="small"
                      text
                      severity="danger"
                      @click="removeCustomHeader(index)"
                      v-tooltip="'Remove header'"
                    />
                  </div>
                </div>
              </div>
              
              <div class="mt-3 text-xs text-surface-500 flex-shrink-0 border-t border-surface-600 pt-3">
                <i class="fas fa-info-circle mr-1"></i>
                Headers are automatically included when scanning from HTTP History
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