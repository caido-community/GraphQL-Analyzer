import type { AttackConfig, AttackResult, AttackType } from "shared";

import {
  type AttackSessionState,
  createRunningSession,
  toCancelledSession,
  toCompletedSession,
  toFailedSession,
} from "../../models";

const attackSessions = new Map<string, AttackSessionState>();

export function createSession(
  config: AttackConfig,
  currentAttack: AttackType,
): string {
  const sessionId = `attack-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  attackSessions.set(
    sessionId,
    createRunningSession(config, config.attackTypes.length, currentAttack),
  );
  return sessionId;
}

export function updateSessionProgress(
  sessionId: string,
  progress: number,
  completedAttacks: number,
  currentAttack: AttackType,
  result?: AttackResult,
): void {
  const session = attackSessions.get(sessionId);
  if (!session || session.status !== "running") return;

  const updated: AttackSessionState = {
    ...session,
    status: "running",
    progress,
    completedAttacks,
    currentAttack,
    results: result ? [...session.results, result] : session.results,
  };
  attackSessions.set(sessionId, updated);
}

export function completeSession(sessionId: string): void {
  const session = attackSessions.get(sessionId);
  if (!session) return;
  attackSessions.set(sessionId, toCompletedSession(session));
}

export function failSession(sessionId: string, error: string): void {
  const session = attackSessions.get(sessionId);
  if (!session) return;
  attackSessions.set(sessionId, toFailedSession(session, error));
}

export function cancelSession(sessionId: string): boolean {
  const session = attackSessions.get(sessionId);
  if (!session) return false;
  attackSessions.set(sessionId, toCancelledSession(session));
  return true;
}

export function isSessionCancelled(sessionId: string): boolean {
  const session = attackSessions.get(sessionId);
  return session?.status === "cancelled";
}

export function getSessionStatus(sessionId: string):
  | {
      status: string;
      progress: number;
      results: AttackResult[];
      totalAttacks: number;
      completedAttacks: number;
      isComplete: boolean;
    }
  | undefined {
  const session = attackSessions.get(sessionId);
  if (!session) return undefined;

  return {
    status: session.status,
    progress: session.status === "running" ? session.progress : 100,
    results: session.results,
    totalAttacks: session.totalAttacks,
    completedAttacks: session.completedAttacks,
    isComplete: session.status !== "running",
  };
}
