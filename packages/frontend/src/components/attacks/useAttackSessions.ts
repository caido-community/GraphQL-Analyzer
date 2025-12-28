import type { AttackSession } from "shared";
import { computed, ref } from "vue";

import { useSDK } from "@/plugins/sdk";

export function useAttackSessions() {
  const sdk = useSDK();
  const attackSessions = ref<AttackSession[]>([]);
  const selectedAttackSessionId = ref<string | undefined>(undefined);

  const selectedAttackSession = computed(() => {
    if (selectedAttackSessionId.value === undefined) {
      return undefined;
    }
    return attackSessions.value.find(
      (s) => s.id === selectedAttackSessionId.value,
    );
  });

  const saveAttackSessions = async () => {
    try {
      const currentStorage = (sdk.storage.get() as Record<string, unknown>) ??
        {};
      currentStorage.attackSessions = attackSessions.value;
      currentStorage.selectedAttackSessionId = selectedAttackSessionId.value;

      await sdk.storage.set(
        currentStorage as unknown as Record<string, never>,
      );
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
        attackSessions.value = stored.attackSessions.map((s) => ({
          ...s,
          createdAt: new Date(s.createdAt),
          completedAt: s.completedAt ? new Date(s.completedAt) : undefined,
        }));
      } else {
        attackSessions.value = [];
      }

      if (
        stored?.selectedAttackSessionId !== undefined &&
        attackSessions.value.find(
          (s) => s.id === stored?.selectedAttackSessionId,
        ) !== undefined
      ) {
        selectedAttackSessionId.value = stored.selectedAttackSessionId;
      } else if (attackSessions.value.length > 0) {
        selectedAttackSessionId.value = attackSessions.value[0]?.id ?? undefined;
      } else {
        selectedAttackSessionId.value = undefined;
      }
    } catch (error) {
      attackSessions.value = [];
      selectedAttackSessionId.value = undefined;
    }
  };

  const selectAttackSession = (sessionId: string) => {
    selectedAttackSessionId.value = sessionId;
  };

  const createAttackSession = (session: AttackSession) => {
    attackSessions.value.unshift(session);
    selectedAttackSessionId.value = session.id;
  };

  const updateAttackSession = (
    sessionId: string,
    updates: Partial<AttackSession>,
  ) => {
    const index = attackSessions.value.findIndex((s) => s.id === sessionId);
    if (index !== -1 && attackSessions.value[index] !== undefined) {
      const existing = attackSessions.value[index];
      if (existing !== undefined) {
        attackSessions.value[index] = {
          ...existing,
          ...updates,
        } as AttackSession;
      }
    }
  };

  const deleteAttackSession = (sessionId: string) => {
    const index = attackSessions.value.findIndex((s) => s.id === sessionId);
    if (index !== -1) {
      attackSessions.value.splice(index, 1);
      if (selectedAttackSessionId.value === sessionId) {
        selectedAttackSessionId.value =
          attackSessions.value.length > 0
            ? (attackSessions.value[0]?.id ?? undefined)
            : undefined;
      }
    }
  };

  const renameAttackSession = (sessionId: string, newTitle: string) => {
    updateAttackSession(sessionId, { title: newTitle });
  };

  return {
    attackSessions,
    selectedAttackSessionId,
    selectedAttackSession,
    loadAttackSessions,
    saveAttackSessions,
    selectAttackSession,
    createAttackSession,
    updateAttackSession,
    deleteAttackSession,
    renameAttackSession,
  };
}

