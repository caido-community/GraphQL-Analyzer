import type { SDK } from "caido:plugin";
import type { AttackConfig, AttackResult, AttackType, Result } from "shared";

import { executeBatchAttack } from "./BatchAttack";
import { executeComplexityAttack } from "./ComplexityAttack";
import { executeDepthAttack } from "./DepthAttack";
import { executeFieldSuggestionAttack } from "./FieldSuggestionAttack";
import { executeIntrospectionAttack } from "./IntrospectionAttack";
import {
  cancelSession,
  completeSession,
  createSession,
  failSession,
  getSessionStatus,
  isSessionCancelled,
  updateSessionProgress,
} from "./sessionManager";

export async function executeAttacks(
  sdk: SDK,
  config: AttackConfig,
): Promise<Result<AttackResult[]>> {
  try {
    const results: AttackResult[] = [];

    for (const attackType of config.attackTypes) {
      const attackResult = await executeAttack(sdk, attackType, config);
      if (attackResult.kind === "Ok") {
        results.push(attackResult.value);
      } else {
        results.push({
          id: `${attackType}-${Date.now()}`,
          attackType,
          targetUrl: config.targetUrl,
          payload: "Attack failed to execute",
          sentAt: new Date(),
          findings: [],
          status: "failed",
          error: attackResult.error,
          requestsExecuted: 0,
          totalRequests: 1,
        });
      }
    }

    return { kind: "Ok", value: results };
  } catch (error) {
    return {
      kind: "Error",
      error:
        error instanceof Error
          ? error.message
          : "Unknown attack execution error",
    };
  }
}

async function executeAttack(
  sdk: SDK,
  attackType: AttackType,
  config: AttackConfig,
): Promise<Result<AttackResult>> {
  switch (attackType) {
    case "introspection":
      return executeIntrospectionAttack(sdk, config);
    case "depth-limit":
      return executeDepthAttack(sdk, config);
    case "query-complexity":
      return executeComplexityAttack(sdk, config);
    case "batch-query":
      return executeBatchAttack(sdk, config);
    case "field-suggestion":
      return executeFieldSuggestionAttack(sdk, config);
    default:
      return { kind: "Error", error: `Unknown attack type: ${attackType}` };
  }
}

export function startAttacksAsync(
  sdk: SDK,
  config: AttackConfig,
): Result<string> {
  const firstAttack = config.attackTypes[0];
  if (!firstAttack) {
    return { kind: "Error", error: "No attack types specified" };
  }

  const sessionId = createSession(config, firstAttack);

  executeAttacksRealTime(sdk, sessionId, config).catch((error) => {
    sdk.console.error(
      `Attack execution error: ${error instanceof Error ? error.message : String(error)}`,
    );
    failSession(
      sessionId,
      error instanceof Error ? error.message : "Unknown error",
    );
  });

  return { kind: "Ok", value: sessionId };
}

async function executeAttacksRealTime(
  sdk: SDK,
  sessionId: string,
  config: AttackConfig,
): Promise<void> {
  try {
    for (let i = 0; i < config.attackTypes.length; i++) {
      if (isSessionCancelled(sessionId)) break;

      const attackType = config.attackTypes[i];
      if (!attackType) continue;

      const progress = (i / config.attackTypes.length) * 100;
      updateSessionProgress(sessionId, progress, i, attackType);

      const attackResult = await executeAttack(sdk, attackType, config);

      const completedProgress = ((i + 1) / config.attackTypes.length) * 100;

      if (attackResult.kind === "Ok") {
        updateSessionProgress(
          sessionId,
          completedProgress,
          i + 1,
          attackType,
          attackResult.value,
        );
      } else {
        const failedResult: AttackResult = {
          id: `${attackType}-${Date.now()}`,
          attackType,
          targetUrl: config.targetUrl,
          payload: "Attack failed to execute",
          sentAt: new Date(),
          findings: [],
          status: "failed",
          error: attackResult.error,
          requestsExecuted: 0,
          totalRequests: 1,
        };
        updateSessionProgress(
          sessionId,
          completedProgress,
          i + 1,
          attackType,
          failedResult,
        );
      }
    }

    completeSession(sessionId);
  } catch (error) {
    failSession(
      sessionId,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}

export function getAttackStatus(sessionId: string): Result<{
  status: string;
  progress: number;
  results: AttackResult[];
  totalAttacks: number;
  completedAttacks: number;
  isComplete: boolean;
}> {
  const status = getSessionStatus(sessionId);
  if (!status) {
    return { kind: "Error", error: "Attack session not found" };
  }
  return { kind: "Ok", value: status };
}

export function cancelAttackSession(sessionId: string): Result<void> {
  if (!cancelSession(sessionId)) {
    return { kind: "Error", error: "Attack session not found" };
  }
  return { kind: "Ok", value: undefined };
}

export function generateAttackTemplates(): Record<
  AttackType,
  { name: string; description: string; query: string }
> {
  return {
    introspection: {
      name: "Schema Introspection",
      description: "Attempts to retrieve the full GraphQL schema",
      query: `query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types { name kind description fields { name type { name kind } } }
  }
}`,
    },
    "depth-limit": {
      name: "Deep Nested Query",
      description: "Tests query depth limits with deeply nested selections",
      query: `query DepthAttack {
  user { posts { author { posts { author { posts { author { posts { id } } } } } } } }
}`,
    },
    "query-complexity": {
      name: "High Complexity Query",
      description: "Tests query complexity limits with expensive operations",
      query: `query ComplexityAttack {
  users { id name email posts { id title content comments { id content author { id name posts { id title } } } } }
}`,
    },
    "batch-query": {
      name: "Batch Query Attack",
      description: "Tests batch query processing limits",
      query: `[
  {"query": "query { __typename }"},
  {"query": "query { __typename }"},
  {"query": "query { __typename }"}
]`,
    },
    "field-suggestion": {
      name: "Field Suggestion Probe",
      description: "Tests for information disclosure via error messages",
      query: `query FieldSuggestion { nonExistentField anotherBadField secretAdminField }`,
    },
  };
}
