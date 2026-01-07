import { computed, ref } from "vue";

import { useSDK } from "@/plugins/sdk";

import type { ExplorerSession } from "./types";

export function useVoyagerSessions() {
  const sdk = useSDK();
  const sessions = ref<ExplorerSession[]>([]);
  const selectedSessionId = ref<string | undefined>(undefined);

  const selectedSession = computed(() =>
    sessions.value.find((s: ExplorerSession) => s.id === selectedSessionId.value),
  );

  const introspectionSessions = computed(() =>
    sessions.value.filter(
      (s: ExplorerSession) => s.supportsIntrospection === true,
    ),
  );

  const loadSessions = async () => {
    try {
      const stored = sdk.storage.get() as
        | {
            explorerSessions?: ExplorerSession[];
            selectedExplorerSessionId?: string;
            "voyager-auto-select-session"?: string;
            "voyager-selected-session-id"?: string;
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

        const autoSelectSessionId = stored["voyager-auto-select-session"];
        if (
          autoSelectSessionId !== undefined &&
          autoSelectSessionId !== null &&
          autoSelectSessionId !== ""
        ) {
          const sessionToSelect = sessions.value.find(
            (s: ExplorerSession) => s.id === autoSelectSessionId,
          );
          if (sessionToSelect !== undefined) {
            await selectSession(autoSelectSessionId);
          }

          const updatedStorage: Record<string, unknown> = { ...stored };
          delete updatedStorage["voyager-auto-select-session"];
          await sdk.storage.set(
            updatedStorage as unknown as Record<string, never>,
          );
          return;
        }

        const persistedSessionId = stored["voyager-selected-session-id"];
        if (
          persistedSessionId !== undefined &&
          persistedSessionId !== null &&
          persistedSessionId !== ""
        ) {
          const sessionToSelect = sessions.value.find(
            (s: ExplorerSession) => s.id === persistedSessionId,
          );
          if (sessionToSelect !== undefined) {
            selectedSessionId.value = persistedSessionId;
            await selectSession(persistedSessionId);
            return;
          }
        }
      } else {
        sessions.value = [];
      }

      selectedSessionId.value = undefined;
    } catch {
      sessions.value = [];
      selectedSessionId.value = undefined;
    }
  };

  const selectSession = async (sessionId: string) => {
    selectedSessionId.value = sessionId;

    const currentStorage = (sdk.storage.get() as Record<string, unknown>) ?? {};
    currentStorage["voyager-selected-session-id"] = sessionId;
    await sdk.storage.set(currentStorage as unknown as Record<string, never>);

    sdk.window.showToast("Loading the graph for you...", { variant: "info" });
  };

  const handleStorageChange = async () => {
    const currentSelectedId = selectedSessionId.value;
    await loadSessions();

    const stored = sdk.storage.get() as
      | {
          "voyager-selected-session-id"?: string;
        }
      | undefined;

    const persistedSessionId = stored?.["voyager-selected-session-id"];
    if (
      persistedSessionId !== undefined &&
      persistedSessionId !== null &&
      persistedSessionId !== ""
    ) {
      const sessionToSelect = sessions.value.find(
        (s: ExplorerSession) => s.id === persistedSessionId,
      );
      if (sessionToSelect !== undefined) {
        selectedSessionId.value = persistedSessionId;
        await selectSession(persistedSessionId);
        return;
      }
    }

    if (
      currentSelectedId !== undefined &&
      sessions.value.some((s) => s.id === currentSelectedId)
    ) {
      selectedSessionId.value = currentSelectedId;
      await selectSession(currentSelectedId);
    }
  };

  return {
    sessions,
    selectedSessionId,
    selectedSession,
    introspectionSessions,
    loadSessions,
    selectSession,
    handleStorageChange,
  };
}

