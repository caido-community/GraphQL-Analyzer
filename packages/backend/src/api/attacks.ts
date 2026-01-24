import type { SDK } from "caido:plugin";
import type { AttackConfig, AttackResult, AttackType, Result } from "shared";

import {
  cancelAttackSession as cancelSession,
  executeAttacks as executeAttacksService,
  getAttackStatus as getStatus,
  generateAttackTemplates as getTemplates,
  startAttacksAsync as startAsync,
} from "../services/attacks";

export async function executeGraphQLAttacks(
  sdk: SDK,
  config: AttackConfig,
): Promise<Result<AttackResult[]>> {
  return executeAttacksService(sdk, config);
}

export function startGraphQLAttacks(
  sdk: SDK,
  config: AttackConfig,
): Promise<Result<string>> {
  return Promise.resolve(startAsync(sdk, config));
}

export function getAttackStatus(
  _sdk: SDK,
  sessionId: string,
): Promise<
  Result<{
    status: string;
    progress: number;
    results: AttackResult[];
    totalAttacks: number;
    completedAttacks: number;
    isComplete: boolean;
  }>
> {
  return Promise.resolve(getStatus(sessionId));
}

export function cancelAttackSession(
  _sdk: SDK,
  sessionId: string,
): Promise<Result<void>> {
  return Promise.resolve(cancelSession(sessionId));
}

export function getAttackTemplates(
  _sdk: SDK,
): Record<AttackType, { name: string; description: string; query: string }> {
  return getTemplates();
}

export async function createCaidoFinding(
  sdk: SDK,
  findingData: { title: string; description: string },
  requestId: string,
): Promise<Result<void>> {
  try {
    if (!requestId) {
      return { kind: "Error", error: "No request ID provided" };
    }

    const result = await sdk.requests.get(requestId);
    if (!result) {
      return { kind: "Error", error: "Request not found in Caido storage" };
    }

    let dedupeKey = `graphql-${findingData.title}`;
    try {
      dedupeKey += `-${result.request.getUrl()}`;
    } catch {
      dedupeKey += `-${Date.now()}`;
    }

    await sdk.findings.create({
      title: findingData.title,
      description: findingData.description,
      reporter: "GraphQL Analyzer",
      request: result.request,
      dedupeKey: dedupeKey,
    });

    return { kind: "Ok", value: undefined };
  } catch (error) {
    return {
      kind: "Error",
      error: `Failed to create Caido finding: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
