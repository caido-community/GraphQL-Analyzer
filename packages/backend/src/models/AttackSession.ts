import type { AttackConfig, AttackResult, AttackType } from "shared";

type AttackSessionStateBase = {
  config: AttackConfig;
  startTime: Date;
  totalAttacks: number;
};

type AttackSessionRunning = AttackSessionStateBase & {
  status: "running";
  progress: number;
  completedAttacks: number;
  currentAttack: AttackType;
  results: AttackResult[];
};

type AttackSessionCompleted = AttackSessionStateBase & {
  status: "completed";
  results: AttackResult[];
  completedAttacks: number;
  endTime: Date;
};

type AttackSessionFailed = AttackSessionStateBase & {
  status: "failed";
  error: string;
  endTime: Date;
  results: AttackResult[];
  completedAttacks: number;
};

type AttackSessionCancelled = AttackSessionStateBase & {
  status: "cancelled";
  endTime: Date;
  results: AttackResult[];
  completedAttacks: number;
};

export type AttackSessionState =
  | AttackSessionRunning
  | AttackSessionCompleted
  | AttackSessionFailed
  | AttackSessionCancelled;

export function createRunningSession(
  config: AttackConfig,
  totalAttacks: number,
  currentAttack: AttackType,
): AttackSessionRunning {
  return {
    status: "running",
    config,
    startTime: new Date(),
    totalAttacks,
    progress: 0,
    completedAttacks: 0,
    currentAttack,
    results: [],
  };
}

export function toCompletedSession(
  session: AttackSessionState,
): AttackSessionCompleted {
  return {
    status: "completed",
    config: session.config,
    startTime: session.startTime,
    totalAttacks: session.totalAttacks,
    results: session.status === "running" ? session.results : session.results,
    completedAttacks:
      session.status === "running"
        ? session.completedAttacks
        : session.completedAttacks,
    endTime: new Date(),
  };
}

export function toFailedSession(
  session: AttackSessionState,
  error: string,
): AttackSessionFailed {
  return {
    status: "failed",
    config: session.config,
    startTime: session.startTime,
    totalAttacks: session.totalAttacks,
    error,
    endTime: new Date(),
    results: session.status === "running" ? session.results : session.results,
    completedAttacks:
      session.status === "running"
        ? session.completedAttacks
        : session.completedAttacks,
  };
}

export function toCancelledSession(
  session: AttackSessionState,
): AttackSessionCancelled {
  return {
    status: "cancelled",
    config: session.config,
    startTime: session.startTime,
    totalAttacks: session.totalAttacks,
    endTime: new Date(),
    results: session.status === "running" ? session.results : session.results,
    completedAttacks:
      session.status === "running"
        ? session.completedAttacks
        : session.completedAttacks,
  };
}
