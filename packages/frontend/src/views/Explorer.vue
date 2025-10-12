<script setup lang="ts">
import Button from "primevue/button";
import Card from "primevue/card";
import Splitter from "primevue/splitter";
import SplitterPanel from "primevue/splitterpanel";
import Tree from "primevue/tree";
import { computed, onMounted, ref } from "vue";

import { SessionTab } from "../components/dashboard";
import { CodeEditor } from "../components/common";
import { useSDK } from "../plugins/sdk";
import type { GraphQLSchema } from "backend";

const sdk = useSDK();

// Props for navigation (for consistency with other views)
const props = defineProps<{
  navigateTo?: (page: "Dashboard" | "Explorer" | "Voyager" | "Attacks" | "History") => void;
}>();

// Using correct Caido storage API (no storage keys needed)

// State
const sessions = ref<Array<{
  id: string;
  title: string;
  url: string;
  schema?: GraphQLSchema;
  supportsIntrospection: boolean;
  createdAt: Date;
  status: string;
}>>([]);
const selectedSessionId = ref<string | null>(null);
const selectedCode = ref("");
const selectedType = ref("");
const selectedLanguage = ref<'json' | 'javascript' | 'graphql'>('json');
const selectedNode = ref<any>(null);
const expandedKeys = ref<Record<string, boolean>>({});

// Computed
const selectedSession = computed(() => {
  return sessions.value.find(s => s.id === selectedSessionId.value);
});

// Storage functions using CORRECT Caido storage API
const saveAllData = async () => {
  try {
    const currentStorage = sdk.storage.get() as any || {};
    currentStorage.explorerSessions = sessions.value;
    currentStorage.selectedExplorerSessionId = selectedSessionId.value;
    await sdk.storage.set(currentStorage);
  } catch (error) {
    sdk.window.showToast("Failed to save session data", { variant: "error" });
  }
};

const loadSessions = async () => {
  try {
    const stored = sdk.storage.get() as { explorerSessions?: any[], selectedExplorerSessionId?: string } | null;
    
    if (stored?.explorerSessions && Array.isArray(stored.explorerSessions)) {
      sessions.value = stored.explorerSessions.map((s: any) => ({
        ...s,
        createdAt: new Date(s.createdAt)
      }));
    } else {
      sessions.value = [];
    }
    
    if (stored?.selectedExplorerSessionId && sessions.value.find(s => s.id === stored?.selectedExplorerSessionId)) {
      selectedSessionId.value = stored.selectedExplorerSessionId;
    } else if (sessions.value.length > 0) {
      selectedSessionId.value = sessions.value[0]?.id || null;
    } else {
      selectedSessionId.value = null;
    }
    
  } catch (error) {
    sessions.value = [];
    selectedSessionId.value = null;
  }
};

// Session management
const selectSession = async (sessionId: string) => {
  selectedSessionId.value = sessionId;
  selectedCode.value = "";
  selectedType.value = "";
  selectedLanguage.value = 'json';
  selectedNode.value = null;
  expandedKeys.value = {}; // Reset tree expansion state
  await saveAllData();
};

const deleteSession = async (sessionId: string) => {
  const index = sessions.value.findIndex(s => s.id === sessionId);
  if (index !== -1) {
    sessions.value.splice(index, 1);
    if (selectedSessionId.value === sessionId) {
      selectedSessionId.value = sessions.value.length > 0 ? sessions.value[0].id : null;
    }
    await saveAllData();
  }
};

const renameSession = async (sessionId: string, newTitle: string) => {
  const session = sessions.value.find(s => s.id === sessionId);
  if (session) {
    session.title = newTitle;
    await saveAllData();
  }
};

// Clear all data function
const clearAllData = async () => {
  sessions.value = [];
  selectedSessionId.value = null;
  selectedCode.value = "";
  selectedType.value = "";
  selectedNode.value = null;
  expandedKeys.value = {};
  
  // Clear storage
  try {
    const currentStorage = sdk.storage.get() as any || {};
    currentStorage.explorerSessions = [];
    currentStorage.selectedExplorerSessionId = null;
    await sdk.storage.set(currentStorage);
    sdk.window.showToast("All sessions and data cleared successfully", { variant: "success" });
  } catch (error) {
    sdk.window.showToast("Failed to clear data", { variant: "error" });
  }
};

// Tree data with enhanced schema information
const getTreeData = () => {
  if (!selectedSession.value?.schema) return [];

  const schema = selectedSession.value.schema;
  // Extract domain from URL for tree display (don't use session title)
  const urlDomain = selectedSession.value.url ? new URL(selectedSession.value.url).hostname : 'Unknown';

  const baseTree = [
    {
      key: 'graphql',
      label: `GraphQL (${urlDomain})`,
      icon: 'fas fa-project-diagram',
      children: [
        {
          key: 'queries',
          label: `Queries (${schema.queries.length})`,
          icon: 'fas fa-search',
          children: schema.queries.map(query => ({
            key: `query-${query.name}`,
            label: query.name,
            icon: 'fas fa-code',
            data: { type: 'query', content: query }
          }))
        },
        {
          key: 'mutations',
          label: `Mutations (${schema.mutations.length})`,
          icon: 'fas fa-edit',
          children: schema.mutations.map(mutation => ({
            key: `mutation-${mutation.name}`,
            label: mutation.name,
            icon: 'fas fa-code',
            data: { type: 'mutation', content: mutation }
          }))
        },
        {
          key: 'subscriptions',
          label: `Subscriptions (${schema.subscriptions.length})`,
          icon: 'fas fa-broadcast-tower',
          children: schema.subscriptions.map(subscription => ({
            key: `subscription-${subscription.name}`,
            label: subscription.name,
            icon: 'fas fa-code',
            data: { type: 'subscription', content: subscription }
          }))
        }
      ]
    }
  ];

  // Add Points of Interest if available
  if (schema.pointsOfInterest && schema.pointsOfInterest.length > 0 && baseTree[0]?.children) {
    (baseTree[0].children as any).push({
      key: 'points-of-interest',
      label: `Points of Interest (${schema.pointsOfInterest.length})`,
      icon: 'fas fa-exclamation-triangle',
      children: schema.pointsOfInterest.map((poi, index) => ({
        key: `poi-${index}`,
        label: poi.name,
        icon: poi.severity === 'high' ? 'fas fa-exclamation-circle' : 
              poi.severity === 'medium' ? 'fas fa-exclamation-triangle' : 'fas fa-info-circle',
        data: { type: 'point-of-interest', content: poi }
      }))
    });
  }

  // Add Object Types
  if (schema.types && schema.types.length > 0 && baseTree[0]?.children) {
    (baseTree[0].children as any).push({
      key: 'types',
      label: `Object Types (${schema.types.length})`,
      icon: 'fas fa-cube',
      children: schema.types.map(type => ({
        key: `type-${type.name}`,
        label: type.name,
        icon: 'fas fa-code',
        data: { type: 'object-type', content: type }
      }))
    });
  }

  // Add Enums
  if (schema.enums && schema.enums.length > 0 && baseTree[0]?.children) {
    (baseTree[0].children as any).push({
      key: 'enums',
      label: `Enums (${schema.enums.length})`,
      icon: 'fas fa-list',
      children: schema.enums.map(enumType => ({
        key: `enum-${enumType.name}`,
        label: enumType.name,
        icon: 'fas fa-code',
        data: { type: 'enum', content: enumType }
      }))
    });
  }

  // Add flat items to the main GraphQL node
  if (baseTree[0]?.children) {
    (baseTree[0].children as any).push(
      {
        key: 'json-schema',
        label: 'JSON Schema',
        icon: 'fas fa-file-code',
        data: { type: 'json-schema', content: schema }
      },
      {
        key: 'request-template',
        label: 'Request Template',
        icon: 'fas fa-file-alt',
        data: { type: 'request-template', content: { url: selectedSession.value?.url || '', schema } }
      }
    );
  }

  return baseTree;
};

// Copy to clipboard function
const copyToClipboard = async () => {
  if (selectedCode.value) {
    try {
      await navigator.clipboard.writeText(selectedCode.value);
      sdk.window.showToast("Code copied to clipboard!", { variant: "success" });
    } catch (error) {
      sdk.window.showToast("Failed to copy to clipboard", { variant: "error" });
    }
  }
};

const openInVoyager = () => {
  if (props.navigateTo && selectedSession.value) {
    localStorage.setItem('voyager-auto-select-session', selectedSession.value.id);
    props.navigateTo("Voyager");
  }
};

const sendToAttacker = () => {
  if (!selectedSession.value) return;
  
  const protocol = selectedSession.value.url.startsWith('https') ? 'https' : 'http';
  const url = new URL(selectedSession.value.url);
  
  const requestData = {
    id: Date.now().toString(),
    host: url.hostname,
    port: url.port ? parseInt(url.port) : (protocol === 'https' ? 443 : 80),
    path: url.pathname || '/',
    query: '',
    headers: {},
    raw: ''
  };
  
  localStorage.setItem('graphql-analyzer-context-attack-request', JSON.stringify(requestData));
  
  if (props.navigateTo) {
    props.navigateTo("Attacks");
  }
};

// Handle tree node selection
const onNodeSelect = async (node: any) => {
  selectedNode.value = node;
  if (node.data) {
    selectedType.value = node.data.type;
    
    switch (node.data.type) {
      case 'query':
        selectedCode.value = await formatGraphQLField(node.data.content, 'query');
        selectedLanguage.value = 'graphql'; // Show as GraphQL for proper syntax highlighting
        break;
      case 'mutation':
        selectedCode.value = await formatGraphQLField(node.data.content, 'mutation');
        selectedLanguage.value = 'graphql'; // Show as GraphQL for proper syntax highlighting
        break;
      case 'subscription':
        selectedCode.value = await formatGraphQLField(node.data.content, 'subscription');
        selectedLanguage.value = 'graphql'; // Show as GraphQL for proper syntax highlighting
        break;
      case 'object-type':
        selectedCode.value = formatObjectType(node.data.content);
        selectedLanguage.value = 'json'; // Show as JSON for proper formatting and search
        break;
      case 'enum':
        selectedCode.value = formatEnum(node.data.content);
        selectedLanguage.value = 'json'; // Show as JSON for proper formatting and search
        break;
      case 'point-of-interest':
        selectedCode.value = formatPointOfInterest(node.data.content);
        selectedLanguage.value = 'json';
        break;
      case 'json-schema':
        // Show raw introspection data
        const rawData = (node.data.content as any).rawIntrospection || node.data.content;
        selectedCode.value = JSON.stringify(rawData, null, 2);
        selectedLanguage.value = 'json';
        break;
      case 'request-template':
        selectedCode.value = generateRequestTemplate(node.data.content);
        selectedLanguage.value = 'graphql'; // HTTP-like syntax highlighting
        break;
    }
  }
};

// Generate proper GraphQL query
const formatGraphQLField = async (field: any, type: 'query' | 'mutation' | 'subscription'): Promise<string> => {
  if (!selectedSession.value?.schema?.allTypes) {
    // Fallback to raw data if we don't have allTypes
    const dataToShow = field.rawIntrospectionData || field;
    return JSON.stringify(dataToShow, null, 2);
  }

  try {
    // Use the backend to generate proper GraphQL query
    const generatedQuery = await sdk.backend.generateGraphQLQuery(
      field,
      type,
      selectedSession.value.schema.allTypes,
      200 // maxDepth - NO TRUNCATION!
    );
    return generatedQuery;
  } catch (error) {
    // Fallback to raw data on error
    // Silently handle error to avoid console noise
    const dataToShow = field.rawIntrospectionData || field;
    return JSON.stringify(dataToShow, null, 2);
  }
};

const formatObjectType = (type: any): string => {
  // Use the raw introspection data if available, otherwise the processed data
  const dataToShow = type.rawIntrospectionData || type;
  return JSON.stringify(dataToShow, null, 2);
};

const formatEnum = (enumType: any): string => {
  // Use the raw introspection data if available, otherwise the processed data
  const dataToShow = enumType.rawIntrospectionData || enumType;
  return JSON.stringify(dataToShow, null, 2);
};

const formatPointOfInterest = (poi: any): string => {
  // Show RAW POI data - no filtering or placeholders
  return JSON.stringify(poi, null, 2);
};

const generateRequestTemplate = (content: any): string => {
  const url = content.url || '';
  let hostname = '';
  let path = '/graphql';
  
  try {
    const urlObj = new URL(url);
    hostname = urlObj.hostname;
    path = urlObj.pathname || '/graphql';
  } catch {
    hostname = 'example.com';
  }
  
  return `POST ${path} HTTP/1.1
Host: ${hostname}
Accept-Encoding: gzip, deflate, br
Accept: */*
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36
Connection: close
Cache-Control: max-age=0
Content-Type: application/json

{
  "query": "query { __typename }",
  "variables": {}
}`;
};

// Initialize and refresh on mount
onMounted(() => {
  loadSessions();
});
</script>

<script lang="ts">
export default {
  name: "Explorer",
};
</script>

<template>
  <div class="flex flex-col h-full gap-1 overflow-hidden">
    <!-- Header -->
    <Card class="h-fit" :pt="{ body: { class: 'h-fit p-0' }, content: { class: 'h-fit flex flex-col' } }">
      <template #content>
        <div class="flex justify-between items-center p-4">
          <div>
            <h3 class="text-lg font-semibold">Schema Explorer</h3>
            <p class="text-sm text-surface-300">
              Browse and analyze GraphQL schema information and security insights.
            </p>
          </div>
          <div>
            <Button
              icon="fas fa-trash"
              severity="danger"
              text
              size="small"
              @click="clearAllData"
              v-tooltip="'Clear all sessions and data'"
            />
          </div>
        </div>
      </template>
    </Card>

    <!-- Session Tabs -->
    <Card 
      v-if="sessions.length > 0" 
      class="h-fit"
      :pt="{ body: { class: 'h-fit p-0' }, content: { class: 'h-fit flex flex-col' } }"
    >
      <template #content>
        <div class="flex gap-2 p-4 flex-wrap">
          <SessionTab
            v-for="session in sessions"
            :key="session.id"
            :is-selected="selectedSessionId === session.id"
            :label="session.title"
            :status="session.status"
            @select="selectSession(session.id)"
            @rename="(newName) => renameSession(session.id, newName)"
            @delete="deleteSession(session.id)"
          />
        </div>
      </template>
    </Card>

    <!-- Session Content -->
    <div v-if="selectedSession" class="flex-1 min-h-0">
      <Card 
        class="h-full"
        :pt="{ body: { class: 'h-full p-0' }, content: { class: 'h-full flex flex-col' } }"
      >
        <template #content>
          <div class="h-full p-2">
            <Splitter class="h-full">
              <SplitterPanel :size="40" :min-size="20">
                <div class="h-full overflow-auto pr-2">
                  <Tree
                    v-if="selectedSession.supportsIntrospection && selectedSession.schema"
                    :value="getTreeData()"
                    selection-mode="single"
                    :selection-keys="selectedNode ? { [selectedNode.key]: true } : {}"
                    :expanded-keys="expandedKeys"
                    class="w-full"
                    @node-select="onNodeSelect"
                    @node-expand="(node) => expandedKeys[node.key] = true"
                    @node-collapse="(node) => expandedKeys[node.key] = false"
                  />
                  <div v-else class="text-center text-surface-500 py-8">
                    <i class="fas fa-exclamation-triangle text-3xl mb-3"></i>
                    <div>No introspection support</div>
                  </div>
                </div>
              </SplitterPanel>
              
              <SplitterPanel :size="60" :min-size="30">
                <div class="h-full overflow-hidden pl-2 flex flex-col">
                  <div v-if="selectedCode" class="h-full flex flex-col">
                    <div class="flex justify-between items-center mb-3 pt-2">
                      <div class="text-sm font-medium capitalize text-surface-200">{{ selectedType.replace('-', ' ') }}</div>
                      <div class="flex gap-2">
                        <Button 
                          icon="fas fa-shield-alt" 
                          size="small" 
                          text 
                          severity="danger"
                          @click="sendToAttacker"
                          v-tooltip="'Send to Attacker'"
                          class="text-xs"
                        />
                        <Button 
                          icon="fas fa-project-diagram" 
                          size="small" 
                          text 
                          severity="secondary"
                          @click="openInVoyager"
                          v-tooltip="'View in Voyager'"
                          class="text-xs"
                        />
                        <Button 
                          icon="fas fa-copy" 
                          size="small" 
                          text 
                          severity="secondary"
                          @click="copyToClipboard"
                          v-tooltip="'Copy to clipboard'"
                          class="text-xs"
                        />
                      </div>
                    </div>
                    <div class="flex-1 min-h-0">
                      <CodeEditor
                        :content="selectedCode"
                        :language="selectedLanguage"
                        :read-only="true"
                      />
                    </div>
                  </div>
                  <div v-else class="text-center text-surface-500 py-8">
                    <i class="fas fa-mouse-pointer text-3xl mb-3"></i>
                    <div>Select an item from the tree to view details</div>
                  </div>
                </div>
              </SplitterPanel>
            </Splitter>
          </div>
        </template>
      </Card>
    </div>

    <!-- Empty State -->
    <div v-else class="flex-1 flex items-center justify-center">
      <div class="text-center text-surface-500">
        <i class="fas fa-search text-4xl mb-4"></i>
        <div class="text-lg mb-2">No GraphQL sessions found</div>
        <div>Go to the <strong>Dashboard</strong> tab to scan a GraphQL endpoint</div>
      </div>
    </div>
  </div>
</template>