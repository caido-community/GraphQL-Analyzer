import type {
  DashboardActivity,
  ExplorerSessionData,
  Result,
  SchemaImportResult,
} from "shared";

import { useSDK } from "@/plugins/sdk";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

type StorageData = {
  explorerSessions?: ExplorerSessionData[];
  selectedExplorerSessionId?: string;
  dashboardActivities?: DashboardActivity[];
};

export function useSchemaImport(
  navigateTo?: (
    page: "Dashboard" | "Explorer" | "Voyager" | "Attacks" | "History",
  ) => void,
  onSessionsChanged?: () => void,
) {
  const sdk = useSDK();

  const importSchemaFile = async (
    fileContent: string,
    fileName: string,
  ): Promise<boolean> => {
    try {
      const result: Result<SchemaImportResult & { fileName: string }> =
        await sdk.backend.importSchemaFromFile(fileContent, fileName);

      if (result.kind === "Error") {
        sdk.window.showToast(`Import failed: ${result.error}`, {
          variant: "error",
        });
        return false;
      }

      const currentStorage: StorageData =
        (sdk.storage.get() as StorageData | undefined) ?? {};

      if (
        currentStorage.explorerSessions === undefined ||
        !Array.isArray(currentStorage.explorerSessions)
      ) {
        currentStorage.explorerSessions = [];
      }

      if (
        currentStorage.dashboardActivities === undefined ||
        !Array.isArray(currentStorage.dashboardActivities)
      ) {
        currentStorage.dashboardActivities = [];
      }

      const displayName = fileName.replace(/\.(json|graphql|gql)$/i, "");

      const sessionData: ExplorerSessionData = {
        id: generateId(),
        title: displayName,
        url: `file://${fileName}`,
        schema: result.value.schema,
        supportsIntrospection: true,
        createdAt: new Date(),
        status: "success",
        sourceType: "file-import",
      };

      currentStorage.explorerSessions.push(sessionData);
      currentStorage.selectedExplorerSessionId = sessionData.id;

      const activityData: DashboardActivity = {
        id: generateId(),
        title: `Schema import: ${displayName}`,
        url: `file://${fileName}`,
        description: `Imported from ${fileName} (${result.value.format})`,
        createdAt: new Date(),
        status: "success",
        type: "scan",
      };

      currentStorage.dashboardActivities.unshift(activityData);

      if (currentStorage.dashboardActivities.length > 20) {
        currentStorage.dashboardActivities =
          currentStorage.dashboardActivities.slice(0, 20);
      }

      await sdk.storage.set(currentStorage as unknown as Record<string, never>);

      onSessionsChanged?.();

      window.dispatchEvent(
        new CustomEvent("graphql-analyzer-sessions-updated"),
      );

      sdk.window.showToast(`Schema imported successfully from "${fileName}"!`, {
        variant: "success",
      });

      setTimeout(() => {
        if (navigateTo !== undefined) {
          navigateTo("Explorer");
        }
      }, 800);

      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      sdk.window.showToast(`Import failed: ${errorMsg}`, { variant: "error" });
      return false;
    }
  };

  return {
    importSchemaFile,
  };
}
