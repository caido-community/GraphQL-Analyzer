<script setup lang="ts">
import {
  type API,
  type RequestDraft,
  type RequestFull,
} from "@caido/sdk-frontend";
import { type EditorView } from "@codemirror/view";
import { watchDebounced } from "@vueuse/core";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import SelectButton from "primevue/selectbutton";
import { INTROSPECTION_QUERY } from "shared";
import { computed, ref, watch } from "vue";

import CodeEditor from "../components/common/CodeEditor.vue";
import { createStorageService } from "../services/storage";
import type { FrontendSDK } from "../types";
import { extractGraphQLOperation, parseHttpMessage } from "../utils/graphql";

const props = defineProps<{
  sdk: API;
  request?: RequestFull;
  draft?: RequestDraft;
  view: EditorView;
}>();

const storageService = createStorageService(
  props.sdk as unknown as FrontendSDK,
);

const editableQuery = ref("");
const editableVariables = ref("{}");
const editableOperationName = ref("");
const queryValidationErrors = ref<string[]>([]);
const tabs = ["Query", "Variables", "Request Info"];
const activeTab = ref("Query");

const lastWrittenRaw = ref("");
const initialized = ref({ query: "", variables: "{}", operationName: "" });

const getRawData = computed((): string => {
  if (props.draft !== undefined) {
    return props.draft.raw;
  }
  return props.request?.raw ?? "";
});

const parsedHttp = computed(() => parseHttpMessage(getRawData.value));

const graphqlData = computed(() => {
  const parsed = parsedHttp.value;
  if (parsed === undefined) return undefined;
  return extractGraphQLOperation(parsed.body);
});

const isPersistedQuery = computed(
  () =>
    graphqlData.value?.persistedQueryHash !== undefined &&
    graphqlData.value.query === "",
);

const isEditable = computed(
  () => props.draft !== undefined && !isPersistedQuery.value,
);

const isActuallyGraphQL = computed(
  () =>
    parsedHttp.value?.method.toUpperCase() === "POST" &&
    graphqlData.value !== undefined,
);

const endpoint = computed(() => {
  const source = props.draft ?? props.request;
  return {
    method: parsedHttp.value?.method ?? "POST",
    host: source?.host ?? "unknown",
    path: source?.path ?? "/",
    port: source?.port ?? (source?.isTls === true ? 443 : 80),
  };
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

const initializeData = () => {
  const data = graphqlData.value;

  editableQuery.value =
    data?.query !== undefined ? formatGraphQLQuery(data.query) : "";

  if (data?.variables === undefined) {
    editableVariables.value = "{}";
  } else if (data.variables === null) {
    editableVariables.value = "null";
  } else {
    editableVariables.value = JSON.stringify(data.variables, null, 2);
  }

  editableOperationName.value = data?.operationName ?? "";

  queryValidationErrors.value =
    editableQuery.value === "" ? [] : validateQuery(editableQuery.value);

  initialized.value = {
    query: editableQuery.value,
    variables: editableVariables.value,
    operationName: editableOperationName.value,
  };
};

watch(
  getRawData,
  () => {
    if (getRawData.value === lastWrittenRaw.value) return;
    initializeData();
  },
  { immediate: true },
);

watch(editableQuery, () => {
  queryValidationErrors.value =
    editableQuery.value === "" ? [] : validateQuery(editableQuery.value);
});

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

const copyQuery = async () => {
  try {
    if (!editableQuery.value || editableQuery.value.trim() === "") {
      props.sdk.window.showToast("No query to copy", { variant: "warning" });
      return;
    }

    await navigator.clipboard.writeText(editableQuery.value);
    props.sdk.window.showToast(
      `Copied ${editableQuery.value.length} characters to clipboard`,
      {
        variant: "success",
      },
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

const reconstructGraphQLBody = (): string | undefined => {
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
      return undefined;
    }
  }

  if (editableOperationName.value.trim() !== "") {
    body.operationName = editableOperationName.value.trim();
  }

  return JSON.stringify(body);
};

const reconstructRawHttpRequest = (newBody: string): string | undefined => {
  const parsed = parsedHttp.value;
  if (parsed === undefined) return undefined;

  const path = props.draft?.path ?? props.request?.path ?? "/";
  const query = props.draft?.query ?? props.request?.query ?? "";
  const target = query !== "" ? `${path}?${query}` : path;

  const headerLines: string[] = [`${parsed.method} ${target} HTTP/1.1`];

  let hasContentType = false;
  for (const [key, value] of Object.entries(parsed.headers)) {
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

const applyEdit = () => {
  if (!isEditable.value) return;
  if (editableQuery.value.trim() === "") return;
  if (queryValidationErrors.value.length > 0) return;

  if (
    editableQuery.value === initialized.value.query &&
    editableVariables.value === initialized.value.variables &&
    editableOperationName.value === initialized.value.operationName
  ) {
    return;
  }

  const newBody = reconstructGraphQLBody();
  if (newBody === undefined) return;

  const newRaw = reconstructRawHttpRequest(newBody);
  if (newRaw === undefined) return;
  if (newRaw === props.view.state.doc.toString()) return;

  lastWrittenRaw.value = newRaw;
  props.view.dispatch({
    changes: { from: 0, to: props.view.state.doc.length, insert: newRaw },
  });
};

watchDebounced(
  [editableQuery, editableVariables, editableOperationName],
  () => applyEdit(),
  {
    debounce: 400,
  },
);

const addIntrospectionQuery = () => {
  activeTab.value = "Query";
  editableOperationName.value = "IntrospectionQuery";
  editableVariables.value = "{}";
  editableQuery.value = formatGraphQLQuery(INTROSPECTION_QUERY);
};
</script>

<template>
  <div class="h-full flex flex-col bg-surface-800">
    <div v-if="isActuallyGraphQL" class="flex-1 min-h-0 flex flex-col">
      <div
        class="flex items-center justify-between p-2 border-b border-surface-600 flex-shrink-0"
      >
        <div class="flex items-center gap-2">
          <SelectButton
            v-model="activeTab"
            :options="tabs"
            :allow-empty="false"
          />
        </div>

        <div class="flex gap-1">
          <Button
            v-if="isEditable"
            v-tooltip="'Add introspection query'"
            icon="fas fa-magic"
            size="small"
            severity="secondary"
            text
            @click="addIntrospectionQuery"
          />
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

      <div class="flex-1 min-h-0 flex flex-col">
        <div class="flex-1 min-h-0 overflow-hidden">
          <div v-show="activeTab === 'Query'" class="h-full">
            <div class="h-full flex flex-col p-2">
              <div
                v-if="isEditable || graphqlData?.operationName"
                class="mb-2 flex-shrink-0"
              >
                <label class="block text-sm font-medium text-surface-200 mb-1">
                  Operation Name
                </label>
                <InputText
                  v-if="isEditable"
                  v-model="editableOperationName"
                  class="w-full"
                  placeholder="Enter operation name (optional)"
                />
                <div v-else class="text-sm font-mono text-surface-300">
                  {{ graphqlData?.operationName || "None" }}
                </div>
              </div>

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

              <div
                v-if="isPersistedQuery"
                class="flex-1 min-h-0 border border-surface-600 rounded bg-surface-900 p-4 flex flex-col items-center justify-center text-center"
              >
                <i class="fas fa-fingerprint text-2xl text-info-400 mb-2"></i>
                <div class="text-sm text-surface-200">
                  Persisted query. The query text is not sent inline.
                </div>
                <div
                  class="text-xs text-surface-400 mt-1 font-mono break-all max-w-full"
                >
                  SHA-256: {{ graphqlData?.persistedQueryHash }}
                </div>
              </div>
              <div
                v-else
                class="flex-1 min-h-0 border border-surface-600 rounded overflow-hidden bg-surface-900"
              >
                <CodeEditor
                  :content="editableQuery"
                  language="graphql"
                  :read-only="!isEditable"
                  :font-size="12"
                  class="h-full w-full"
                  @update:content="editableQuery = $event"
                />
              </div>
            </div>
          </div>

          <div v-show="activeTab === 'Variables'" class="h-full">
            <div class="h-full flex gap-2 p-2">
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
                    :read-only="!isEditable"
                    :font-size="12"
                    class="h-full w-full"
                    @update:content="editableVariables = $event"
                  />
                </div>
              </div>

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
          </div>

          <div v-show="activeTab === 'Request Info'" class="h-full">
            <div class="h-full overflow-auto p-2">
              <div class="space-y-3">
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
                        {{ endpoint.method }}
                      </div>
                    </div>
                    <div>
                      <div class="text-xs text-surface-400 mb-1">Host</div>
                      <div class="font-mono text-surface-100 break-all">
                        {{ endpoint.host }}
                      </div>
                    </div>
                    <div>
                      <div class="text-xs text-surface-400 mb-1">Path</div>
                      <div class="font-mono text-surface-100 break-all">
                        {{ endpoint.path }}
                      </div>
                    </div>
                    <div>
                      <div class="text-xs text-surface-400 mb-1">Port</div>
                      <div class="font-mono text-surface-100">
                        {{ endpoint.port }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        class="flex items-center justify-between px-3 py-1 border-t border-surface-600 bg-surface-800 text-xs flex-shrink-0"
      >
        <div class="flex items-center gap-3 text-surface-400">
          <span class="flex items-center gap-1">
            <i class="fas fa-server"></i>
            {{ endpoint.host }}
          </span>
          <span v-if="editableQuery" class="flex items-center gap-1">
            <i class="fas fa-code"></i>
            {{ editableQuery.split("\n").length }} lines
          </span>
        </div>
        <div class="text-success-400 font-medium">GraphQL</div>
      </div>
    </div>

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
