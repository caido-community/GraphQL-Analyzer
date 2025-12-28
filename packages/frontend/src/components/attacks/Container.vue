<script setup lang="ts">
import Button from "primevue/button";
import Card from "primevue/card";
import Checkbox from "primevue/checkbox";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import Dropdown from "primevue/dropdown";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import ProgressBar from "primevue/progressbar";
import Splitter from "primevue/splitter";
import SplitterPanel from "primevue/splitterpanel";
import TabPanel from "primevue/tabpanel";
import TabView from "primevue/tabview";
import type {
  AttackConfig,
  AttackResult,
  AttackSession,
  AttackType,
} from "shared";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

import { AttackTab } from "@/components/attacks";
import { CodeEditor } from "@/components/common";
import type { ExplorerSession } from "@/components/Explorer/useSessions";
import { useSDK } from "@/plugins/sdk";
import { createActivityService } from "@/services/activity";
import { createBackgroundAttackService } from "@/services/backgroundAttacks";
import { createReplayService } from "@/services/replay";

const sdk = useSDK();
const replayService = createReplayService(sdk);
const activityService = createActivityService(sdk);
const backgroundAttackService = createBackgroundAttackService(sdk);

defineProps<{
  navigateTo?: (
    page: "Dashboard" | "Explorer" | "Voyager" | "Attacks" | "History",
  ) => void;
}>();

// Types
type SelectedRequest =
  | {
      id?: string;
      url?: string;
      host?: string;
      port?: number;
      path?: string;
      raw?: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      protocol?: string;
      tls?: boolean;
    }
  | undefined;

type CodeEditorInstance =
  | {
      setValue?: (value: string) => void;
      getValue?: () => string;
      getEditorView?: () => EditorView;
      destroy?: () => void;
    }
  | undefined;

// State
const sessions = ref<ExplorerSession[]>([]);
const selectedSessionId = ref<string | undefined>(undefined);
const customUrl = ref("");
const useCustomUrl = ref(false);
const selectedRequest = ref<SelectedRequest>(undefined);
const useSelectedRequest = ref(false);
const isAttacking = ref(false);
const attackProgress = ref(0);
const attackResults = ref<AttackResult[]>([]);
const selectedResult = ref<AttackResult | undefined>(undefined);
const attackCancelled = ref(false);
const currentAttackSessionId = ref<string | undefined>(undefined);
const pollInterval = ref<number | undefined>(undefined);

// Attack Sessions State
const attackSessions = ref<AttackSession[]>([]);
const selectedAttackSessionId = ref<string | undefined>(undefined);
const currentActiveAttackId = ref<string | undefined>(undefined);

// SDK Editors
const requestEditor = ref<CodeEditorInstance>(undefined);
const responseEditor = ref<CodeEditorInstance>(undefined);

// Attack Data expansion state
const payloadExpanded = ref(false);
const responseExpanded = ref(false);

// Tab state for attack results detail view
const activeResultTab = ref(0);

// Attack configuration
const selectedAttacks = ref<AttackType[]>(["introspection"]);
const maxDepth = ref(10);
const batchSize = ref(5);
const customHeaders = ref<Array<{ name: string; value: string }>>([]);

// Custom headers functions
const addCustomHeader = () => {
  if (customHeaders.value.length < 10) {
    customHeaders.value.push({ name: "", value: "" });
  }
};

const removeCustomHeader = (index: number) => {
  customHeaders.value.splice(index, 1);
};

// Available attack types
const availableAttacks = [
  {
    value: "introspection" as AttackType,
    label: "Schema Introspection",
    description: "Tests if schema introspection is enabled",
    severity: "Medium",
  },
  {
    value: "depth-limit" as AttackType,
    label: "Query Depth Limit",
    description: "Tests for query depth restrictions",
    severity: "High",
  },
  {
    value: "query-complexity" as AttackType,
    label: "Query Complexity",
    description: "Tests for query complexity analysis",
    severity: "High",
  },
  {
    value: "batch-query" as AttackType,
    label: "Batch Query Limit",
    description: "Tests batch query processing limits",
    severity: "Medium",
  },
  {
    value: "field-suggestion" as AttackType,
    label: "Field Suggestion",
    description: "Tests for information disclosure in errors",
    severity: "Low",
  },
];

// Computed
const targetUrl = computed(() => {
  if (
    useSelectedRequest.value === true &&
    selectedRequest.value !== undefined
  ) {
    try {
      const request = selectedRequest.value;

      // If url is directly available, use it
      if (request.url !== undefined && request.url !== "") {
        return request.url;
      }

      // Otherwise construct from parts
      if (request.host !== undefined && request.host !== "") {
        const protocol = request.port === 443 ? "https" : "http";
        const portPart =
          request.port === 80 || request.port === 443
            ? ""
            : `:${request.port ?? 80}`;
        const path = request.path ?? "/graphql";
        return `${protocol}://${request.host}${portPart}${path}`;
      }
    } catch (error) {
      // If parsing fails, fall through to other options
    }
  }

  if (useCustomUrl.value === true) {
    return customUrl.value;
  }
  const session = sessions.value.find((s) => s.id === selectedSessionId.value);
  return session?.url ?? "";
});

const canExecuteAttack = computed(() => {
  return (
    isAttacking.value === false &&
    targetUrl.value.trim() !== "" &&
    selectedAttacks.value.length > 0
  );
});

const selectedSession = computed(() => {
  if (selectedSessionId.value === undefined) {
    return undefined;
  }
  return sessions.value.find((s) => s.id === selectedSessionId.value);
});

const selectedAttackSession = computed(() => {
  if (selectedAttackSessionId.value === undefined) {
    return undefined;
  }
  return attackSessions.value.find(
    (s) => s.id === selectedAttackSessionId.value,
  );
});

const attackResultsTableData = computed(() => {
  // Deduplicate attack results based on attackType and targetUrl
  const deduplicatedResults: AttackResult[] = [];
  const seen = new Set<string>();

  for (const result of attackResults.value) {
    const dedupeKey = `${result.attackType}-${result.targetUrl}`;

    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      deduplicatedResults.push(result);
    } else {
      // If we've seen this attack type + target before, merge findings
      const existingResult = deduplicatedResults.find(
        (r) =>
          r.attackType === result.attackType &&
          r.targetUrl === result.targetUrl,
      );

      if (existingResult) {
        // Deduplicate findings by title and severity
        const findingsSet = new Set<string>();
        const mergedFindings = [...existingResult.findings];

        // Add existing findings to set
        existingResult.findings.forEach((finding) => {
          findingsSet.add(`${finding.title}-${finding.severity}`);
        });

        // Add new unique findings
        result.findings.forEach((finding) => {
          const findingKey = `${finding.title}-${finding.severity}`;
          if (!findingsSet.has(findingKey)) {
            findingsSet.add(findingKey);
            mergedFindings.push(finding);
          }
        });

        existingResult.findings = mergedFindings;
        // Update timing to use the most recent
        if (
          result.response?.timing !== undefined &&
          existingResult.response !== undefined
        ) {
          existingResult.response.timing = result.response.timing;
        }
      }
    }
  }

  return deduplicatedResults.map((result, index) => ({
    id: index + 1,
    attackType: result.attackType,
    status: result.status,
    statusCode: result.response?.statusCode ?? 0,
    contentLength: result.response?.body?.length ?? 0,
    timing: result.response?.timing ?? 0,
    findingsCount: result.findings.length,
    highSeverityCount: result.findings.filter(
      (f) => f.severity === "critical" || f.severity === "high",
    ).length,
    statusIcon: getStatusIcon(result.status),
    severityLevel: getMaxSeverity(result.findings),
    rawResult: result,
  }));
});

// Helper functions
const getStatusIcon = (status: string) => {
  switch (status) {
    case "completed":
      return "fas fa-check-circle";
    case "failed":
      return "fas fa-times-circle";
    case "running":
      return "fas fa-spinner fa-spin";
    case "cancelled":
      return "fas fa-ban";
    default:
      return "fas fa-question-circle";
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "completed":
      return "text-green-400";
    case "failed":
      return "text-red-400";
    case "running":
      return "text-blue-400";
    case "cancelled":
      return "text-gray-400";
    default:
      return "text-gray-400";
  }
};

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case "critical":
      return "text-red-600";
    case "high":
      return "text-red-400";
    case "medium":
      return "text-yellow-400";
    case "low":
      return "text-blue-400";
    case "info":
      return "text-gray-400";
    default:
      return "text-gray-400";
  }
};

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    sdk.window.showToast("Copied to clipboard", { variant: "success" });
  } catch (error) {
    sdk.window.showToast("Failed to copy to clipboard", { variant: "error" });
  }
};

const getMaxSeverity = (findings: AttackResult["findings"]) => {
  if (findings.some((f) => f.severity === "critical")) return "critical";
  if (findings.some((f) => f.severity === "high")) return "high";
  if (findings.some((f) => f.severity === "medium")) return "medium";
  if (findings.some((f) => f.severity === "low")) return "low";
  return "info";
};

// Toggle select/deselect all attack vectors
const toggleSelectAll = () => {
  if (selectedAttacks.value.length === availableAttacks.length) {
    // Deselect all
    selectedAttacks.value = [];
  } else {
    // Select all
    selectedAttacks.value = availableAttacks.map((attack) => attack.value);
  }
};

// Load Explorer sessions (separate from attack sessions)
const loadSessions = () => {
  try {
    const stored = sdk.storage.get() as
      | {
          explorerSessions?: ExplorerSession[];
        }
      | undefined;
    if (
      stored?.explorerSessions !== undefined &&
      Array.isArray(stored.explorerSessions)
    ) {
      sessions.value = stored.explorerSessions.map((s: ExplorerSession) => ({
        ...s,
        createdAt: new Date(s.createdAt),
      }));

      if (sessions.value.length > 0 && selectedSessionId.value === undefined) {
        selectedSessionId.value = sessions.value[0]?.id;
      }
    }
  } catch (error) {
    sessions.value = [];
  }
};

// Attack Sessions Storage Functions
const saveAttackSessions = async () => {
  try {
    const currentStorage = (sdk.storage.get() as Record<string, unknown>) ?? {};
    currentStorage.attackSessions = attackSessions.value;
    currentStorage.selectedAttackSessionId = selectedAttackSessionId.value;
    // @ts-expect-error - SDK storage.set accepts any object
    await sdk.storage.set(currentStorage);
  } catch (error) {
    sdk.window.showToast("Failed to save attack sessions", {
      variant: "error",
    });
  }
};

const loadAttackSessions = () => {
  try {
    const stored = sdk.storage.get() as
      | {
          attackSessions?: AttackSession[];
          selectedAttackSessionId?: string;
        }
      | undefined;
    if (
      stored?.attackSessions !== undefined &&
      Array.isArray(stored.attackSessions)
    ) {
      attackSessions.value = stored.attackSessions.map((session) => ({
        ...session,
        createdAt: new Date(session.createdAt),
        completedAt: session.completedAt
          ? new Date(session.completedAt)
          : undefined,
      }));
      // Only restore selected session if it still exists
      if (
        stored.selectedAttackSessionId !== undefined &&
        attackSessions.value.some(
          (s) => s.id === stored.selectedAttackSessionId,
        )
      ) {
        selectedAttackSessionId.value = stored.selectedAttackSessionId;
      } else {
        selectedAttackSessionId.value = undefined; // Don't auto-select first session
      }
    } else {
      attackSessions.value = [];
      selectedAttackSessionId.value = undefined;
    }
  } catch (error) {
    attackSessions.value = [];
    selectedAttackSessionId.value = undefined;
  }
};

const createAttackSession = (config: AttackConfig): AttackSession => {
  const now = new Date();
  let domain = "Unknown";
  try {
    if (config.targetUrl) {
      domain = new URL(config.targetUrl).hostname;
    }
  } catch (error) {
    // If URL parsing fails, use "Unknown"
    domain = "Unknown";
  }

  return {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2),
    title: domain,
    targetUrl: config.targetUrl || "",
    config: config,
    results: [],
    createdAt: now,
    status: "running",
    totalFindings: 0,
    criticalFindings: 0,
  };
};

const selectAttackSession = (sessionId: string) => {
  selectedAttackSessionId.value = sessionId;
  const session = selectedAttackSession.value;
  if (session) {
    // Load the attack results for this session
    attackResults.value = session.results;
    selectedResult.value = undefined;

    // Clear any previous editors
    requestEditor.value = undefined;
    responseEditor.value = undefined;

    // Restore target selection state based on session config
    if (session.config.targetType === "request") {
      useSelectedRequest.value = true;
      useCustomUrl.value = false;
      selectedRequest.value =
        (session.config.selectedRequestData as SelectedRequest | undefined) ??
        undefined;
      selectedSessionId.value = undefined;
    } else if (session.config.targetType === "custom") {
      useSelectedRequest.value = false;
      useCustomUrl.value = true;
      customUrl.value = session.config.targetUrl;
      selectedSessionId.value = undefined;
    } else {
      // Default to session
      useSelectedRequest.value = false;
      useCustomUrl.value = false;
      selectedSessionId.value = session.config.sessionId ?? undefined;
    }

    // Update UI state based on session status
    isAttacking.value = session.status === "running";

    // If this session is currently running, set up polling
    if (
      session.status === "running" &&
      currentActiveAttackId.value === sessionId
    ) {
      currentAttackSessionId.value = currentActiveAttackId.value;
    } else if (session.status !== "running") {
      // Clear attacking state for completed sessions
      isAttacking.value = false;
      currentAttackSessionId.value = undefined;
    }

    // Force refresh of the UI in next tick
    nextTick(() => {
      // Trigger reactivity for computed properties
      if (selectedResult.value !== undefined) {
        const currentResult = selectedResult.value;
        selectedResult.value = undefined;
        nextTick(() => {
          selectedResult.value = currentResult;
        });
      }
    });
  }
  saveAttackSessions();
};

const updateAttackSession = (
  sessionId: string,
  updates: Partial<AttackSession>,
) => {
  const session = attackSessions.value.find((s) => s.id === sessionId);
  if (session) {
    Object.assign(session, updates);
    saveAttackSessions();
  }
};

const deleteAttackSession = (sessionId: string) => {
  const index = attackSessions.value.findIndex((s) => s.id === sessionId);
  if (index > -1) {
    const session = attackSessions.value[index];
    if (!session) return;

    // Stop background attack if this session is currently running
    if (
      session.status === "running" &&
      currentActiveAttackId.value === sessionId
    ) {
      backgroundAttackService.stopBackgroundAttack();
      currentActiveAttackId.value = undefined;
      currentAttackSessionId.value = undefined;
      isAttacking.value = false;
    }

    attackSessions.value.splice(index, 1);

    if (selectedAttackSessionId.value === sessionId) {
      selectedAttackSessionId.value = undefined; // Don't auto-select another session
      attackResults.value = [];
      selectedResult.value = undefined;
      requestEditor.value = undefined;
      responseEditor.value = undefined;
    }

    saveAttackSessions();
    sdk.window.showToast("Attack session deleted", { variant: "success" });
  }
};

const createNewAttackSession = async (showToast = true) => {
  // Create a new empty attack session
  const newSession: AttackSession = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2),
    title: "New Attack Session",
    targetUrl: "",
    config: {
      targetUrl: "",
      attackTypes: ["introspection"],
      maxDepth: 10,
      maxComplexity: 50,
      batchSize: 5,
      targetType: "session",
    },
    results: [],
    createdAt: new Date(),
    status: "pending",
    totalFindings: 0,
    criticalFindings: 0,
  };

  // Add to sessions and select it
  attackSessions.value.unshift(newSession);
  selectedAttackSessionId.value = newSession.id;

  // Clear results
  attackResults.value = [];
  selectedResult.value = undefined;
  requestEditor.value = undefined;
  responseEditor.value = undefined;

  // Save the new session
  await saveAttackSessions();

  // Save sessions
  saveAttackSessions();

  if (showToast) {
    sdk.window.showToast("New attack session created", { variant: "success" });
  }

  return newSession;
};

const renameAttackSession = (sessionId: string, newTitle: string) => {
  updateAttackSession(sessionId, { title: newTitle });
};

// Execute attacks with real-time updates
const executeAttacks = async () => {
  if (!canExecuteAttack.value) return;

  isAttacking.value = true;
  attackCancelled.value = false;
  attackProgress.value = 0;
  attackResults.value = [];
  selectedResult.value = undefined; // Clear previous selection

  try {
    // Build custom headers object
    const headersObj: Record<string, string> = {};
    customHeaders.value.forEach((header) => {
      if (header.name.trim() !== "" && header.value.trim() !== "") {
        headersObj[header.name.trim()] = header.value.trim();
      }
    });

    // Extract original headers from selected request if using request mode
    let originalHeaders: Record<string, string> | undefined = undefined;
    let useOriginalHeaders = false;

    if (
      useSelectedRequest.value === true &&
      selectedRequest.value !== undefined &&
      selectedRequest.value.raw !== undefined &&
      selectedRequest.value.raw !== ""
    ) {
      // Parse headers from raw HTTP request
      useOriginalHeaders = true;
      originalHeaders = {};

      try {
        const raw = selectedRequest.value.raw;
        // HTTP uses \r\n line endings - handle both \r\n and \n
        const lines = raw.split(/\r?\n/);
        let inHeaders = false;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line === undefined || line === "") {
            // Empty line signals end of headers
            if (inHeaders) break;
            continue;
          }

          const trimmedLine = line.trim();

          if (i === 0) {
            // First line is the request line (GET /path HTTP/1.1)
            inHeaders = true;
            continue;
          }

          if (inHeaders && trimmedLine === "") {
            // Empty line signals end of headers
            break;
          }

          if (inHeaders && trimmedLine.includes(":")) {
            const colonIndex = trimmedLine.indexOf(":");
            const headerName = trimmedLine.substring(0, colonIndex).trim();
            const headerValue = trimmedLine.substring(colonIndex + 1).trim();
            if (headerName !== "" && headerValue !== "") {
              // Exclude Content-Length as it will be recalculated
              if (headerName.toLowerCase() !== "content-length") {
                originalHeaders[headerName] = headerValue;
              }
            }
          }
        }
      } catch (error) {
        // If parsing fails, fall back to no headers
        originalHeaders = undefined;
        useOriginalHeaders = false;
      }
    }

    const config: AttackConfig = {
      targetUrl: targetUrl.value,
      sessionId: selectedSessionId.value ?? undefined,
      attackTypes: selectedAttacks.value,
      maxDepth: maxDepth.value,
      batchSize: batchSize.value,
      customHeaders:
        Object.keys(headersObj).length > 0 ? headersObj : undefined,
      originalHeaders: originalHeaders,
      useOriginalHeaders: useOriginalHeaders,
      targetType: useSelectedRequest.value
        ? "request"
        : useCustomUrl.value
          ? "custom"
          : "session",
      selectedRequestData: useSelectedRequest.value
        ? selectedRequest.value
        : undefined,
    };

    // Start attacks
    const sessionResult = await sdk.backend.startGraphQLAttacks(config);

    if (sessionResult.kind === "Error") {
      sdk.window.showToast(`Failed to start attacks: ${sessionResult.error}`, {
        variant: "error",
      });
      isAttacking.value = false;
      attackProgress.value = 0;
      return;
    }

    currentAttackSessionId.value = sessionResult.value;

    // Update existing session if it's a "New Attack Session", otherwise create new one
    const currentSession = selectedAttackSession.value;
    let attackSession: AttackSession;

    if (
      currentSession &&
      currentSession.title === "New Attack Session" &&
      currentSession.status === "pending"
    ) {
      // Update the existing "New Attack Session" tab with actual data
      let domain = "Unknown";
      try {
        if (config.targetUrl) {
          domain = new URL(config.targetUrl).hostname;
        }
      } catch (error) {
        // If URL parsing fails, use "Unknown"
        domain = "Unknown";
      }
      attackSession = {
        ...currentSession,
        title: domain,
        targetUrl: config.targetUrl,
        config: config,
        status: "running",
      };

      // Update the session in the array
      const sessionIndex = attackSessions.value.findIndex(
        (s) => s.id === currentSession.id,
      );
      if (sessionIndex !== -1) {
        attackSessions.value[sessionIndex] = attackSession;
      }
    } else {
      // Create new attack session and add to tabs
      attackSession = createAttackSession(config);
      attackSessions.value.unshift(attackSession); // Add to beginning
      selectedAttackSessionId.value = attackSession.id;
    }

    currentActiveAttackId.value = attackSession.id;

    // Clear results since we're starting a new attack
    attackResults.value = [];
    selectedResult.value = undefined;

    // Save attack sessions
    await saveAttackSessions();

    // Add activity to dashboard
    await activityService.addAttackActivity(
      config.targetUrl,
      config.attackTypes,
      attackSession.id,
    );

    // Start background attack service
    backgroundAttackService.startBackgroundAttack(
      sessionResult.value,
      config.attackTypes,
    );
  } catch (error) {
    if (attackCancelled.value === false) {
      sdk.window.showToast("Attack execution failed", { variant: "error" });
    }
    isAttacking.value = false;
  }
};

// Start polling for attack status updates - removed unused function

// Stop polling
const stopAttackPolling = () => {
  if (pollInterval.value !== undefined) {
    clearInterval(pollInterval.value);
    pollInterval.value = undefined;
  }
};

// Cancel attack execution
const cancelAttack = async () => {
  attackCancelled.value = true;
  isAttacking.value = false;
  attackProgress.value = 0;

  // Cancel backend attack session if we have one
  if (currentAttackSessionId.value !== undefined) {
    try {
      await sdk.backend.cancelAttackSession(currentAttackSessionId.value);
    } catch (error) {
      // Even if backend cancel fails, continue with frontend cleanup
    }
  }

  // Stop background attack service
  backgroundAttackService.stopBackgroundAttack();

  stopAttackPolling();

  // Update any running attack session to cancelled status
  if (currentActiveAttackId.value !== undefined) {
    updateAttackSession(currentActiveAttackId.value, {
      status: "cancelled",
      completedAt: new Date(),
    });
    currentActiveAttackId.value = undefined;
  }

  // Clear all attack-related state
  currentAttackSessionId.value = undefined;

  // Save the updated sessions to persist the cancellation
  await saveAttackSessions();

  sdk.window.showToast("Attack cancelled", { variant: "info" });
};

// Select result for detailed view
const selectResult = (result: AttackResult) => {
  selectedResult.value = result;
  // Reset expansion states when selecting new result
  payloadExpanded.value = false;
  responseExpanded.value = false;
  // Always reset to Request/Response tab (index 0) when selecting a new result
  activeResultTab.value = 0;

  // Force refresh editors on every selection
  nextTick(() => {
    mountSDKEditors();
  });
};

// Simple SDK editors
type EditorView =
  | {
      dispatch: (changes: {
        changes: { from: number; to: number; insert: string };
      }) => void;
      state?: { doc: { length: number } };
    }
  | undefined;

let requestEditorView: EditorView = undefined;
let responseEditorView: EditorView = undefined;

const updateEditorContent = (editorView: EditorView, content: string) => {
  if (editorView !== undefined && editorView.state !== undefined) {
    editorView.dispatch({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: content,
      },
    });
  }
};

const mountSDKEditors = async () => {
  const requestContainer = document.getElementById("request-editor-container");
  const responseContainer = document.getElementById(
    "response-editor-container",
  );

  if (selectedResult.value === undefined) {
    if (requestContainer)
      requestContainer.innerHTML =
        '<div class="h-full flex items-center justify-center text-surface-500">No request selected</div>';
    if (responseContainer)
      responseContainer.innerHTML =
        '<div class="h-full flex items-center justify-center text-surface-500">No response data</div>';
    return;
  }

  await nextTick();

  // Cleanup existing editors
  if (requestEditor.value !== undefined && requestEditor.value !== null) {
    try {
      if (
        typeof requestEditor.value === "object" &&
        "destroy" in requestEditor.value &&
        typeof requestEditor.value.destroy === "function"
      ) {
        requestEditor.value.destroy();
      }
    } catch (e) {
      // Ignore cleanup errors
    }
    requestEditor.value = undefined;
    requestEditorView = undefined;
  }
  if (responseEditor.value !== undefined && responseEditor.value !== null) {
    try {
      if (
        typeof responseEditor.value === "object" &&
        "destroy" in responseEditor.value &&
        typeof responseEditor.value.destroy === "function"
      ) {
        responseEditor.value.destroy();
      }
    } catch (e) {
      // Ignore cleanup errors
    }
    responseEditor.value = undefined;
    responseEditorView = undefined;
  }

  // Mount request editor
  if (requestContainer) {
    try {
      if (selectedResult.value.rawRequest !== undefined) {
        requestContainer.innerHTML = "";
        const editor = sdk.ui.httpRequestEditor();
        const editorElement = editor.getElement();

        // Apply proper height constraint
        editorElement.style.height = "100%";

        requestContainer.appendChild(editorElement);
        requestEditorView = editor.getEditorView();
        requestEditor.value = editor as CodeEditorInstance;

        updateEditorContent(requestEditorView, selectedResult.value.rawRequest);
      } else {
        requestContainer.innerHTML =
          '<div class="h-full flex items-center justify-center text-surface-400">No request data</div>';
      }
    } catch (error) {
      requestContainer.innerHTML = `<div class="h-full flex items-center justify-center text-red-400">Error: ${error instanceof Error ? error.message : String(error)}</div>`;
    }
  }

  // Mount response editor
  if (responseContainer) {
    try {
      if (
        selectedResult.value.rawResponse !== undefined &&
        selectedResult.value.rawResponse !== ""
      ) {
        responseContainer.innerHTML = "";
        const editor = sdk.ui.httpResponseEditor();
        const editorElement = editor.getElement();

        // Apply proper height constraint
        editorElement.style.height = "100%";

        responseContainer.appendChild(editorElement);
        responseEditorView = editor.getEditorView();
        responseEditor.value = editor as CodeEditorInstance;

        updateEditorContent(
          responseEditorView,
          selectedResult.value.rawResponse,
        );
      } else {
        responseContainer.innerHTML =
          '<div class="h-full flex items-center justify-center text-surface-400">No response data</div>';
      }
    } catch (error) {
      responseContainer.innerHTML = `<div class="h-full flex items-center justify-center text-red-400">Error: ${error instanceof Error ? error.message : String(error)}</div>`;
    }
  }
};

// Watch for result changes
watch(
  selectedResult,
  () => {
    if (selectedResult.value !== undefined) {
      mountSDKEditors();
    }
  },
  { immediate: true },
);

// Clear all results
const clearResults = () => {
  attackResults.value = [];
  selectedResult.value = undefined;
};

// Create Caido finding manually
const createCaidoFinding = async (
  finding: AttackResult["findings"][number],
) => {
  try {
    if (selectedResult.value?.requestId === undefined) {
      sdk.window.showToast("No request ID available for finding creation", {
        variant: "error",
      });
      return;
    }

    if (sdk.backend?.createCaidoFinding === undefined) {
      sdk.window.showToast("Create finding functionality not available", {
        variant: "error",
      });
      return;
    }

    // Pass request ID for finding creation
    const result = await sdk.backend.createCaidoFinding(
      finding,
      selectedResult.value.requestId,
    );

    if (result.kind === "Ok") {
      sdk.window.showToast(`Created finding: ${finding.title}`, {
        variant: "success",
      });
    } else {
      sdk.window.showToast(`Failed to create finding: ${result.error}`, {
        variant: "error",
      });
    }
  } catch (error) {
    sdk.window.showToast(
      `Error creating finding: ${error instanceof Error ? error.message : "Unknown error"}`,
      { variant: "error" },
    );
  }
};

// Create finding from table action button
const createFindingFromResult = async (result: AttackResult) => {
  if (result.findings.length === 0) {
    sdk.window.showToast("No findings available to create", {
      variant: "error",
    });
    return;
  }

  // If multiple findings, create the highest severity one
  const sortedFindings = result.findings.sort((a, b) => {
    const severityOrder = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
    return (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0);
  });

  const finding = sortedFindings[0];
  if (finding === undefined) {
    sdk.window.showToast("No finding to create", {
      variant: "error",
    });
    return;
  }

  try {
    if (result.requestId === undefined) {
      sdk.window.showToast("No request ID available for finding creation", {
        variant: "error",
      });
      return;
    }

    const createResult = await sdk.backend.createCaidoFinding(
      finding,
      result.requestId,
    );

    if (createResult.kind === "Ok") {
      sdk.window.showToast(`Created finding: ${finding.title}`, {
        variant: "success",
      });
    } else {
      sdk.window.showToast(`Failed to create finding: ${createResult.error}`, {
        variant: "error",
      });
    }
  } catch (error) {
    sdk.window.showToast(
      `Error creating finding: ${error instanceof Error ? error.message : "Unknown error"}`,
      { variant: "error" },
    );
  }
};

// Send to replay session
const sendToReplay = async (result: AttackResult) => {
  try {
    if (result.rawRequest === undefined || result.rawRequest === "") {
      sdk.window.showToast("No request data available for replay", {
        variant: "error",
      });
      return;
    }

    // Extract domain from target URL for collection naming
    let domain = "Unknown";
    try {
      if (result.targetUrl) {
        const url = new URL(result.targetUrl);
        domain = url.hostname;
      }
    } catch (error) {
      // If URL parsing fails, use "Unknown"
      domain = "Unknown";
    }

    // Create replay session using the service
    const replayResult = await replayService.createReplayFromRequest(
      result.rawRequest,
      domain,
    );

    if (replayResult.kind === "Ok") {
      sdk.window.showToast(
        `Created replay session: ${replayResult.value.sessionName}`,
        { variant: "success" },
      );
    } else {
      sdk.window.showToast(`Failed to create replay: ${replayResult.error}`, {
        variant: "error",
      });
    }
  } catch (error) {
    sdk.window.showToast(
      `Error sending to replay: ${error instanceof Error ? error.message : "Unknown error"}`,
      { variant: "error" },
    );
  }
};

// Helper to get finding severity class
const getFindingSeverityClass = (findings: AttackResult["findings"]) => {
  if (findings.some((f) => f.severity === "critical"))
    return "bg-red-600 text-red-100";
  if (findings.some((f) => f.severity === "high"))
    return "bg-red-500 text-red-100";
  if (findings.some((f) => f.severity === "medium"))
    return "bg-yellow-500 text-yellow-100";
  if (findings.some((f) => f.severity === "low"))
    return "bg-blue-500 text-blue-100";
  return "bg-gray-500 text-gray-100";
};

// Helper to get attack type label
const getAttackTypeLabel = (attackType: string) => {
  return (
    availableAttacks.find((a) => a.value === attackType)?.label ?? attackType
  );
};

// Helper to format dates
const formatDate = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
};

onMounted(() => {
  loadSessions();
  loadAttackSessions();

  // Check for dashboard navigation to specific attack session
  const attackSessionId = localStorage.getItem(
    "graphql-analyzer-navigate-to-attack",
  );
  if (attackSessionId !== null && attackSessionId !== "") {
    localStorage.removeItem("graphql-analyzer-navigate-to-attack");

    // Wait for attack sessions to load, then select the specified one
    nextTick(() => {
      if (attackSessions.value.some((s) => s.id === attackSessionId)) {
        selectAttackSession(attackSessionId);
        sdk.window.showToast("Navigated to attack session", {
          variant: "success",
        });
      }
    });
  }

  // Check for pending context attack request
  const storedRequest = localStorage.getItem(
    "graphql-analyzer-context-attack-request",
  );
  if (storedRequest !== null && storedRequest !== "") {
    try {
      const requestData = JSON.parse(storedRequest);
      selectedRequest.value = requestData;
      useSelectedRequest.value = true;
      useCustomUrl.value = false;
      selectedSessionId.value = undefined;

      // Parse and populate custom headers from the request
      if (
        requestData.raw !== undefined &&
        requestData.raw !== null &&
        requestData.raw !== ""
      ) {
        try {
          const raw = requestData.raw;
          const lines = raw.split(/\r?\n/);
          const extractedHeaders: Record<string, string> = {};
          let inHeaders = false;

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line === undefined || line === "") {
              if (inHeaders) break;
              continue;
            }

            const trimmedLine = line.trim();

            if (i === 0) {
              inHeaders = true;
              continue;
            }

            if (inHeaders === true && trimmedLine === "") {
              break;
            }

            if (
              inHeaders === true &&
              typeof trimmedLine === "string" &&
              trimmedLine.includes(":")
            ) {
              const colonIndex = trimmedLine.indexOf(":");
              const headerName = trimmedLine.substring(0, colonIndex).trim();
              const headerValue = trimmedLine.substring(colonIndex + 1).trim();
              if (
                headerName !== "" &&
                headerValue !== "" &&
                headerName.toLowerCase() !== "content-length"
              ) {
                extractedHeaders[headerName] = headerValue;
              }
            }
          }

          // Populate custom headers array
          if (Object.keys(extractedHeaders).length > 0) {
            customHeaders.value = [];
            Object.entries(extractedHeaders).forEach(([key, value]) => {
              customHeaders.value.push({ name: key, value });
            });
          }
        } catch (error) {
          // If parsing fails, continue without headers
        }
      }

      // Clean up localStorage
      localStorage.removeItem("graphql-analyzer-context-attack-request");

      // Automatically create a new attack session for this request
      createNewAttackSession(false);
    } catch (error) {
      // Invalid JSON, just remove it
      localStorage.removeItem("graphql-analyzer-context-attack-request");
    }
  }

  // Check for background attacks on mount and restore state
  if (backgroundAttackService.hasBackgroundAttack()) {
    const attackInfo = backgroundAttackService.getBackgroundAttackInfo();
    if (attackInfo) {
      // Find the corresponding attack session
      nextTick(() => {
        const attackSession = attackSessions.value.find(
          (s) =>
            s.status === "running" &&
            s.createdAt.getTime() >=
              new Date(Date.now() - 5 * 60 * 1000).getTime(), // Within last 5 minutes
        );

        if (attackSession) {
          // Restore attack state
          isAttacking.value = true;
          currentAttackSessionId.value = attackInfo.sessionId;
          currentActiveAttackId.value = attackSession.id;
          selectedAttackSessionId.value = attackSession.id;

          // Restore attack results
          attackResults.value = attackSession.results;

          // Silently resume background attack
        } else {
          // No corresponding session found, stop background attack
          backgroundAttackService.stopBackgroundAttack();
        }
      });
    }
  }

  // Listen for context attack events
  const handleContextAttack = (event: CustomEvent) => {
    const requestData = event.detail.request as SelectedRequest | undefined;
    if (requestData !== undefined) {
      selectedRequest.value = requestData;
      useSelectedRequest.value = true;
      useCustomUrl.value = false;
      selectedSessionId.value = undefined;

      // Parse and populate custom headers from the request
      if (
        requestData.raw !== undefined &&
        requestData.raw !== null &&
        requestData.raw !== ""
      ) {
        try {
          const raw = requestData.raw;
          const lines = raw.split(/\r?\n/);
          const extractedHeaders: Record<string, string> = {};
          let inHeaders = false;

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line === undefined || line === "") {
              if (inHeaders) break;
              continue;
            }

            const trimmedLine = line.trim();

            if (i === 0) {
              inHeaders = true;
              continue;
            }

            if (inHeaders === true && trimmedLine === "") {
              break;
            }

            if (
              inHeaders === true &&
              typeof trimmedLine === "string" &&
              trimmedLine.includes(":")
            ) {
              const colonIndex = trimmedLine.indexOf(":");
              const headerName = trimmedLine.substring(0, colonIndex).trim();
              const headerValue = trimmedLine.substring(colonIndex + 1).trim();
              if (
                headerName !== "" &&
                headerValue !== "" &&
                headerName.toLowerCase() !== "content-length"
              ) {
                extractedHeaders[headerName] = headerValue;
              }
            }
          }

          // Populate custom headers array
          if (Object.keys(extractedHeaders).length > 0) {
            customHeaders.value = [];
            Object.entries(extractedHeaders).forEach(([key, value]) => {
              customHeaders.value.push({ name: key, value });
            });
          }
        } catch (error) {
          // If parsing fails, continue without headers
        }
      }

      // Automatically create a new attack session for this request
      createNewAttackSession(false);

      // No toast needed - action speaks for itself
    }
  };

  // Listen for background attack progress events
  const handleAttackProgress = (event: CustomEvent) => {
    const { sessionId, status, progress, results } = event.detail;

    // Only update if this is our current attack session
    if (sessionId === currentAttackSessionId.value) {
      attackProgress.value = progress;
      attackResults.value = results;

      // Update attack session with current results
      if (currentActiveAttackId.value !== undefined) {
        updateAttackSession(currentActiveAttackId.value, {
          results: results,
          status: status.isComplete === true ? "completed" : "running",
        });
      }

      // Update isAttacking state based on completion
      if (status.isComplete === true) {
        isAttacking.value = false;
        attackProgress.value = 100;

        // Calculate findings for the session
        const totalFindings = results.reduce(
          (sum: number, r: AttackResult) => sum + r.findings.length,
          0,
        );
        const criticalFindings = results.reduce(
          (sum: number, r: AttackResult) =>
            sum +
            r.findings.filter(
              (f) => f.severity === "critical" || f.severity === "high",
            ).length,
          0,
        );

        // Update session with completion data
        if (currentActiveAttackId.value !== undefined) {
          updateAttackSession(currentActiveAttackId.value, {
            completedAt: new Date(),
            status: "completed",
            totalFindings,
            criticalFindings,
            results: results,
          });
        }

        currentActiveAttackId.value = undefined;
        currentAttackSessionId.value = undefined;

        sdk.window.showToast("Attack completed successfully", {
          variant: "success",
        });
      }
    }
  };

  // Listen for background attack completion events
  const handleAttackComplete = (event: CustomEvent) => {
    const { sessionId, totalFindings, criticalFindings } = event.detail;

    // Only update if this is our current attack session
    if (sessionId === currentAttackSessionId.value) {
      isAttacking.value = false;
      attackProgress.value = 100;

      // Update session with final completion data
      if (currentActiveAttackId.value !== undefined) {
        updateAttackSession(currentActiveAttackId.value, {
          completedAt: new Date(),
          status: "completed",
          totalFindings: totalFindings ?? 0,
          criticalFindings: criticalFindings ?? 0,
        });
        currentActiveAttackId.value = undefined;
      }
    }
  };

  window.addEventListener(
    "graphql-analyzer-context-attack",
    handleContextAttack as EventListener,
  );
  window.addEventListener(
    "graphql-analyzer-attack-progress",
    handleAttackProgress as EventListener,
  );
  window.addEventListener(
    "graphql-analyzer-attack-complete",
    handleAttackComplete as EventListener,
  );

  // Store cleanup function for later use
  const eventCleanup = () => {
    window.removeEventListener(
      "graphql-analyzer-context-attack",
      handleContextAttack as EventListener,
    );
    window.removeEventListener(
      "graphql-analyzer-attack-progress",
      handleAttackProgress as EventListener,
    );
    window.removeEventListener(
      "graphql-analyzer-attack-complete",
      handleAttackComplete as EventListener,
    );
  };

  // Add to global cleanup
  type WindowWithCleanup = Window & {
    eventCleanup?: () => void;
  };
  (window as WindowWithCleanup).eventCleanup = eventCleanup;
});

onUnmounted(() => {
  // Cleanup polling
  stopAttackPolling();

  // Cleanup event listeners
  type WindowWithCleanup = Window & {
    eventCleanup?: () => void;
  };
  const windowWithCleanup = window as WindowWithCleanup;
  if (windowWithCleanup.eventCleanup !== undefined) {
    windowWithCleanup.eventCleanup();
    delete windowWithCleanup.eventCleanup;
  }

  // Note: Don't stop background attacks here - they should continue running
  // Background attacks will continue even when user navigates away

  // Cleanup SDK editors
  if (requestEditor.value) {
    requestEditor.value.destroy?.();
  }
  if (responseEditor.value) {
    responseEditor.value.destroy?.();
  }
});
</script>

<script lang="ts">
export default {
  name: "Attacks",
};
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Attack Sessions Tabs -->
    <Card
      v-if="attackSessions.length > 0"
      class="h-fit mb-1"
      :pt="{
        body: { class: 'h-fit p-0' },
        content: { class: 'h-fit flex flex-col' },
      }"
    >
      <template #content>
        <div class="flex gap-2 p-4 flex-wrap">
          <AttackTab
            v-for="session in attackSessions"
            :key="session.id"
            :is-selected="selectedAttackSessionId === session.id"
            :attack-session="session"
            @select="selectAttackSession(session.id)"
            @rename="(newName) => renameAttackSession(session.id, newName)"
            @delete="deleteAttackSession(session.id)"
          />

          <!-- Plus Tab to Create New Attack Session -->
          <Button
            v-tooltip="'Create new attack session'"
            icon="fas fa-plus"
            severity="secondary"
            outlined
            size="small"
            class="min-w-12 h-8"
            @click="createNewAttackSession"
          />
        </div>
      </template>
    </Card>

    <!-- Main Content -->
    <div class="flex-1 min-h-0 overflow-hidden">
      <Splitter class="h-full">
        <!-- Configuration Panel (Left 40%) -->
        <SplitterPanel :size="40" :min-size="30" class="overflow-hidden">
          <div class="h-full overflow-auto pr-2 space-y-3">
            <!-- Attack Session Required State -->
            <div
              v-if="!selectedAttackSessionId && attackSessions.length === 0"
              class="h-full flex items-center justify-center"
            >
              <div class="text-center text-surface-500">
                <i class="fas fa-plus-circle text-4xl mb-4"></i>
                <div class="text-lg mb-2">No Attack Sessions</div>
                <div class="text-sm mb-4">
                  Create a new attack session to get started
                </div>
                <Button
                  label="Create Attack Session"
                  icon="fas fa-plus"
                  size="large"
                  @click="createNewAttackSession"
                />
              </div>
            </div>

            <div
              v-else-if="!selectedAttackSessionId"
              class="h-full flex items-center justify-center"
            >
              <div class="text-center text-surface-500">
                <i class="fas fa-mouse-pointer text-4xl mb-4"></i>
                <div class="text-lg mb-2">Select Attack Session</div>
                <div class="text-sm">
                  Please select an attack session from the tabs above to
                  configure attacks
                </div>
              </div>
            </div>

            <!-- Configuration Content (only show when session is selected) -->
            <template v-else>
              <!-- Target Selection -->
              <Card
                class="h-fit"
                :pt="{
                  body: { class: 'h-fit p-0' },
                  content: { class: 'h-fit flex flex-col' },
                }"
              >
                <template #content>
                  <div class="p-4">
                    <!-- Header -->
                    <div class="mb-4">
                      <h4 class="text-base font-semibold">Target Selection</h4>
                    </div>

                    <!-- Target Type Selection -->
                    <div class="flex flex-wrap gap-6 mb-4">
                      <!-- Session Option -->
                      <div class="flex items-center gap-2">
                        <input
                          id="target-session"
                          type="radio"
                          :checked="!useCustomUrl && !useSelectedRequest"
                          class="text-primary-600"
                          @change="
                            () => {
                              useCustomUrl = false;
                              useSelectedRequest = false;
                            }
                          "
                        />
                        <label for="target-session" class="text-sm font-medium"
                          >Use Session</label
                        >
                      </div>

                      <!-- Custom URL Option -->
                      <div class="flex items-center gap-2">
                        <input
                          id="target-custom"
                          type="radio"
                          :checked="useCustomUrl"
                          class="text-primary-600"
                          @change="
                            () => {
                              useCustomUrl = true;
                              useSelectedRequest = false;
                              customHeaders = [];
                            }
                          "
                        />
                        <label for="target-custom" class="text-sm font-medium"
                          >Use Custom URL</label
                        >
                      </div>

                      <!-- Selected Request Option -->
                      <div class="flex items-center gap-2">
                        <input
                          id="target-request"
                          type="radio"
                          :checked="useSelectedRequest"
                          class="text-primary-600"
                          :disabled="!selectedRequest"
                          @change="
                            () => {
                              useSelectedRequest = true;
                              useCustomUrl = false;
                            }
                          "
                        />
                        <label
                          for="target-request"
                          class="text-sm font-medium"
                          :class="{ 'text-surface-500': !selectedRequest }"
                        >
                          Use Selected Request
                        </label>
                        <span
                          v-if="!selectedRequest"
                          class="text-xs text-surface-500"
                          >(None selected)</span
                        >
                      </div>
                    </div>

                    <!-- Session Selection -->
                    <div
                      v-if="!useCustomUrl && !useSelectedRequest"
                      class="space-y-2"
                    >
                      <label class="block text-sm font-medium"
                        >Select Session</label
                      >
                      <Dropdown
                        v-model="selectedSessionId"
                        :options="sessions"
                        option-label="title"
                        option-value="id"
                        placeholder="Choose a scanned session"
                        class="w-full"
                        :disabled="sessions.length === 0"
                      />
                      <div
                        v-if="selectedSession"
                        class="bg-surface-800 rounded p-3 text-sm"
                      >
                        <div class="flex items-center gap-2 mb-2">
                          <div
                            class="w-2 h-2 rounded-full"
                            :class="{
                              'bg-green-500':
                                selectedSession.status === 'success',
                              'bg-yellow-500':
                                selectedSession.status === 'warning',
                              'bg-red-500': selectedSession.status === 'error',
                              'bg-surface-500': !selectedSession.status,
                            }"
                          ></div>
                          <span class="font-medium">{{
                            selectedSession.title
                          }}</span>
                        </div>
                        <div class="text-xs text-surface-400">
                          <div>
                            <strong>URL:</strong> {{ selectedSession.url }}
                          </div>
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
                      <div
                        v-if="sessions.length === 0"
                        class="text-xs text-yellow-400"
                      >
                        No sessions available. Scan an endpoint in the Dashboard
                        first.
                      </div>
                    </div>

                    <!-- Custom URL Input -->
                    <div v-else-if="useCustomUrl" class="space-y-2">
                      <label class="block text-sm font-medium"
                        >GraphQL Endpoint URL</label
                      >
                      <InputText
                        v-model="customUrl"
                        placeholder="https://example.com/graphql"
                        class="w-full"
                      />
                    </div>

                    <!-- Selected Request Info -->
                    <div
                      v-else-if="useSelectedRequest && selectedRequest"
                      class="space-y-2"
                    >
                      <label class="block text-sm font-medium"
                        >Selected Request</label
                      >
                      <div class="bg-surface-800 rounded p-3 text-sm">
                        <div v-if="selectedRequest?.id !== undefined">
                          <strong>ID:</strong> {{ selectedRequest.id }}
                        </div>
                        <div>
                          <strong>Host:</strong> {{ selectedRequest.host }}:{{
                            selectedRequest.port
                          }}
                        </div>
                        <div>
                          <strong>Path:</strong> {{ selectedRequest.path }}
                        </div>
                        <div class="text-xs text-surface-400 mt-1">
                          Target: {{ targetUrl }}
                        </div>
                      </div>
                    </div>
                  </div>
                </template>
              </Card>

              <!-- Attack Selection -->
              <Card
                class="h-fit"
                :pt="{
                  body: { class: 'h-fit p-0' },
                  content: { class: 'h-fit flex flex-col' },
                }"
              >
                <template #content>
                  <div class="p-4">
                    <div class="flex items-center justify-between mb-3">
                      <h4 class="text-base font-semibold">Attack Vectors</h4>
                      <Button
                        v-tooltip="
                          selectedAttacks.length === availableAttacks.length
                            ? 'Deselect all attack vectors'
                            : 'Select all attack vectors'
                        "
                        :label="
                          selectedAttacks.length === availableAttacks.length
                            ? 'Deselect All'
                            : 'Select All'
                        "
                        :icon="
                          selectedAttacks.length === availableAttacks.length
                            ? 'fas fa-times-circle'
                            : 'fas fa-check-circle'
                        "
                        size="small"
                        text
                        @click="toggleSelectAll"
                      />
                    </div>

                    <!-- Attack Grid - 2 per row -->
                    <div class="grid grid-cols-2 gap-3">
                      <div
                        v-for="(attack, index) in availableAttacks"
                        :key="attack.value"
                        class="flex items-start gap-3 p-3 border border-surface-600 rounded hover:border-surface-500 transition-colors"
                        :class="
                          index === availableAttacks.length - 1 &&
                          availableAttacks.length % 2 === 1
                            ? 'col-span-2'
                            : ''
                        "
                      >
                        <Checkbox
                          v-model="selectedAttacks"
                          :value="attack.value"
                          :input-id="`attack-${attack.value}`"
                        />
                        <div class="flex-1">
                          <label
                            :for="`attack-${attack.value}`"
                            class="text-sm font-medium cursor-pointer"
                          >
                            {{ attack.label }}
                          </label>
                          <p class="text-xs text-surface-400 mt-1">
                            {{ attack.description }}
                          </p>
                          <div class="flex items-center gap-2 mt-2">
                            <div class="flex items-center gap-1">
                              <i
                                class="fas fa-exclamation-triangle text-xs"
                                :class="
                                  getSeverityColor(
                                    attack.severity.toLowerCase(),
                                  )
                                "
                              ></i>
                              <span
                                class="text-xs font-medium"
                                :class="
                                  getSeverityColor(
                                    attack.severity.toLowerCase(),
                                  )
                                "
                              >
                                {{ attack.severity }}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </template>
              </Card>

              <!-- Attack Configuration -->
              <Card
                class="h-fit"
                :pt="{
                  body: { class: 'h-fit p-0' },
                  content: { class: 'h-fit flex flex-col' },
                }"
              >
                <template #content>
                  <div class="p-4">
                    <h4 class="text-base font-semibold mb-3">Configuration</h4>

                    <div class="grid grid-cols-2 gap-3">
                      <div>
                        <label class="block text-sm font-medium mb-1"
                          >Max Depth</label
                        >
                        <InputNumber
                          v-model="maxDepth"
                          :min="1"
                          :max="50"
                          class="w-full"
                          :disabled="!selectedAttacks.includes('depth-limit')"
                        />
                        <div class="text-xs text-surface-400 mt-1">
                          For depth-limit attacks
                        </div>
                      </div>

                      <div>
                        <label class="block text-sm font-medium mb-1"
                          >Batch Size</label
                        >
                        <InputNumber
                          v-model="batchSize"
                          :min="1"
                          :max="100"
                          class="w-full"
                          :disabled="!selectedAttacks.includes('batch-query')"
                        />
                        <div class="text-xs text-surface-400 mt-1">
                          For batch-query attacks
                        </div>
                      </div>
                    </div>

                    <!-- Custom Headers Section -->
                    <div class="mt-4">
                      <div class="flex items-center justify-between mb-2">
                        <label class="block text-sm font-medium"
                          >Custom Headers</label
                        >
                        <Button
                          v-tooltip="
                            customHeaders.length >= 10
                              ? 'Maximum 10 headers allowed'
                              : 'Add custom header'
                          "
                          :disabled="customHeaders.length >= 10"
                          icon="fas fa-plus"
                          size="small"
                          text
                          @click="addCustomHeader"
                        />
                      </div>

                      <div
                        v-if="customHeaders.length === 0"
                        class="text-xs text-surface-400 italic"
                      >
                        Click + to add custom headers
                      </div>

                      <div v-else class="space-y-2">
                        <div
                          v-for="(header, index) in customHeaders"
                          :key="index"
                          class="flex items-center gap-2"
                        >
                          <InputText
                            v-model="header.name"
                            placeholder="Header name"
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
                            v-tooltip="'Remove header'"
                            icon="fas fa-times"
                            size="small"
                            text
                            severity="danger"
                            @click="removeCustomHeader(index)"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </template>
              </Card>

              <!-- Execute Button -->
              <Card
                class="h-fit"
                :pt="{
                  body: { class: 'h-fit p-0' },
                  content: { class: 'h-fit flex flex-col' },
                }"
              >
                <template #content>
                  <div class="p-4">
                    <div v-if="!isAttacking">
                      <Button
                        label="Execute Attacks"
                        icon="fas fa-bolt"
                        :disabled="!canExecuteAttack"
                        class="w-full"
                        severity="danger"
                        @click="executeAttacks"
                      />
                    </div>

                    <div v-if="isAttacking" class="space-y-3">
                      <div class="flex gap-2">
                        <Button
                          label="Running..."
                          icon="fas fa-spinner fa-spin"
                          disabled
                          class="flex-1"
                          severity="info"
                        />
                        <Button
                          label="Cancel"
                          icon="fas fa-times"
                          severity="secondary"
                          outlined
                          @click="cancelAttack"
                        />
                      </div>

                      <div>
                        <div class="text-sm text-surface-300 mb-2">
                          Running security tests...
                          {{ Math.round(attackProgress) }}%
                        </div>
                        <ProgressBar :value="attackProgress" />
                      </div>
                    </div>

                    <div
                      v-if="attackResults.length > 0"
                      class="mt-3 flex justify-between items-center"
                    >
                      <div class="text-sm text-surface-300">
                        {{ attackResults.length }} attacks completed
                      </div>
                      <Button
                        label="Clear"
                        icon="fas fa-trash"
                        size="small"
                        text
                        severity="secondary"
                        @click="clearResults"
                      />
                    </div>
                  </div>
                </template>
              </Card>
            </template>
          </div>
        </SplitterPanel>

        <!-- Results Panel (Right 60%) -->
        <SplitterPanel :size="60" :min-size="40" class="overflow-hidden">
          <div class="h-full pl-2 flex flex-col">
            <!-- Resizable Layout: Attack Results + Details -->
            <div v-if="attackResults.length > 0" class="h-full">
              <Splitter layout="vertical" class="h-full">
                <!-- Attack Results Panel -->
                <SplitterPanel
                  :size="40"
                  :min-size="25"
                  class="overflow-hidden"
                >
                  <Card
                    class="h-full"
                    :pt="{
                      body: { class: 'h-full p-0' },
                      content: { class: 'h-full flex flex-col' },
                    }"
                  >
                    <template #content>
                      <div
                        class="p-2 border-b border-surface-600 flex-shrink-0"
                      >
                        <h4 class="text-base font-semibold">Attack Results</h4>
                      </div>

                      <div class="flex-1 overflow-auto">
                        <DataTable
                          :value="attackResultsTableData"
                          selection-mode="single"
                          :selection="selectedResult"
                          class="w-full"
                          :pt="{
                            table: { class: 'text-sm w-full' },
                            bodyRow: {
                              class: 'cursor-pointer hover:bg-surface-700',
                            },
                          }"
                          @row-select="selectResult($event.data.rawResult)"
                        >
                          <Column
                            field="id"
                            header="ID"
                            class="w-16 text-center"
                          >
                            <template #body="{ data }">
                              <span class="font-mono text-surface-200">{{
                                data.id
                              }}</span>
                            </template>
                          </Column>

                          <Column
                            field="statusCode"
                            header="Status Code"
                            class="w-32 text-center"
                          >
                            <template #body="{ data }">
                              <span
                                class="px-2 py-1 rounded text-xs font-medium"
                                :class="{
                                  'bg-green-900 text-green-400':
                                    data.statusCode === 200,
                                  'bg-red-900 text-red-400':
                                    data.statusCode >= 400,
                                  'bg-yellow-900 text-yellow-400':
                                    data.statusCode >= 300 &&
                                    data.statusCode < 400,
                                  'bg-gray-900 text-gray-400':
                                    data.statusCode === 0,
                                }"
                              >
                                {{ data.statusCode || "-" }}
                              </span>
                            </template>
                          </Column>

                          <Column
                            field="contentLength"
                            header="Content Length"
                            class="w-32 text-center"
                          >
                            <template #body="{ data }">
                              <span class="font-mono text-surface-200">{{
                                data.contentLength || 0
                              }}</span>
                            </template>
                          </Column>

                          <Column
                            field="attackType"
                            header="Attack Type"
                            class="flex-1"
                          >
                            <template #body="{ data }">
                              <span class="font-medium text-surface-100">{{
                                getAttackTypeLabel(data.attackType)
                              }}</span>
                            </template>
                          </Column>

                          <Column
                            field="timing"
                            header="Time (ms)"
                            class="w-24 text-center"
                          >
                            <template #body="{ data }">
                              <span class="font-mono text-surface-200">{{
                                data.timing || 0
                              }}</span>
                            </template>
                          </Column>

                          <Column
                            field="findings"
                            header="Findings"
                            class="w-20 text-center"
                          >
                            <template #body="{ data }">
                              <div class="flex items-center justify-center">
                                <span
                                  v-if="data.rawResult.findings.length > 0"
                                  class="px-2 py-1 rounded text-xs font-medium"
                                  :class="
                                    getFindingSeverityClass(
                                      data.rawResult.findings,
                                    )
                                  "
                                >
                                  {{ data.rawResult.findings.length }}
                                </span>
                                <span v-else class="text-surface-500 text-xs"
                                  >-</span
                                >
                              </div>
                            </template>
                          </Column>

                          <Column
                            field="status"
                            header="State"
                            class="w-24 text-center"
                          >
                            <template #body="{ data }">
                              <div class="flex items-center justify-center">
                                <span
                                  class="px-2 py-1 rounded text-xs font-medium capitalize"
                                  :class="{
                                    'bg-green-900 text-green-400':
                                      data.status === 'completed',
                                    'bg-red-900 text-red-400':
                                      data.status === 'failed',
                                    'bg-blue-900 text-blue-400':
                                      data.status === 'running',
                                    'bg-gray-900 text-gray-400':
                                      data.status === 'cancelled',
                                  }"
                                >
                                  {{ data.status }}
                                </span>
                              </div>
                            </template>
                          </Column>

                          <Column header="Actions" class="w-24 text-center">
                            <template #body="{ data }">
                              <div
                                class="flex items-center justify-center gap-1"
                              >
                                <!-- Create Finding Button -->
                                <Button
                                  v-tooltip="
                                    data.rawResult.findings.length > 0
                                      ? 'Create Caido Finding'
                                      : 'No findings to create'
                                  "
                                  :disabled="
                                    data.rawResult.findings.length === 0
                                  "
                                  :severity="
                                    data.rawResult.findings.length > 0
                                      ? 'success'
                                      : 'secondary'
                                  "
                                  icon="fas fa-plus"
                                  size="small"
                                  text
                                  @click="
                                    createFindingFromResult(data.rawResult)
                                  "
                                />

                                <!-- Send to Replay Button -->
                                <Button
                                  v-tooltip="'Send to Replay'"
                                  severity="info"
                                  icon="fas fa-sync"
                                  size="small"
                                  text
                                  @click="sendToReplay(data.rawResult)"
                                />
                              </div>
                            </template>
                          </Column>
                        </DataTable>
                      </div>
                    </template>
                  </Card>
                </SplitterPanel>

                <!-- Details Panel -->
                <SplitterPanel
                  :size="60"
                  :min-size="35"
                  class="overflow-hidden"
                >
                  <Card
                    v-if="selectedResult"
                    class="h-full"
                    :pt="{
                      body: { class: 'h-full p-0' },
                      content: { class: 'h-full flex flex-col' },
                    }"
                  >
                    <template #content>
                      <div class="h-full flex flex-col">
                        <div class="p-3 border-b border-surface-600">
                          <div class="flex items-center justify-between">
                            <h4 class="text-base font-semibold">
                              {{
                                getAttackTypeLabel(selectedResult.attackType)
                              }}
                              Details
                            </h4>
                            <div class="flex items-center gap-2">
                              <span
                                :class="[
                                  getStatusIcon(selectedResult.status),
                                  getStatusColor(selectedResult.status),
                                ]"
                              ></span>
                              <span class="text-sm capitalize">{{
                                selectedResult.status
                              }}</span>
                            </div>
                          </div>
                        </div>

                        <div
                          class="flex-1 min-h-0"
                          style="height: 100%; max-height: 100%"
                        >
                          <TabView
                            :active-index="activeResultTab"
                            class="h-full"
                            :pt="{
                              panelContainer: {
                                class: 'h-full overflow-hidden',
                              },
                              panels: { class: 'h-full' },
                            }"
                            @update:active-index="activeResultTab = $event"
                          >
                            <!-- Request/Response Tab using Caido SDK -->
                            <TabPanel
                              header="Request/Response"
                              :pt="{ content: { class: 'h-full p-0' } }"
                            >
                              <div class="h-full flex">
                                <!-- Request Section (50% left) -->
                                <div
                                  class="w-1/2 border-r border-surface-600 flex flex-col"
                                >
                                  <div
                                    id="request-editor-container"
                                    style="height: 100%; flex: 1"
                                  ></div>
                                </div>

                                <!-- Response Section (50% right) -->
                                <div class="w-1/2 flex flex-col">
                                  <div
                                    id="response-editor-container"
                                    style="height: 100%; flex: 1"
                                  ></div>
                                </div>
                              </div>
                            </TabPanel>

                            <!-- Attack Data Tab -->
                            <TabPanel
                              header="Attack Data"
                              :pt="{ content: { class: 'h-full p-0' } }"
                            >
                              <div class="h-full flex flex-col">
                                <!-- Side-by-side Layout (Default) -->
                                <div
                                  v-if="!payloadExpanded && !responseExpanded"
                                  class="h-full flex"
                                >
                                  <!-- Attack Payload (50% width, 70% of container height) -->
                                  <div
                                    class="w-1/2 border-r border-surface-600 flex flex-col"
                                  >
                                    <div
                                      class="flex-shrink-0 flex items-center justify-between p-3 bg-surface-800 border-b border-surface-600"
                                    >
                                      <div>
                                        <div
                                          class="text-sm font-medium text-surface-200"
                                        >
                                          Attack Payload
                                        </div>
                                        <div class="text-xs text-surface-400">
                                          {{ selectedResult.attackType }} attack
                                          payload
                                        </div>
                                      </div>
                                      <div class="flex items-center gap-2">
                                        <button
                                          class="text-surface-400 hover:text-surface-200 p-1 rounded"
                                          title="Copy payload"
                                          @click="
                                            copyToClipboard(
                                              selectedResult.payload,
                                            )
                                          "
                                        >
                                          <i class="fas fa-copy"></i>
                                        </button>
                                        <button
                                          class="text-surface-400 hover:text-surface-200 p-1 rounded"
                                          title="Expand to full width"
                                          @click="payloadExpanded = true"
                                        >
                                          <i
                                            class="fas fa-expand-arrows-alt"
                                          ></i>
                                        </button>
                                      </div>
                                    </div>
                                    <div class="flex-1 overflow-auto min-h-0">
                                      <CodeEditor
                                        :content="selectedResult.payload"
                                        language="json"
                                        :read-only="true"
                                        :font-size="12"
                                      />
                                    </div>
                                  </div>

                                  <!-- Attack Response (50% width, 70% of container height) -->
                                  <div class="w-1/2 flex flex-col">
                                    <div
                                      class="flex-shrink-0 flex items-center justify-between p-3 bg-surface-800 border-b border-surface-600"
                                    >
                                      <div>
                                        <div
                                          class="text-sm font-medium text-surface-200"
                                        >
                                          Attack Response
                                        </div>
                                        <div class="text-xs text-surface-400">
                                          {{
                                            selectedResult.response
                                              ? `${selectedResult.response.body.length} bytes`
                                              : "No response"
                                          }}
                                        </div>
                                      </div>
                                      <div class="flex items-center gap-2">
                                        <button
                                          v-if="selectedResult.response"
                                          class="text-surface-400 hover:text-surface-200 p-1 rounded"
                                          title="Copy response"
                                          @click="
                                            copyToClipboard(
                                              selectedResult.response.body,
                                            )
                                          "
                                        >
                                          <i class="fas fa-copy"></i>
                                        </button>
                                        <button
                                          class="text-surface-400 hover:text-surface-200 p-1 rounded"
                                          title="Expand to full width"
                                          @click="responseExpanded = true"
                                        >
                                          <i
                                            class="fas fa-expand-arrows-alt"
                                          ></i>
                                        </button>
                                      </div>
                                    </div>
                                    <div class="flex-1 overflow-auto min-h-0">
                                      <CodeEditor
                                        v-if="selectedResult.response"
                                        :content="selectedResult.response.body"
                                        language="json"
                                        :read-only="true"
                                        :font-size="12"
                                      />
                                      <div
                                        v-else
                                        class="h-full flex items-center justify-center text-surface-500"
                                      >
                                        <div class="text-center">
                                          <i
                                            class="fas fa-times-circle text-3xl mb-3"
                                          ></i>
                                          <div>No response data available</div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <!-- Expanded Layouts (stacked vertically with container scrolling and 45% height each) -->
                                <div v-else class="h-full overflow-auto">
                                  <div
                                    class="p-3 space-y-3 h-full flex flex-col gap-3"
                                  >
                                    <!-- Attack Payload (45% of container height when stacked) -->
                                    <div
                                      class="border border-surface-600 rounded flex-1"
                                    >
                                      <div
                                        class="flex items-center justify-between p-3 bg-surface-800 border-b border-surface-600"
                                      >
                                        <div>
                                          <div
                                            class="text-sm font-medium text-surface-200"
                                          >
                                            Attack Payload
                                          </div>
                                          <div class="text-xs text-surface-400">
                                            {{ selectedResult.attackType }}
                                            attack payload
                                          </div>
                                        </div>
                                        <div class="flex items-center gap-2">
                                          <button
                                            class="text-surface-400 hover:text-surface-200 p-1 rounded"
                                            title="Copy payload"
                                            @click="
                                              copyToClipboard(
                                                selectedResult.payload,
                                              )
                                            "
                                          >
                                            <i class="fas fa-copy"></i>
                                          </button>
                                          <button
                                            class="text-surface-400 hover:text-surface-200 p-1 rounded"
                                            title="Back to side-by-side"
                                            @click="
                                              payloadExpanded = false;
                                              responseExpanded = false;
                                            "
                                          >
                                            <i
                                              class="fas fa-compress-arrows-alt"
                                            ></i>
                                          </button>
                                        </div>
                                      </div>
                                      <div class="h-full overflow-auto min-h-0">
                                        <CodeEditor
                                          :content="selectedResult.payload"
                                          language="json"
                                          :read-only="true"
                                          :font-size="12"
                                        />
                                      </div>
                                    </div>

                                    <!-- Attack Response (45% of container height when stacked) -->
                                    <div
                                      class="border border-surface-600 rounded flex-1"
                                    >
                                      <div
                                        class="flex items-center justify-between p-3 bg-surface-800 border-b border-surface-600"
                                      >
                                        <div>
                                          <div
                                            class="text-sm font-medium text-surface-200"
                                          >
                                            Attack Response
                                          </div>
                                          <div class="text-xs text-surface-400">
                                            {{
                                              selectedResult.response
                                                ? `${selectedResult.response.body.length} bytes`
                                                : "No response"
                                            }}
                                          </div>
                                        </div>
                                        <div class="flex items-center gap-2">
                                          <button
                                            v-if="selectedResult.response"
                                            class="text-surface-400 hover:text-surface-200 p-1 rounded"
                                            title="Copy response"
                                            @click="
                                              copyToClipboard(
                                                selectedResult.response.body,
                                              )
                                            "
                                          >
                                            <i class="fas fa-copy"></i>
                                          </button>
                                        </div>
                                      </div>
                                      <div class="h-full overflow-auto min-h-0">
                                        <CodeEditor
                                          v-if="selectedResult.response"
                                          :content="
                                            selectedResult.response.body
                                          "
                                          language="json"
                                          :read-only="true"
                                          :font-size="12"
                                        />
                                        <div
                                          v-else
                                          class="h-full flex items-center justify-center text-surface-500"
                                        >
                                          <div class="text-center">
                                            <i
                                              class="fas fa-times-circle text-3xl mb-3"
                                            ></i>
                                            <div>
                                              No response data available
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </TabPanel>

                            <!-- Security Findings Tab (show for all attacks with findings) -->
                            <TabPanel
                              v-if="selectedResult.findings.length > 0"
                              header="Security Findings"
                              :pt="{ content: { class: 'h-full p-0' } }"
                            >
                              <div class="h-full overflow-auto p-3">
                                <div class="space-y-4">
                                  <div
                                    v-for="finding in selectedResult.findings"
                                    :key="finding.title"
                                    class="border rounded p-4"
                                    :class="{
                                      'border-red-500 bg-red-950 bg-opacity-20':
                                        finding.severity === 'critical' ||
                                        finding.severity === 'high',
                                      'border-yellow-500 bg-yellow-950 bg-opacity-20':
                                        finding.severity === 'medium',
                                      'border-blue-500 bg-blue-950 bg-opacity-20':
                                        finding.severity === 'low',
                                      'border-gray-500 bg-gray-950 bg-opacity-20':
                                        finding.severity === 'info',
                                    }"
                                  >
                                    <div
                                      class="flex items-start justify-between mb-3"
                                    >
                                      <h5
                                        class="font-semibold text-surface-100 flex-1"
                                      >
                                        {{ finding.title }}
                                      </h5>
                                      <div class="flex items-center gap-2 ml-4">
                                        <span
                                          class="px-2 py-1 rounded text-xs font-medium uppercase"
                                          :class="{
                                            'bg-red-600 text-red-100':
                                              finding.severity === 'critical',
                                            'bg-red-500 text-red-100':
                                              finding.severity === 'high',
                                            'bg-yellow-500 text-yellow-100':
                                              finding.severity === 'medium',
                                            'bg-blue-500 text-blue-100':
                                              finding.severity === 'low',
                                            'bg-gray-500 text-gray-100':
                                              finding.severity === 'info',
                                          }"
                                        >
                                          {{ finding.severity }}
                                        </span>

                                        <!-- Create Finding Button (for all severities) -->
                                        <Button
                                          label="Create Finding"
                                          icon="fas fa-plus"
                                          size="small"
                                          :severity="
                                            finding.severity === 'critical' ||
                                            finding.severity === 'high'
                                              ? 'danger'
                                              : finding.severity === 'medium'
                                                ? 'warn'
                                                : finding.severity === 'low'
                                                  ? 'info'
                                                  : 'secondary'
                                          "
                                          @click="createCaidoFinding(finding)"
                                        />
                                      </div>
                                    </div>

                                    <p
                                      class="text-sm text-surface-300 mb-3 leading-relaxed"
                                    >
                                      {{ finding.description }}
                                    </p>

                                    <div v-if="finding.evidence" class="mb-3">
                                      <div
                                        class="text-xs font-medium text-surface-400 mb-2"
                                      >
                                        Evidence:
                                      </div>
                                      <div
                                        class="text-xs font-mono text-surface-200 bg-surface-800 p-3 rounded border overflow-auto max-h-32"
                                      >
                                        {{ finding.evidence }}
                                      </div>
                                    </div>

                                    <div
                                      v-if="finding.recommendation"
                                      class="bg-blue-950 bg-opacity-30 border border-blue-700 rounded p-3"
                                    >
                                      <div
                                        class="text-xs font-medium text-blue-300 mb-2"
                                      >
                                        <i class="fas fa-lightbulb"></i>
                                        Recommendation:
                                      </div>
                                      <div
                                        class="text-sm text-blue-200 leading-relaxed"
                                      >
                                        {{ finding.recommendation }}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </TabPanel>
                          </TabView>
                        </div>
                      </div>
                    </template>
                  </Card>
                </SplitterPanel>
              </Splitter>
            </div>

            <!-- Empty State -->
            <div v-else class="flex-1 flex items-center justify-center">
              <div class="text-center text-surface-500">
                <i class="fas fa-shield-alt text-4xl mb-4"></i>
                <div class="text-lg mb-2">No attack results</div>
                <div class="text-sm">
                  Configure and execute attacks to see results here
                </div>
              </div>
            </div>
          </div>
        </SplitterPanel>
      </Splitter>
    </div>
  </div>
</template>
