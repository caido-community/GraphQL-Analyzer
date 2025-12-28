import type { GraphQLSchema } from "shared";
import { computed, ref } from "vue";

import { useSDK } from "@/plugins/sdk";

export type ExplorerSession = {
  id: string;
  title: string;
  url: string;
  schema?: GraphQLSchema;
  supportsIntrospection: boolean;
  createdAt: Date;
  status: string;
};

export const useSessions = () => {
  const sdk = useSDK();
  const sessions = ref<ExplorerSession[]>([]);
  const selectedSessionId = ref<string | null>(null);

  const selectedSession = computed(() => {
    return sessions.value.find(
      (s: ExplorerSession) => s.id === selectedSessionId.value,
    );
  });

  const saveAllData = async () => {
    try {
      const currentStorage: any = sdk.storage.get() || {};
      currentStorage.explorerSessions = sessions.value;
      currentStorage.selectedExplorerSessionId = selectedSessionId.value;
      // @ts-expect-error - SDK storage.set accepts any object
      await sdk.storage.set(currentStorage);
    } catch (error) {
      sdk.window.showToast("Failed to save session data", { variant: "error" });
    }
  };

  const loadSessions = async () => {
    try {
      const stored = sdk.storage.get() as {
        explorerSessions?: any[];
        selectedExplorerSessionId?: string;
      } | null;

      if (stored?.explorerSessions && Array.isArray(stored.explorerSessions)) {
        sessions.value = stored.explorerSessions.map((s: any) => ({
          ...s,
          createdAt: new Date(s.createdAt),
        }));
      } else {
        sessions.value = [];
      }

      if (
        stored?.selectedExplorerSessionId &&
        sessions.value.find(
          (s: ExplorerSession) => s.id === stored?.selectedExplorerSessionId,
        )
      ) {
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

  const selectSession = async (sessionId: string) => {
    selectedSessionId.value = sessionId;
    await saveAllData();
  };

  const deleteSession = async (sessionId: string) => {
    const index = sessions.value.findIndex(
      (s: ExplorerSession) => s.id === sessionId,
    );
    if (index !== -1) {
      sessions.value.splice(index, 1);
      if (selectedSessionId.value === sessionId) {
        selectedSessionId.value =
          sessions.value.length > 0 ? sessions.value[0]?.id || null : null;
      }
      await saveAllData();
    }
  };

  const renameSession = async (sessionId: string, newTitle: string) => {
    const session = sessions.value.find((s) => s.id === sessionId);
    if (session) {
      session.title = newTitle;
      await saveAllData();
    }
  };

  const clearAllData = async () => {
    sessions.value = [];
    selectedSessionId.value = null;

    try {
      const currentStorage: any = sdk.storage.get() || {};
      currentStorage.explorerSessions = [];
      currentStorage.selectedExplorerSessionId = null;
      // @ts-expect-error - SDK storage.set accepts any object
      await sdk.storage.set(currentStorage);
      sdk.window.showToast("All sessions and data cleared successfully", {
        variant: "success",
      });
    } catch (error) {
      sdk.window.showToast("Failed to clear data", { variant: "error" });
    }
  };

  return {
    sessions,
    selectedSessionId,
    selectedSession,
    loadSessions,
    selectSession,
    deleteSession,
    renameSession,
    clearAllData,
    saveAllData,
  };
};
