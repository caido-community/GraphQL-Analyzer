import type { SDK } from "caido:plugin";
import { RequestSpec } from "caido:utils";
import type { AttackConfig, AttackFinding, AttackResult, Result } from "shared";

import {
  hasBatchError,
  parseBatchResponse,
  parseGraphQLResponse,
} from "../../validation";

import { applyHeaders } from "./headerUtils";
import { createAttackResult, createEmptyContext } from "./types";

export async function executeBatchAttack(
  sdk: SDK,
  config: AttackConfig,
): Promise<Result<AttackResult>> {
  const findings: AttackFinding[] = [];
  const ctx = createEmptyContext();
  const maxBatchSize = config.batchSize ?? 10;
  const batchTests = [5, maxBatchSize];

  for (const batchSize of batchTests) {
    try {
      const queries = [];
      for (let i = 0; i < batchSize; i++) {
        queries.push({
          query: `query Batch${i} { __typename }`,
          variables: {},
        });
      }

      const payload = JSON.stringify(queries);
      ctx.combinedPayload += `// Batch Test: ${batchSize} queries\n${payload}\n\n`;

      const spec = new RequestSpec(config.targetUrl);
      spec.setMethod("POST");
      await applyHeaders(sdk, spec, config);
      spec.setBody(payload);

      const startTime = Date.now();
      const result = await sdk.requests.send(spec);
      const timing = Date.now() - startTime;
      ctx.totalTiming += timing;
      ctx.totalRequests++;

      if (result.request !== undefined) ctx.lastRequest = result.request;
      if (result.response !== undefined) ctx.lastResponse = result.response;

      if (result.response !== undefined) {
        const responseBody = result.response.getBody()?.toText() ?? "";

        if (result.response.getCode() === 200) {
          const parsed = parseBatchResponse(responseBody);
          if (parsed.kind === "Ok" && parsed.value.length === batchSize) {
            if (batchSize >= maxBatchSize) {
              findings.push({
                severity: "medium",
                title: "Batch Queries Allowed",
                description: `The GraphQL endpoint accepts batch queries (${batchSize} queries processed).`,
                evidence: `Successfully processed ${batchSize} queries in single request`,
                recommendation:
                  "Consider implementing batch query limits to prevent resource exhaustion.",
              });
            }
          }
        } else if (result.response.getCode() === 400) {
          const parsed = parseGraphQLResponse(responseBody);
          if (
            parsed.kind === "Ok" &&
            parsed.value.errors !== undefined &&
            hasBatchError(parsed.value.errors)
          ) {
            break;
          }
        }
      }
    } catch (error) {
      sdk.console.error(
        `Batch attack error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return {
    kind: "Ok",
    value: createAttackResult("batch-query", config.targetUrl, ctx, findings),
  };
}
