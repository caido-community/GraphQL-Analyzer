<script setup lang="ts">
import { type API, type RequestFull } from "@caido/sdk-frontend";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import TabPanel from "primevue/tabpanel";
import TabView from "primevue/tabview";
import { computed, nextTick, onMounted, ref, watch } from "vue";

import CodeEditor from "../components/common/CodeEditor.vue";
import { createStorageService } from "../services/storage";
import type { FrontendSDK } from "../types";

const props = defineProps<{
  sdk: API;
  request: RequestFull;
}>();

const storageService = createStorageService(
  props.sdk as unknown as FrontendSDK,
);

const editableQuery = ref("");
const editableVariables = ref("{}");
const editableOperationName = ref("");
const queryValidationErrors = ref<string[]>([]);
const activeTab = ref(0);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cachedEditorView = ref<any>(undefined);

const originalQuery = ref("");
const originalVariables = ref("{}");
const originalOperationName = ref("");

const isReplayTab = computed(() => window.location.hash.includes("/replay"));

const parseHttpRaw = (raw: string) => {
  if (raw === undefined || raw === "") return null;

  let parts = raw.split("\r\n\r\n");
  if (parts.length < 2) {
    parts = raw.split("\n\n");
    if (parts.length < 2) return null;
  }

  const headerSection = parts[0];
  const separator = raw.includes("\r\n") ? "\r\n\r\n" : "\n\n";
  const body = parts.slice(1).join(separator);

  let lines = headerSection?.split("\r\n") ?? [];
  if (lines.length === 1 && lines[0] === headerSection) {
    lines = headerSection?.split("\n") ?? [];
  }
  const firstLine = lines[0];
  const methodMatch =
    firstLine !== undefined ? firstLine.match(/^(\w+)\s+/) : null;
  const method =
    methodMatch !== null && methodMatch[1] !== undefined
      ? methodMatch[1]
      : "UNKNOWN";

  const headers: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || line === "") continue;
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const name = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      if (name !== "" && value !== "") {
        headers[name] = value;
      }
    }
  }

  return { method, headers, body };
};

const getRawData = computed((): string => {
  if (isReplayTab.value) {
    const editor = props.sdk.window?.getActiveEditor?.();
    if (editor !== undefined && editor !== null) {
      const editorView = editor.getEditorView();
      if (editorView !== undefined && editorView !== null) {
        const raw = editorView.state.doc.toString();
        if (raw !== undefined && raw !== null && raw !== "") return raw;
      }
    }
  }

  if (props.request?.raw) {
    return props.request.raw;
  }

  return "";
});

const tryGetEditorView = () => {
  const editor = props.sdk.window?.getActiveEditor?.();
  if (editor !== undefined && editor !== null) {
    const editorView = editor.getEditorView();
    if (editorView !== undefined && editorView !== null) {
      cachedEditorView.value = editorView;
      return editorView;
    }
  }
  return cachedEditorView.value;
};

const parsedHttp = computed(() => {
  const raw = getRawData.value;
  if (!raw || raw.trim() === "") return null;
  const parsed = parseHttpRaw(raw);
  return parsed;
});

const isGraphQLQuery = (text: string): boolean => {
  if (!text || text.trim() === "") return false;

  const trimmed = text.trim();

  const operationStartPattern =
    /^\s*(query|mutation|subscription|fragment)\s+[\w]+\s*[({]/i;
  if (operationStartPattern.test(trimmed)) {
    return true;
  }

  const operationWithoutNamePattern =
    /^\s*(query|mutation|subscription)\s*[({]/i;
  if (operationWithoutNamePattern.test(trimmed)) {
    return true;
  }

  const directQueryPattern = /^\s*{\s*\w/i;
  if (directQueryPattern.test(trimmed)) {
    return true;
  }

  const hasOperationKeyword =
    /(query|mutation|subscription|fragment)\s+[\w]+/i.test(trimmed);
  const hasGraphQLStructure = trimmed.includes("{") && trimmed.includes("}");
  const hasFieldLikePattern = /\w+\s*[:{(]/.test(trimmed);

  if (hasOperationKeyword && hasGraphQLStructure && hasFieldLikePattern) {
    return true;
  }

  if (hasGraphQLStructure && hasFieldLikePattern && trimmed.length > 10) {
    const graphQLFieldPattern = /\w+\s*\{|\w+\s*\(|\w+\s*:/;
    if (graphQLFieldPattern.test(trimmed)) {
      return true;
    }
  }

  return false;
};

const graphqlData = computed(() => {
  const parsed = parsedHttp.value;
  if (parsed === null || parsed.body === undefined || parsed.body === "") {
    return null;
  }

  const body = parsed.body.trim();
  if (!body) return null;

  try {
    const bodyJson = JSON.parse(body) as {
      query?: string;
      variables?: unknown;
      operationName?: string;
    };
    if (
      bodyJson.query !== undefined &&
      typeof bodyJson.query === "string" &&
      bodyJson.query.trim() !== ""
    ) {
      return bodyJson;
    }

    if (isGraphQLQuery(body)) {
      return { query: body };
    }
  } catch {
    if (isGraphQLQuery(body)) {
      return { query: body };
    }
  }

  return null;
});

const isActuallyGraphQL = computed(() => {
  if (props.request === undefined || props.request === null) return false;
  const parsed = parsedHttp.value;
  if (parsed === null || parsed === undefined) return false;

  return parsed.method === "POST" && graphqlData.value !== null;
});

const formatGraphQLQuery = (query: string): string => {
  if (!query) return "";

  try {
    const strippedQuery = query
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n")
      .trim();

    let formatted = strippedQuery
      .replace(/\s+/g, " ")
      .replace(/\{\s*/g, " {\n  ")
      .replace(/\s*\}/g, "\n}")
      .replace(/,\s*/g, ",\n  ")
      .replace(/\(\s*/g, "(")
      .replace(/\s*\)/g, ")")
      .replace(/:\s*/g, ": ")
      .trim();

    const lines = formatted.split("\n");
    let indentLevel = 0;
    const indentedLines = lines.map((line) => {
      const trimmed = line.trim();
      if (trimmed.endsWith("}") && !trimmed.includes("{")) indentLevel--;
      const result = "  ".repeat(Math.max(0, indentLevel)) + trimmed;
      if (trimmed.includes("{") && !trimmed.endsWith("}")) indentLevel++;
      return result;
    });

    return indentedLines.join("\n");
  } catch (error) {
    return query;
  }
};

const initializeData = () => {
  if (graphqlData.value?.query !== undefined) {
    const formatted = formatGraphQLQuery(graphqlData.value.query);
    editableQuery.value = formatted;
    originalQuery.value = formatted;
  } else {
    editableQuery.value = "";
    originalQuery.value = "";
  }

  if (graphqlData.value?.variables !== undefined) {
    if (graphqlData.value.variables === null) {
      editableVariables.value = "null";
      originalVariables.value = "null";
    } else {
      const varsStr = JSON.stringify(graphqlData.value.variables, null, 2);
      editableVariables.value = varsStr;
      originalVariables.value = varsStr;
    }
  } else {
    editableVariables.value = "{}";
    originalVariables.value = "{}";
  }

  if (graphqlData.value?.operationName !== undefined) {
    editableOperationName.value = graphqlData.value.operationName;
    originalOperationName.value = graphqlData.value.operationName;
  } else {
    editableOperationName.value = "";
    originalOperationName.value = "";
  }

  if (editableQuery.value) {
    queryValidationErrors.value = validateQuery(editableQuery.value);
  }
};

onMounted(async () => {
  await nextTick();
  tryGetEditorView();
  initializeData();
});

watch(
  () => graphqlData.value,
  (newValue) => {
    if (newValue) {
      const currentQuery = formatGraphQLQuery(
        newValue.query !== undefined && newValue.query !== null
          ? newValue.query
          : "",
      );
      const currentVars =
        newValue.variables !== undefined
          ? newValue.variables === null
            ? "null"
            : JSON.stringify(newValue.variables, null, 2)
          : "{}";
      const currentOpName =
        newValue.operationName !== undefined && newValue.operationName !== null
          ? newValue.operationName
          : "";

      if (
        editableQuery.value !== currentQuery ||
        editableVariables.value !== currentVars ||
        editableOperationName.value !== currentOpName
      ) {
        initializeData();
      }
    } else if (editableQuery.value !== "" || editableVariables.value !== "{}") {
      editableQuery.value = "";
      editableVariables.value = "{}";
      editableOperationName.value = "";
      originalQuery.value = "";
      originalVariables.value = "{}";
      originalOperationName.value = "";
    }
  },
  { immediate: true },
);

watch(editableQuery, () => {
  if (editableQuery.value) {
    queryValidationErrors.value = validateQuery(editableQuery.value);
  }
});

const validateQuery = (query: string): string[] => {
  const errors: string[] = [];

  if (!query.trim()) {
    errors.push("Query cannot be empty");
    return errors;
  }

  const strippedQuery = query
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n")
    .trim();

  if (!strippedQuery) {
    return errors;
  }

  const openBraces = (strippedQuery.match(/\{/g) || []).length;
  const closeBraces = (strippedQuery.match(/\}/g) || []).length;

  if (openBraces !== closeBraces) {
    errors.push("Mismatched braces in query");
  }

  const hasValidOperation =
    /^\s*(query|mutation|subscription)\s+/i.test(strippedQuery) ||
    /^\s*\{/.test(strippedQuery);

  if (!hasValidOperation) {
    errors.push("Query must start with query, mutation, subscription, or {");
  }

  return errors;
};

const parseQueryFields = (query: string) => {
  const fields: Array<{ name: string; type: string; description?: string }> =
    [];

  if (!query) return fields;

  try {
    const lines = query.split("\n");
    const fieldPattern = /^\s*(\w+)(?:\s*\([^)]*\))?\s*(?:\{|$)/;

    lines.forEach((line) => {
      const match = line.match(fieldPattern);
      if (match) {
        const fieldName = match[1];
        if (
          fieldName !== undefined &&
          fieldName !== "" &&
          !["query", "mutation", "subscription", "fragment"].includes(
            fieldName.toLowerCase(),
          )
        ) {
          let type = "String";
          if (fieldName.toLowerCase().includes("id")) type = "ID";
          else if (
            fieldName.toLowerCase().includes("count") ||
            fieldName.toLowerCase().includes("total")
          )
            type = "Int";
          else if (
            fieldName.toLowerCase().includes("is") ||
            fieldName.toLowerCase().includes("has")
          )
            type = "Boolean";
          else if (
            fieldName.toLowerCase().includes("date") ||
            fieldName.toLowerCase().includes("time")
          )
            type = "DateTime";
          else if (fieldName.endsWith("s") && !fieldName.endsWith("us"))
            type = "[Object]";

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
    "authorization",
    "x-api-key",
    "x-auth-token",
    "x-access-token",
    "cookie",
    "x-csrf-token",
    "x-xsrf-token",
    "x-apollo-tracing",
    "x-hasura-admin-secret",
    "x-hasura-user-id",
    "x-hasura-role",
  ].some((important) => name.includes(important));
};

const hasImportantHeaders = computed(() => {
  if (!parsedHttp.value?.headers) return false;
  return Object.keys(parsedHttp.value.headers).some((key) =>
    isImportantHeader(key),
  );
});

const copyQuery = async () => {
  try {
    if (!editableQuery.value || editableQuery.value.trim() === "") {
      props.sdk.window.showToast("No query to copy", { variant: "warning" });
      return;
    }

    await navigator.clipboard.writeText(editableQuery.value);
    props.sdk.window.showToast(
      `Copied ${editableQuery.value.length} characters to clipboard`,
      { variant: "success" },
    );
  } catch (error) {
    props.sdk.window.showToast("Failed to copy query", { variant: "error" });
  }
};

const saveToScanner = async () => {
  if (props.request === undefined || props.request === null) {
    props.sdk.window.showToast("No request available", { variant: "error" });
    return;
  }
  const requestId = props.request.id?.toString();
  if (requestId === undefined) {
    props.sdk.window.showToast("No request ID available", { variant: "error" });
    return;
  }

  window.location.hash = "/graphql-analyzer";

  await storageService.setMultiple({
    "graphql-analyzer-navigate-to": "Dashboard",
    "graphql-analyzer-navigate-timestamp": Date.now().toString(),
    "graphql-analyzer-context-scan-request-id": requestId,
  });

  window.dispatchEvent(
    new CustomEvent("graphql-analyzer-navigate", {
      detail: { page: "Dashboard" },
    }),
  );

  window.dispatchEvent(
    new CustomEvent("graphql-analyzer-context-scan", {
      detail: { requestId },
    }),
  );

  props.sdk.window.showToast("Scanning GraphQL endpoint...", {
    variant: "info",
  });
};

const saveToAttacker = async () => {
  if (props.request === undefined || props.request === null) {
    props.sdk.window.showToast("No request available", { variant: "error" });
    return;
  }
  const requestId = props.request.id?.toString();
  if (requestId === undefined) {
    props.sdk.window.showToast("No request ID available", { variant: "error" });
    return;
  }

  window.location.hash = "/graphql-analyzer";

  await storageService.setMultiple({
    "graphql-analyzer-navigate-to": "Attacks",
    "graphql-analyzer-navigate-timestamp": Date.now().toString(),
    "graphql-analyzer-context-attack-request-id": requestId,
  });

  window.dispatchEvent(
    new CustomEvent("graphql-analyzer-navigate", {
      detail: { page: "Attacks" },
    }),
  );

  window.dispatchEvent(
    new CustomEvent("graphql-analyzer-context-attack", {
      detail: { requestId },
    }),
  );

  props.sdk.window.showToast("Sending to attack page...", {
    variant: "info",
  });
};

const hasChanges = computed(() => {
  if (!isReplayTab.value) return false;
  return (
    editableQuery.value !== originalQuery.value ||
    editableVariables.value !== originalVariables.value ||
    editableOperationName.value !== originalOperationName.value
  );
});

const reconstructGraphQLBody = (): string => {
  const body: {
    query: string;
    variables?: unknown;
    operationName?: string;
  } = {
    query: editableQuery.value.trim(),
  };

  if (
    editableVariables.value.trim() !== "" &&
    editableVariables.value !== "null"
  ) {
    try {
      const parsedVars = JSON.parse(editableVariables.value);
      if (parsedVars !== null && typeof parsedVars === "object") {
        body.variables = parsedVars;
      }
    } catch {
      props.sdk.window.showToast("Invalid JSON in variables", {
        variant: "error",
      });
      throw new Error("Invalid JSON in variables");
    }
  }

  if (editableOperationName.value.trim() !== "") {
    body.operationName = editableOperationName.value.trim();
  }

  return JSON.stringify(body);
};

const reconstructRawHttpRequest = (newBody: string): string => {
  const parsed = parsedHttp.value;
  if (
    parsed === null ||
    parsed === undefined ||
    props.request === undefined ||
    props.request === null
  ) {
    throw new Error("Failed to parse HTTP request");
  }

  const headers = parsed.headers;
  const method = parsed.method;
  const path = props.request?.path || "/";

  const headerLines: string[] = [];
  headerLines.push(`${method} ${path} HTTP/1.1`);

  let hasContentType = false;
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === "content-length") {
      continue;
    }
    if (lowerKey === "content-type") {
      hasContentType = true;
    }
    headerLines.push(`${key}: ${value}`);
  }

  const bodyBytes = new TextEncoder().encode(newBody);
  headerLines.push(`Content-Length: ${bodyBytes.length}`);
  if (!hasContentType) {
    headerLines.push("Content-Type: application/json");
  }

  return headerLines.join("\r\n") + "\r\n\r\n" + newBody;
};

const saveChanges = () => {
  if (!isReplayTab.value) return;
  if (!hasChanges.value) return;

  try {
    if (!editableQuery.value.trim()) {
      props.sdk.window.showToast("Query cannot be empty", {
        variant: "error",
      });
      return;
    }

    if (queryValidationErrors.value.length > 0) {
      props.sdk.window.showToast("Please fix validation errors before saving", {
        variant: "error",
      });
      return;
    }

    const newBody = reconstructGraphQLBody();
    const newRaw = reconstructRawHttpRequest(newBody);

    const editorView = tryGetEditorView();

    if (editorView !== undefined && editorView !== null) {
      editorView.dispatch({
        changes: {
          from: 0,
          to: editorView.state.doc.length,
          insert: newRaw,
        },
      });

      originalQuery.value = editableQuery.value;
      originalVariables.value = editableVariables.value;
      originalOperationName.value = editableOperationName.value;

      props.sdk.window.showToast("Request updated successfully", {
        variant: "success",
      });
    } else {
      props.sdk.window.showToast(
        "Switch to the Raw tab first, then back to GraphQL to enable editing.",
        { variant: "warning" },
      );
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    props.sdk.window.showToast(`Failed to update request: ${errorMessage}`, {
      variant: "error",
    });
  }
};
</script>

<template>
  <div class="h-full flex flex-col bg-surface-800">
    <div v-if="isActuallyGraphQL" class="flex-1 min-h-0 flex flex-col">
      <!-- Clean Action Toolbar -->
      <div
        class="flex items-center justify-between p-2 border-b border-surface-600 flex-shrink-0"
      >
        <div class="flex items-center gap-2 text-surface-300">
          <i class="fas fa-project-diagram text-primary-400"></i>
          <span class="text-sm font-medium"
            >{{ parsedHttp?.method || "POST" }} {{ request?.host || "unknown"
            }}{{ request?.path || "/" }}</span
          >
        </div>

        <div class="flex gap-1">
          <Button
            v-if="isReplayTab && hasChanges"
            v-tooltip="'Save Changes'"
            icon="fas fa-save"
            size="small"
            severity="primary"
            @click="saveChanges"
          >
            Save
          </Button>
          <Button
            v-tooltip="'Copy Query'"
            icon="fas fa-copy"
            size="small"
            severity="secondary"
            text
            @click="copyQuery"
          />
          <Button
            v-tooltip="'Send to Attacker'"
            icon="fas fa-shield-alt"
            size="small"
            severity="danger"
            text
            @click="saveToAttacker"
          />
          <Button
            v-tooltip="'Send to Scanner'"
            icon="fas fa-external-link-alt"
            size="small"
            severity="info"
            text
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
            panelContainer: { class: 'flex-1 min-h-0 overflow-hidden' },
          }"
        >
          <!-- Query Tab -->
          <TabPanel header="Query" :pt="{ content: { class: 'h-full p-0' } }">
            <div class="h-full flex flex-col p-2">
              <!-- Operation Name (editable in Replay) -->
              <div
                v-if="isReplayTab || graphqlData?.operationName"
                class="mb-2 flex-shrink-0"
              >
                <label class="block text-sm font-medium text-surface-200 mb-1">
                  Operation Name
                </label>
                <InputText
                  v-if="isReplayTab"
                  v-model="editableOperationName"
                  class="w-full"
                  placeholder="Enter operation name (optional)"
                />
                <div v-else class="text-sm font-mono text-surface-300">
                  {{ graphqlData?.operationName || "None" }}
                </div>
              </div>

              <!-- Validation Errors -->
              <div
                v-if="queryValidationErrors.length > 0"
                class="border border-red-500 rounded p-2 mb-2 flex-shrink-0"
              >
                <div
                  class="flex items-center gap-2 text-red-400 text-sm font-medium mb-1"
                >
                  <i class="fas fa-exclamation-triangle"></i>
                  <span>Validation Issues:</span>
                </div>
                <ul class="text-xs text-red-300 space-y-1">
                  <li
                    v-for="error in queryValidationErrors"
                    :key="error"
                    class="flex items-center gap-2"
                  >
                    <i class="fas fa-dot-circle text-xs"></i>
                    {{ error }}
                  </li>
                </ul>
              </div>

              <!-- Enhanced Query Display -->
              <div
                class="flex-1 min-h-0 border border-surface-600 rounded overflow-hidden bg-surface-900"
              >
                <CodeEditor
                  :content="editableQuery"
                  language="graphql"
                  :read-only="!isReplayTab"
                  :font-size="12"
                  class="h-full w-full"
                  @update:content="editableQuery = $event"
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
                  <h4 class="text-sm font-medium text-surface-200">
                    Variables JSON
                  </h4>
                  <p class="text-xs text-surface-400">
                    Variable values sent with the GraphQL query
                  </p>
                </div>
                <div
                  class="flex-1 min-h-0 border border-surface-600 rounded overflow-hidden"
                >
                  <CodeEditor
                    :content="editableVariables"
                    language="json"
                    :read-only="!isReplayTab"
                    :font-size="12"
                    class="h-full w-full"
                    @update:content="editableVariables = $event"
                  />
                </div>
              </div>

              <!-- Query Fields Info -->
              <div class="w-80 flex-shrink-0 flex flex-col">
                <div class="mb-2 flex-shrink-0">
                  <h4 class="text-sm font-medium text-surface-200">
                    Query Fields ({{ queryFields.length }})
                  </h4>
                  <p class="text-xs text-surface-400">
                    All fields detected in the GraphQL query
                  </p>
                </div>
                <div
                  class="flex-1 min-h-0 border border-surface-600 rounded overflow-hidden"
                >
                  <div
                    v-if="queryFields.length === 0"
                    class="flex items-center justify-center h-full text-surface-500"
                  >
                    <div class="text-center">
                      <i class="fas fa-search text-xl mb-2"></i>
                      <div class="text-sm">No fields detected</div>
                    </div>
                  </div>
                  <div v-else class="h-full overflow-auto p-2">
                    <div class="space-y-1">
                      <div
                        v-for="field in queryFields"
                        :key="field.name"
                        class="flex items-center gap-2 p-2 border border-surface-700 rounded"
                      >
                        <i class="fas fa-code text-primary-400 text-xs"></i>
                        <div class="flex-1 min-w-0">
                          <div
                            class="text-sm font-mono text-surface-100 truncate"
                          >
                            {{ field.name }}
                          </div>
                          <div class="text-xs text-surface-400">
                            {{ field.type }}
                          </div>
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
                <div
                  v-if="graphqlData?.operationName"
                  class="border border-surface-600 rounded p-3"
                >
                  <h4
                    class="text-sm font-medium text-surface-200 mb-2 flex items-center gap-2"
                  >
                    <i class="fas fa-tag text-warning-400"></i>
                    Operation Name
                  </h4>
                  <div class="text-lg font-mono text-warning-300">
                    {{ graphqlData.operationName }}
                  </div>
                </div>

                <!-- Endpoint Details -->
                <div class="border border-surface-600 rounded p-3">
                  <h4
                    class="text-sm font-medium text-surface-200 mb-2 flex items-center gap-2"
                  >
                    <i class="fas fa-server text-info-400"></i>
                    Endpoint Details
                  </h4>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <div class="text-xs text-surface-400 mb-1">Method</div>
                      <div class="font-mono text-surface-100">
                        {{ parsedHttp?.method || "POST" }}
                      </div>
                    </div>
                    <div>
                      <div class="text-xs text-surface-400 mb-1">Host</div>
                      <div class="font-mono text-surface-100 break-all">
                        {{ request?.host || "unknown" }}
                      </div>
                    </div>
                    <div>
                      <div class="text-xs text-surface-400 mb-1">Path</div>
                      <div class="font-mono text-surface-100 break-all">
                        {{ request?.path || "/" }}
                      </div>
                    </div>
                    <div>
                      <div class="text-xs text-surface-400 mb-1">Port</div>
                      <div class="font-mono text-surface-100">
                        {{
                          request?.port || (request?.port === 443 ? 443 : 80)
                        }}
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Security Headers -->
                <div class="border border-surface-600 rounded p-3">
                  <h4
                    class="text-sm font-medium text-surface-200 mb-2 flex items-center gap-2"
                  >
                    <i class="fas fa-shield-alt text-warning-400"></i>
                    Security Headers
                  </h4>
                  <div class="space-y-1">
                    <div
                      v-for="(value, key) in parsedHttp?.headers"
                      v-show="isImportantHeader(key)"
                      :key="key"
                      class="flex items-start gap-2 p-2 border border-surface-700 rounded"
                    >
                      <div
                        class="text-xs text-surface-400 font-mono min-w-24 flex-shrink-0"
                      >
                        {{ key }}:
                      </div>
                      <div
                        class="text-xs text-surface-200 font-mono flex-1 break-all"
                      >
                        {{ value }}
                      </div>
                    </div>
                    <div
                      v-if="!hasImportantHeaders"
                      class="text-center text-surface-500 py-4"
                    >
                      <div class="text-sm">
                        <i class="fas fa-info-circle mb-2"></i>
                        <div>
                          No authentication or security headers detected
                        </div>
                        <div class="text-xs mt-1 text-surface-600">
                          Looking for: Authorization, API Keys, Cookies, CSRF
                          tokens
                        </div>
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
      <div
        class="flex items-center justify-between px-3 py-1 border-t border-surface-600 bg-surface-800 text-xs flex-shrink-0"
      >
        <div class="flex items-center gap-3 text-surface-400">
          <span class="flex items-center gap-1">
            <i class="fas fa-server"></i>
            {{ request?.host || "unknown" }}
          </span>
          <span v-if="editableQuery" class="flex items-center gap-1">
            <i class="fas fa-code"></i>
            {{ editableQuery.split("\n").length }} lines
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
        <div class="text-sm">
          This request does not contain GraphQL query data
        </div>
      </div>
    </div>
  </div>
</template>
