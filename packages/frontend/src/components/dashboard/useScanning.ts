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
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
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
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
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

          // @ts-expect-error - SDK storage.set accepts any object
          await sdk.storage.set(currentStorage);
          loadRecentSessions();

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

          // @ts-expect-error - SDK storage.set accepts any object
          await sdk.storage.set(currentStorage);
          loadRecentSessions();

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

  const selectSession = (session: DashboardActivity) => {
    if (session.type === "attack") {
      if (navigateTo !== undefined) {
        localStorage.setItem(
          "graphql-analyzer-navigate-to-attack",
          session.attackSessionId ?? "",
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
      // @ts-expect-error - SDK storage.set accepts any object
      await sdk.storage.set(emptyStorage);

      recentSessions.value = [];

      sdk.window.showToast("All sessions and data deleted successfully", {
        variant: "success",
      });
    } catch (error) {
      sdk.window.showToast("Failed to delete all data", { variant: "error" });
    }
  };

  const handleContextScan = (event: CustomEvent) => {
    const url = event.detail.url;
    const headers = event.detail.headers;

    if (url !== undefined && url !== "") {
      scanUrl.value = url;

      if (headers !== undefined && Object.keys(headers).length > 0) {
        customHeaders.value = [];
        Object.entries(headers).forEach(([key, value]) => {
          if (
            key.toLowerCase() !== "content-length" &&
            key !== "" &&
            value !== undefined &&
            value !== ""
          ) {
            customHeaders.value.push({ name: key, value: value as string });
          }
        });
      }

      handleScan();
    }
  };

  onMounted(() => {
    window.addEventListener(
      "graphql-analyzer-context-scan",
      handleContextScan as EventListener,
    );

    const pendingUrl = localStorage.getItem(
      "graphql-analyzer-context-scan-url",
    );
    const pendingHeaders = localStorage.getItem(
      "graphql-analyzer-context-scan-headers",
    );
    const scanProcessed = sessionStorage.getItem(
      "graphql-analyzer-scan-processed",
    );

    if (pendingUrl !== null && pendingUrl !== "" && scanProcessed === null) {
      scanUrl.value = pendingUrl;

      if (pendingHeaders !== null && pendingHeaders !== "") {
        try {
          const headers = JSON.parse(pendingHeaders) as Record<string, string>;
          if (Object.keys(headers).length > 0) {
            customHeaders.value = [];
            Object.entries(headers).forEach(([key, value]) => {
              if (
                key.toLowerCase() !== "content-length" &&
                key !== "" &&
                value !== undefined &&
                value !== ""
              ) {
                customHeaders.value.push({ name: key, value: value });
              }
            });
          }
        } catch {
          // Ignore parse errors
        }
      }

      localStorage.removeItem("graphql-analyzer-context-scan-url");
      localStorage.removeItem("graphql-analyzer-context-scan-headers");
      sessionStorage.setItem("graphql-analyzer-scan-processed", "true");

      setTimeout(() => handleScan(), 100);
    }
  });

  onUnmounted(() => {
    window.removeEventListener(
      "graphql-analyzer-context-scan",
      handleContextScan as EventListener,
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
