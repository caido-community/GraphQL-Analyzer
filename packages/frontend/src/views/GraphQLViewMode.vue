<script setup lang="ts">
import { type API, type RequestFull } from "@caido/sdk-frontend";
import { computed, ref, onMounted } from "vue";
import Button from "primevue/button";
import TabView from "primevue/tabview";
import TabPanel from "primevue/tabpanel";
import CodeEditor from "../components/common/CodeEditor.vue";

const props = defineProps<{
  sdk: API;
  request: RequestFull;
}>();

// Reactive state for viewing GraphQL data
const editableQuery = ref('');
const editableVariables = ref('{}');
const queryValidationErrors = ref<string[]>([]);
const activeTab = ref(0);

// Parse HTTP raw data
const parseHttpRaw = (raw: string) => {
  if (!raw) return null;
  
  // Split by double CRLF to separate headers from body
  const parts = raw.split('\r\n\r\n');
  if (parts.length < 2) return null;
  
  const headerSection = parts[0];
  const body = parts.slice(1).join('\r\n\r\n'); // Rejoin in case body contains \r\n\r\n
  
  // Parse the first line to get method
  const lines = headerSection?.split('\r\n') || [];
  const firstLine = lines[0];
  const methodMatch = firstLine?.match(/^(\w+)\s+/);
  const method = methodMatch ? methodMatch[1] : 'UNKNOWN';
  
  // Parse headers
  const headers: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const name = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      headers[name] = value;
    }
  }
  
  return { method, headers, body };
};

const parsedHttp = computed(() => {
  return parseHttpRaw(props.request.raw);
});

const graphqlData = computed(() => {
  const parsed = parsedHttp.value;
  if (!parsed || !parsed.body) return null;
  
  // Try to parse body as JSON and look for GraphQL structure
  try {
    const bodyJson = JSON.parse(parsed.body);
    if (bodyJson.query && typeof bodyJson.query === 'string') {
      return bodyJson;
    }
  } catch {
    // If not JSON, check if it's raw GraphQL
    if (/\b(query|mutation|subscription)\s*[\{\(]/.test(parsed.body)) {
      return { query: parsed.body };
    }
  }
  
  return null;
});

// Check if this request actually contains GraphQL data
const isActuallyGraphQL = computed(() => {
  // Also check if method is POST (GraphQL standard)
  const parsed = parsedHttp.value;
  if (!parsed) return false;
  
  return parsed.method === 'POST' && graphqlData.value !== null;
});

// Enhanced GraphQL formatting with proper AST parsing
const formatGraphQLQuery = (query: string): string => {
  if (!query) return '';
  
  try {
    // FIRST: Strip comment lines (lines starting with #) BEFORE formatting
    const strippedQuery = query
      .split('\n')
      .filter(line => !line.trim().startsWith('#'))
      .join('\n')
      .trim();
    
    // More sophisticated GraphQL formatting
    let formatted = strippedQuery
      .replace(/\s+/g, ' ')
      .replace(/\{\s*/g, ' {\n  ')
      .replace(/\s*\}/g, '\n}')
      .replace(/,\s*/g, ',\n  ')
      .replace(/\(\s*/g, '(')
      .replace(/\s*\)/g, ')')
      .replace(/:\s*/g, ': ')
      .trim();
    
    // Fix indentation with proper nesting
    const lines = formatted.split('\n');
    let indentLevel = 0;
    const indentedLines = lines.map(line => {
      const trimmed = line.trim();
      if (trimmed.endsWith('}') && !trimmed.includes('{')) indentLevel--;
      const result = '  '.repeat(Math.max(0, indentLevel)) + trimmed;
      if (trimmed.includes('{') && !trimmed.endsWith('}')) indentLevel++;
      return result;
    });
    
    return indentedLines.join('\n');
  } catch (error) {
    return query; // Return original on error
  }
};

// Initialize editable content
onMounted(() => {
  // Initialize query
  if (graphqlData.value?.query) {
    const formatted = formatGraphQLQuery(graphqlData.value.query);
    editableQuery.value = formatted;
  } else {
    editableQuery.value = '';
  }
  
  // Initialize variables
  if (graphqlData.value?.variables !== undefined) {
    if (graphqlData.value.variables === null) {
      editableVariables.value = 'null';
    } else {
      editableVariables.value = JSON.stringify(graphqlData.value.variables, null, 2);
    }
  } else {
    editableVariables.value = '{}';
  }
  
  // Auto-validate on mount
  if (editableQuery.value) {
    queryValidationErrors.value = validateQuery(editableQuery.value);
  }
});

// Advanced GraphQL validation
const validateQuery = (query: string): string[] => {
  const errors: string[] = [];
  
  if (!query.trim()) {
    errors.push('Query cannot be empty');
    return errors;
  }
  
  // Strip comment lines (lines starting with #)
  const strippedQuery = query
    .split('\n')
    .filter(line => !line.trim().startsWith('#'))
    .join('\n')
    .trim();
  
  // If nothing left after stripping comments, no validation needed
  if (!strippedQuery) {
    return errors;
  }
  
  // Basic syntax validation on stripped query
  const openBraces = (strippedQuery.match(/\{/g) || []).length;
  const closeBraces = (strippedQuery.match(/\}/g) || []).length;
  
  if (openBraces !== closeBraces) {
    errors.push('Mismatched braces in query');
  }
  
  // Check for valid operation types on stripped query
  const hasValidOperation = /^\s*(query|mutation|subscription)\s+/i.test(strippedQuery) || 
                           /^\s*\{/.test(strippedQuery);
  
  if (!hasValidOperation) {
    errors.push('Query must start with query, mutation, subscription, or {');
  }
  
  return errors;
};

// Parse GraphQL query to extract field information with better type detection
const parseQueryFields = (query: string) => {
  const fields: Array<{name: string, type: string, description?: string}> = [];
  
  if (!query) return fields;
  
  try {
    const lines = query.split('\n');
    const fieldPattern = /^\s*(\w+)(?:\s*\([^)]*\))?\s*(?:\{|$)/;
    
    lines.forEach(line => {
      const match = line.match(fieldPattern);
      if (match) {
        const fieldName = match[1];
        if (fieldName && !['query', 'mutation', 'subscription', 'fragment'].includes(fieldName.toLowerCase())) {
          let type = 'String';
          if (fieldName.toLowerCase().includes('id')) type = 'ID';
          else if (fieldName.toLowerCase().includes('count') || fieldName.toLowerCase().includes('total')) type = 'Int';
          else if (fieldName.toLowerCase().includes('is') || fieldName.toLowerCase().includes('has')) type = 'Boolean';
          else if (fieldName.toLowerCase().includes('date') || fieldName.toLowerCase().includes('time')) type = 'DateTime';
          else if (fieldName.endsWith('s') && !fieldName.endsWith('us')) type = '[Object]';
          
          fields.push({
            name: fieldName,
            type: type,
          });
        }
      }
    });
    
    return fields;
  } catch {
    return fields;
  }
};

const queryFields = computed(() => parseQueryFields(editableQuery.value));

const isImportantHeader = (headerName: string): boolean => {
  const name = headerName.toLowerCase();
  return [
    'authorization',
    'x-api-key', 
    'x-auth-token',
    'x-access-token',
    'cookie',
    'x-csrf-token',
    'x-xsrf-token',
    'x-apollo-tracing',
    'x-hasura-admin-secret',
    'x-hasura-user-id',
    'x-hasura-role'
  ].some(important => name.includes(important));
};

// Check if any important headers exist
const hasImportantHeaders = computed(() => {
  if (!parsedHttp.value?.headers) return false;
  return Object.keys(parsedHttp.value.headers).some(key => isImportantHeader(key));
});

// Copy query to clipboard
const copyQuery = async () => {
  try {
    if (!editableQuery.value || editableQuery.value.trim() === '') {
      props.sdk.window.showToast('No query to copy', { variant: 'warning' });
      return;
    }
    
    await navigator.clipboard.writeText(editableQuery.value);
    props.sdk.window.showToast(`Copied ${editableQuery.value.length} characters to clipboard`, { variant: 'success' });
  } catch (error) {
    props.sdk.window.showToast('Failed to copy query', { variant: 'error' });
  }
};


const saveToScanner = () => {
  const protocol = props.request.port === 443 ? 'https' : 'http';
  const portPart = (props.request.port === 80 || props.request.port === 443) ? '' : `:${props.request.port}`;
  let graphqlUrl = `${protocol}://${props.request.host}${portPart}${props.request.path}`;
  
  if (!graphqlUrl.toLowerCase().includes('graphql')) {
    graphqlUrl = `${protocol}://${props.request.host}${portPart}/graphql`;
  }
  
  const headers: Record<string, string> = {};
  if (parsedHttp.value?.headers) {
    Object.entries(parsedHttp.value.headers).forEach(([key, value]) => {
      if (key.toLowerCase() !== 'content-length' && key && value) {
        headers[key] = typeof value === 'string' ? value : String(value);
      }
    });
  }

  props.sdk.window.showToast(`Scanning GraphQL endpoint: ${graphqlUrl}`, { variant: 'info' });
  
  window.location.hash = '/graphql-analyzer';
  
  localStorage.setItem('graphql-analyzer-context-scan-timestamp', Date.now().toString());
  localStorage.setItem('graphql-analyzer-context-scan-url', graphqlUrl);
  localStorage.setItem('graphql-analyzer-context-scan-headers', JSON.stringify(headers));
  
  window.dispatchEvent(new CustomEvent('graphql-analyzer-context-scan', { 
    detail: { url: graphqlUrl, headers } 
  }));
};

const saveToAttacker = () => {
  const protocol = props.request.port === 443 ? 'https' : 'http';
  const portPart = (props.request.port === 80 || props.request.port === 443) ? '' : `:${props.request.port}`;
  
  const requestData = {
    id: props.request.id?.toString() || '',
    host: props.request.host || '',
    port: props.request.port || 80,
    path: props.request.path || '/',
    query: props.request.query || '',
    headers: parsedHttp.value?.headers || {},
    raw: props.request.raw || ''
  };
  
  localStorage.setItem('graphql-analyzer-context-attack-request', JSON.stringify(requestData));
  
  props.sdk.window.showToast('Redirecting to attack page...', { variant: 'info' });
  
  window.location.hash = '/graphql-analyzer';
  localStorage.setItem('graphql-analyzer-navigate-to', 'Attacks');
  localStorage.setItem('graphql-analyzer-navigate-timestamp', Date.now().toString());
  
  window.dispatchEvent(new CustomEvent('graphql-analyzer-navigate', { 
    detail: { page: 'Attacks', requestId: requestData.id, request: requestData } 
  }));
  
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('graphql-analyzer-context-attack', { 
      detail: { request: requestData } 
    }));
  }, 200);
};
</script>

<template>
  <div class="h-full flex flex-col bg-surface-800">
    <div v-if="isActuallyGraphQL" class="flex-1 min-h-0 flex flex-col">
      <!-- Clean Action Toolbar -->
      <div class="flex items-center justify-between p-2 border-b border-surface-600 flex-shrink-0">
        <div class="flex items-center gap-2 text-surface-300">
          <i class="fas fa-project-diagram text-primary-400"></i>
          <span class="text-sm font-medium">{{ parsedHttp?.method || 'POST' }} {{ request.host }}{{ request.path }}</span>
        </div>
        
        <div class="flex gap-1">
          <Button
            icon="fas fa-copy"
            size="small"
            severity="secondary"
            text
            v-tooltip="'Copy Query'"
            @click="copyQuery"
          />
          <Button
            icon="fas fa-shield-alt"
            size="small"
            severity="danger"
            text
            v-tooltip="'Send to Attacker'"
            @click="saveToAttacker"
          />
          <Button
            icon="fas fa-external-link-alt"
            size="small"
            severity="info"
            text
            v-tooltip="'Send to Scanner'"
            @click="saveToScanner"
          />
        </div>
      </div>

      <!-- Full Width Content -->
      <div class="flex-1 min-h-0 overflow-hidden">
        <TabView 
          v-model="activeTab" 
          class="h-full"
          :pt="{
            root: { class: 'h-full flex flex-col' },
            navContainer: { class: 'flex-shrink-0' },
            panelContainer: { class: 'flex-1 min-h-0 overflow-hidden' }
          }"
        >
          <!-- Query Tab -->
          <TabPanel 
            header="Query"
            :pt="{ content: { class: 'h-full p-0' } }"
          >
            <div class="h-full flex flex-col p-2">
              <!-- Validation Errors -->
              <div v-if="queryValidationErrors.length > 0" class="border border-red-500 rounded p-2 mb-2 flex-shrink-0">
                <div class="flex items-center gap-2 text-red-400 text-sm font-medium mb-1">
                  <i class="fas fa-exclamation-triangle"></i>
                  <span>Validation Issues:</span>
                </div>
                <ul class="text-xs text-red-300 space-y-1">
                  <li v-for="error in queryValidationErrors" :key="error" class="flex items-center gap-2">
                    <i class="fas fa-dot-circle text-xs"></i>
                    {{ error }}
                  </li>
                </ul>
              </div>
              
              <!-- Enhanced Query Display -->
              <div class="flex-1 min-h-0 border border-surface-600 rounded overflow-hidden bg-surface-900">
                <CodeEditor
                  :content="editableQuery"
                  language="graphql"
                  :read-only="true"
                  :font-size="12"
                  @update:content="editableQuery = $event"
                  class="h-full w-full"
                />
              </div>
            </div>
          </TabPanel>
          
          <!-- Variables Tab -->
          <TabPanel 
            header="Variables"
            :pt="{ content: { class: 'h-full p-0' } }"
          >
            <div class="h-full flex gap-2 p-2">
              <!-- Variables JSON -->
              <div class="flex-1 min-w-0 flex flex-col">
                <div class="mb-2 flex-shrink-0">
                  <h4 class="text-sm font-medium text-surface-200">Variables JSON</h4>
                  <p class="text-xs text-surface-400">Variable values sent with the GraphQL query</p>
                </div>
                <div class="flex-1 min-h-0 border border-surface-600 rounded overflow-hidden">
                  <CodeEditor
                    :content="editableVariables"
                    language="json"
                    :read-only="true"
                    :font-size="12"
                    @update:content="editableVariables = $event"
                    class="h-full w-full"
                  />
                </div>
              </div>
              
              <!-- Query Fields Info -->
              <div class="w-80 flex-shrink-0 flex flex-col">
                <div class="mb-2 flex-shrink-0">
                  <h4 class="text-sm font-medium text-surface-200">Query Fields ({{ queryFields.length }})</h4>
                  <p class="text-xs text-surface-400">All fields detected in the GraphQL query</p>
                </div>
                <div class="flex-1 min-h-0 border border-surface-600 rounded overflow-hidden">
                  <div v-if="queryFields.length === 0" class="flex items-center justify-center h-full text-surface-500">
                    <div class="text-center">
                      <i class="fas fa-search text-xl mb-2"></i>
                      <div class="text-sm">No fields detected</div>
                    </div>
                  </div>
                  <div v-else class="h-full overflow-auto p-2">
                    <div class="space-y-1">
                      <div v-for="field in queryFields" :key="field.name" 
                           class="flex items-center gap-2 p-2 border border-surface-700 rounded">
                        <i class="fas fa-code text-primary-400 text-xs"></i>
                        <div class="flex-1 min-w-0">
                          <div class="text-sm font-mono text-surface-100 truncate">{{ field.name }}</div>
                          <div class="text-xs text-surface-400">{{ field.type }}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabPanel>
          
          <!-- Request Info Tab -->
          <TabPanel 
            header="Request Info"
            :pt="{ content: { class: 'h-full p-0' } }"
          >
            <div class="h-full overflow-auto p-2">
              <div class="space-y-3">
                <!-- Operation Info -->
                <div v-if="graphqlData?.operationName" class="border border-surface-600 rounded p-3">
                  <h4 class="text-sm font-medium text-surface-200 mb-2 flex items-center gap-2">
                    <i class="fas fa-tag text-warning-400"></i>
                    Operation Name
                  </h4>
                  <div class="text-lg font-mono text-warning-300">{{ graphqlData.operationName }}</div>
                </div>
                
                <!-- Endpoint Details -->
                <div class="border border-surface-600 rounded p-3">
                  <h4 class="text-sm font-medium text-surface-200 mb-2 flex items-center gap-2">
                    <i class="fas fa-server text-info-400"></i>
                    Endpoint Details
                  </h4>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <div class="text-xs text-surface-400 mb-1">Method</div>
                      <div class="font-mono text-surface-100">{{ parsedHttp?.method || 'POST' }}</div>
                    </div>
                    <div>
                      <div class="text-xs text-surface-400 mb-1">Host</div>
                      <div class="font-mono text-surface-100 break-all">{{ request.host }}</div>
                    </div>
                    <div>
                      <div class="text-xs text-surface-400 mb-1">Path</div>
                      <div class="font-mono text-surface-100 break-all">{{ request.path || '/' }}</div>
                    </div>
                    <div>
                      <div class="text-xs text-surface-400 mb-1">Port</div>
                      <div class="font-mono text-surface-100">{{ request.port || (request.port === 443 ? 443 : 80) }}</div>
                    </div>
                  </div>
                </div>
                
                <!-- Security Headers -->
                <div class="border border-surface-600 rounded p-3">
                  <h4 class="text-sm font-medium text-surface-200 mb-2 flex items-center gap-2">
                    <i class="fas fa-shield-alt text-warning-400"></i>
                    Security Headers
                  </h4>
                  <div class="space-y-1">
                    <div v-for="(value, key) in parsedHttp?.headers" :key="key" 
                         v-show="isImportantHeader(key)"
                         class="flex items-start gap-2 p-2 border border-surface-700 rounded">
                      <div class="text-xs text-surface-400 font-mono min-w-24 flex-shrink-0">{{ key }}:</div>
                      <div class="text-xs text-surface-200 font-mono flex-1 break-all">{{ value }}</div>
                    </div>
                    <div v-if="!hasImportantHeaders" class="text-center text-surface-500 py-4">
                      <div class="text-sm">
                        <i class="fas fa-info-circle mb-2"></i>
                        <div>No authentication or security headers detected</div>
                        <div class="text-xs mt-1 text-surface-600">Looking for: Authorization, API Keys, Cookies, CSRF tokens</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabPanel>
        </TabView>
      </div>

      <!-- Minimal Status Bar -->
      <div class="flex items-center justify-between px-3 py-1 border-t border-surface-600 bg-surface-800 text-xs flex-shrink-0">
        <div class="flex items-center gap-3 text-surface-400">
          <span class="flex items-center gap-1">
            <i class="fas fa-server"></i>
            {{ request.host }}
          </span>
          <span v-if="editableQuery" class="flex items-center gap-1">
            <i class="fas fa-code"></i>
            {{ editableQuery.split('\n').length }} lines
          </span>
        </div>
        <div class="text-success-400 font-medium">GraphQL</div>
      </div>
    </div>
    
    <!-- Not GraphQL State -->
    <div v-else class="flex-1 flex items-center justify-center">
      <div class="text-center text-surface-500">
        <i class="fas fa-exclamation-circle text-4xl mb-4"></i>
        <div class="text-lg font-semibold mb-2">Not a GraphQL Request</div>
        <div class="text-sm">This request does not contain GraphQL query data</div>
      </div>
    </div>
  </div>
</template>
