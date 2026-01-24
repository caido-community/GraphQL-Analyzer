import type { Request, Response } from "caido:utils";
import type { AttackFinding, AttackResult, AttackType } from "shared";

export type AttackContext = {
  lastRequest?: Request;
  lastResponse?: Response;
  combinedPayload: string;
  totalTiming: number;
  totalRequests: number;
};

export function createAttackResult(
  attackType: AttackType,
  targetUrl: string,
  ctx: AttackContext,
  findings: AttackFinding[],
): AttackResult {
  const attackId = `${attackType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  return {
    id: attackId,
    attackType,
    targetUrl,
    payload: ctx.combinedPayload.trim(),
    sentAt: new Date(),
    response: ctx.lastResponse
      ? {
          statusCode: ctx.lastResponse.getCode(),
          body: ctx.lastResponse.getBody()?.toText() ?? "",
          headers: ctx.lastResponse.getHeaders(),
          timing: ctx.totalTiming,
        }
      : undefined,
    rawRequest: ctx.lastRequest?.getRaw()?.toText() ?? ctx.combinedPayload,
    rawResponse: ctx.lastResponse?.getRaw()?.toText() ?? "",
    requestId: ctx.lastRequest?.getId()?.toString() ?? undefined,
    findings,
    status: "completed",
    requestsExecuted: ctx.totalRequests,
    totalRequests: ctx.totalRequests,
  };
}

export function createEmptyContext(): AttackContext {
  return {
    combinedPayload: "",
    totalTiming: 0,
    totalRequests: 0,
  };
}
