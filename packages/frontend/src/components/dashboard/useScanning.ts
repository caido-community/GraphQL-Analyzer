import type { Result } from "shared";
import { computed, onMounted, onUnmounted, ref } from "vue";

import { useSDK } from "@/plugins/sdk";

export function useScanning(
  navigateTo?: (
    page: "Dashboard" | "Explorer" | "Voyager" | "Attacks" | "History",
  ) => void,
) {
  const sdk = useSDK();

  const scanUrl = ref("");
  const isScanning = ref(false);
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

  const recentSessions = ref<DashboardActivity[]>([]);
  const customHeaders = ref<Array<{ name: string; value: string }>>([]);
  const isProcessingScanRequest = ref(false);

  const addCustomHeader = () => {
    if (customHeaders.value.length < 20) {
      customHeaders.value.push({ name: "", value: "" });
    }
  };

  const removeCustomHeader = (index: number) => {
    customHeaders.value.splice(index, 1);
  };

  const parsedHeaders = computed(() => {
    const headers: Record<string, string> = {};
    customHeaders.value.forEach((header) => {
      if (header.name.trim() && header.value.trim()) {
        headers[header.name.trim()] = header.value.trim();
      }
    });
    return headers;
  });

  const getDomainName = (url: string): string => {
    try {
      return new URL(url).hostname;
    } catch {
      return "Unknown";
    }
  };

  const loadRecentSessions = (): void => {
    try {
      const stored = sdk.storage.get() as
        | {
            dashboardActivities?: DashboardActivity[];
          }
        | undefined;
      if (
        stored?.dashboardActivities !== undefined &&
        Array.isArray(stored.dashboardActivities)
      ) {
        recentSessions.value = stored.dashboardActivities
          .map((s) => ({
            ...s,
            createdAt: new Date(s.createdAt),
          }))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      } else {
        recentSessions.value = [];
      }
    } catch (error) {
      recentSessions.value = [];
    }
  };

  const handleScan = async () => {
    if (!scanUrl.value.trim()) {
      sdk.window.showToast("Please enter a GraphQL endpoint URL", {
        variant: "warning",
      });
      return;
    }

    try {
      const url = new URL(scanUrl.value.trim());
      if (!["http:", "https:"].includes(url.protocol)) {
        sdk.window.showToast(
          "Invalid URL: Only HTTP and HTTPS protocols are supported",
          { variant: "error" },
        );
        return;
      }
    } catch (error) {
      sdk.window.showToast(
        "Invalid URL format. Please enter a valid URL (e.g., https://example.com/graphql)",
        { variant: "error" },
      );
      return;
    }

    isScanning.value = true;

    try {
      const validHeaders: Record<string, string> = {};
      Object.entries(parsedHeaders.value).forEach(([key, value]) => {
        if (key && value && typeof value === "string") {
          validHeaders[key] = value;
        }
      });

      const headersToSend =
        Object.keys(validHeaders).length > 0 ? validHeaders : {};

      const result: Result<{
        supportsIntrospection: boolean;
        schema?: unknown;
      }> = await sdk.backend.testGraphQLEndpoint(
        scanUrl.value.trim(),
        headersToSend,
      );

      if (result.kind === "Error") {
        sdk.window.showToast(`Scan failed: ${result.error}`, {
          variant: "error",
        });
      } else {
        type StorageData = {
          explorerSessions?: Array<{
            id: string;
            title: string;
            url: string;
            schema?: unknown;
            supportsIntrospection?: boolean;
            createdAt: Date;
            status: string;
          }>;
          selectedExplorerSessionId?: string;
          dashboardActivities?: DashboardActivity[];
        };
        const currentStorage: StorageData =
          (sdk.storage.get() as StorageData | undefined) ?? {};

        if (
          currentStorage.dashboardActivities === undefined ||
          !Array.isArray(currentStorage.dashboardActivities)
        ) {
          currentStorage.dashboardActivities = [];
        }

        if (
          result.value.supportsIntrospection === true &&
          result.value.schema !== undefined
        ) {
          const sessionData = {
            id:
              Date.now().toString(36) + Math.random().toString(36).substring(2),
            title: getDomainName(scanUrl.value.trim()),
            url: scanUrl.value.trim(),
            schema: result.value.schema,
            supportsIntrospection: true,
            createdAt: new Date(),
            status: "success",
          };

          if (
            currentStorage.explorerSessions === undefined ||
            !Array.isArray(currentStorage.explorerSessions)
          ) {
            currentStorage.explorerSessions = [];
          }

          currentStorage.explorerSessions.push(sessionData);
          currentStorage.selectedExplorerSessionId = sessionData.id;

          const activityData = {
            id:
              Date.now().toString(36) + Math.random().toString(36).substring(2),
            title: `Schema scan: ${sessionData.title}`,
            url: sessionData.url,
            description: "Successfully scanned GraphQL schema",
            createdAt: sessionData.createdAt,
            status: "success",
            type: "scan",
          };

          currentStorage.dashboardActivities.unshift(activityData);

          if (currentStorage.dashboardActivities.length > 20) {
            currentStorage.dashboardActivities =
              currentStorage.dashboardActivities.slice(0, 20);
          }

          await sdk.storage.set(
            currentStorage as unknown as Record<string, never>,
          );
          loadRecentSessions();
          window.dispatchEvent(
            new CustomEvent("graphql-analyzer-sessions-updated"),
          );

          sdk.window.showToast("Schema scanned successfully!", {
            variant: "success",
          });
          scanUrl.value = "";
          customHeaders.value = [];

          setTimeout(() => {
            if (navigateTo) {
              navigateTo("Explorer");
            }
          }, 800);
        } else {
          const activityData: DashboardActivity = {
            id:
              Date.now().toString(36) + Math.random().toString(36).substring(2),
            title: `Scan attempted: ${getDomainName(scanUrl.value.trim())}`,
            url: scanUrl.value.trim(),
            description: "GraphQL endpoint found but introspection is disabled",
            createdAt: new Date(),
            status: "warning",
            type: "scan",
          };

          currentStorage.dashboardActivities.unshift(activityData);

          if (currentStorage.dashboardActivities.length > 20) {
            currentStorage.dashboardActivities =
              currentStorage.dashboardActivities.slice(0, 20);
          }

          await sdk.storage.set(
            currentStorage as unknown as Record<string, never>,
          );
          loadRecentSessions();
          window.dispatchEvent(
            new CustomEvent("graphql-analyzer-sessions-updated"),
          );

          sdk.window.showToast(
            "GraphQL endpoint detected, but introspection is disabled. Cannot explore schema.",
            { variant: "warning" },
          );
          scanUrl.value = "";
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      sdk.window.showToast(
        `Scan failed: ${errorMsg}. Please check the URL and try again.`,
        { variant: "error" },
      );
    } finally {
      isScanning.value = false;
    }
  };

  const selectSession = async (session: DashboardActivity) => {
    if (session.type === "attack") {
      if (navigateTo !== undefined) {
        const currentStorage =
          (sdk.storage.get() as Record<string, unknown>) ?? {};
        currentStorage["graphql-analyzer-navigate-to-attack"] =
          session.attackSessionId ?? "";
        await sdk.storage.set(
          currentStorage as unknown as Record<string, never>,
        );
        navigateTo("Attacks");
      }
      return;
    }

    if (navigateTo !== undefined) {
      navigateTo("Explorer");
    }
  };

  const deleteAllData = async (): Promise<void> => {
    try {
      const emptyStorage: Record<string, unknown> = {};

      await sdk.storage.set(emptyStorage as unknown as Record<string, never>);

      recentSessions.value = [];

      sdk.window.showToast("All sessions and data deleted successfully", {
        variant: "success",
      });
    } catch (error) {
      sdk.window.showToast("Failed to delete all data", { variant: "error" });
    }
  };

  const handleContextScanRequest = async (event: CustomEvent) => {
    const requestId = event.detail?.requestId;
    if (
      requestId === undefined ||
      requestId === null ||
      requestId === "" ||
      isProcessingScanRequest.value === true
    ) {
      return;
    }

    isProcessingScanRequest.value = true;
    isScanning.value = true;

    try {
      const result = await sdk.backend.testGraphQLEndpointFromRequest(
        requestId,
        parsedHeaders.value,
      );

      if (result.kind === "Error") {
        sdk.window.showToast(`Scan failed: ${result.error}`, {
          variant: "error",
        });
        isScanning.value = false;
        isProcessingScanRequest.value = false;
        return;
      }

      type StorageData = {
        explorerSessions?: Array<{
          id: string;
          title: string;
          url: string;
          schema?: unknown;
          supportsIntrospection?: boolean;
          createdAt: Date;
          status: string;
          requestId?: string;
        }>;
        selectedExplorerSessionId?: string;
        dashboardActivities?: DashboardActivity[];
      };
      const currentStorage: StorageData =
        (sdk.storage.get() as StorageData | undefined) ?? {};

      if (
        currentStorage.dashboardActivities === undefined ||
        !Array.isArray(currentStorage.dashboardActivities)
      ) {
        currentStorage.dashboardActivities = [];
      }

      if (
        result.value.supportsIntrospection === true &&
        result.value.schema !== undefined
      ) {
        const requestInfoResult = await sdk.backend.getRequestInfo(requestId);
        let domainName = "Unknown";
        let fullUrl = `request:${requestId}`;

        if (requestInfoResult.kind === "Ok") {
          try {
            const urlObj = new URL(requestInfoResult.value.url);
            domainName = urlObj.hostname;
            fullUrl = requestInfoResult.value.url;
          } catch {
            domainName = requestInfoResult.value.host || "Unknown";
          }
        }

        const sessionData = {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2),
          title: `${domainName} (${requestId.substring(0, 8)})`,
          url: fullUrl,
          schema: result.value.schema,
          supportsIntrospection: true,
          createdAt: new Date(),
          status: "success",
          requestId: requestId,
        };

        if (
          currentStorage.explorerSessions === undefined ||
          !Array.isArray(currentStorage.explorerSessions)
        ) {
          currentStorage.explorerSessions = [];
        }

        const existingSession = currentStorage.explorerSessions.find(
          (s) => s.requestId === requestId,
        );
        if (existingSession === undefined) {
          currentStorage.explorerSessions.push(sessionData);
        } else {
          const existingIndex = currentStorage.explorerSessions.findIndex(
            (s) => s.requestId === requestId,
          );
          if (existingIndex !== -1) {
            currentStorage.explorerSessions[existingIndex] = sessionData;
          }
        }
        currentStorage.selectedExplorerSessionId = sessionData.id;

        const activityData = {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2),
          title: `Schema scan ${domainName} (${requestId.substring(0, 8)})`,
          url: fullUrl,
          description: "GraphQL schema introspection scan",
          createdAt: new Date(),
          status: "success",
          type: "scan",
        };

        currentStorage.dashboardActivities.unshift(activityData);

        if (currentStorage.dashboardActivities.length > 20) {
          currentStorage.dashboardActivities =
            currentStorage.dashboardActivities.slice(0, 20);
        }

        await sdk.storage.set(
          currentStorage as unknown as Record<string, never>,
        );
        loadRecentSessions();
        window.dispatchEvent(
          new CustomEvent("graphql-analyzer-sessions-updated"),
        );

        sdk.window.showToast("Schema scanned successfully!", {
          variant: "success",
        });
        scanUrl.value = "";
        customHeaders.value = [];

        setTimeout(() => {
          if (navigateTo) {
            navigateTo("Explorer");
          }
        }, 800);
      } else {
        const activityData: DashboardActivity = {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2),
          title: `Scan attempted: Request ${requestId.substring(0, 8)}`,
          url: `request:${requestId}`,
          description: "GraphQL endpoint found but introspection is disabled",
          createdAt: new Date(),
          status: "warning",
          type: "scan",
        };

        currentStorage.dashboardActivities.unshift(activityData);

        if (currentStorage.dashboardActivities.length > 20) {
          currentStorage.dashboardActivities =
            currentStorage.dashboardActivities.slice(0, 20);
        }

        await sdk.storage.set(
          currentStorage as unknown as Record<string, never>,
        );
        loadRecentSessions();
        window.dispatchEvent(
          new CustomEvent("graphql-analyzer-sessions-updated"),
        );

        sdk.window.showToast(
          "GraphQL endpoint detected, but introspection is disabled. Cannot explore schema.",
          { variant: "warning" },
        );
        scanUrl.value = "";
      }

      isScanning.value = false;
      isProcessingScanRequest.value = false;

      const updatedStorage = sdk.storage.get() as Record<string, unknown>;
      delete updatedStorage["graphql-analyzer-context-scan-request-id"];
      await sdk.storage.set(updatedStorage as unknown as Record<string, never>);
    } catch (error) {
      isScanning.value = false;
      isProcessingScanRequest.value = false;
      sdk.window.showToast("Scan failed", { variant: "error" });
    }
  };

  onMounted(async () => {
    window.addEventListener(
      "graphql-analyzer-context-scan-request",
      handleContextScanRequest as unknown as EventListener,
    );

    const storage = sdk.storage.get() as
      | {
          "graphql-analyzer-context-scan-request-id"?: string;
        }
      | undefined;

    const pendingRequestId =
      storage?.["graphql-analyzer-context-scan-request-id"];

    if (
      pendingRequestId !== undefined &&
      pendingRequestId !== null &&
      pendingRequestId !== ""
    ) {
      await handleContextScanRequest({
        detail: { requestId: pendingRequestId },
      } as CustomEvent);
    }
  });

  onUnmounted(() => {
    window.removeEventListener(
      "graphql-analyzer-context-scan-request",
      handleContextScanRequest as unknown as EventListener,
    );
  });

  return {
    scanUrl,
    isScanning,
    customHeaders,
    parsedHeaders,
    recentSessions,
    addCustomHeader,
    removeCustomHeader,
    handleScan,
    loadRecentSessions,
    selectSession,
    deleteAllData,
  };
}
