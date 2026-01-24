import type { SDK } from "caido:plugin";
import { RequestSpec } from "caido:utils";
import type { AttackConfig, AttackFinding, AttackResult, Result } from "shared";

import { hasDepthLimitError, parseGraphQLResponse } from "../../validation";

import { applyHeaders } from "./headerUtils";
import { createAttackResult, createEmptyContext } from "./types";

export async function executeDepthAttack(
  sdk: SDK,
  config: AttackConfig,
): Promise<Result<AttackResult>> {
  const findings: AttackFinding[] = [];
  const ctx = createEmptyContext();
  const maxDepth = config.maxDepth ?? 20;
  const depthTests = maxDepth <= 10 ? [maxDepth] : [10, maxDepth];
  let foundProtection = false;

  for (const depth of depthTests) {
    try {
      let nestedQuery = "id";
      for (let i = 0; i < depth; i++) {
        nestedQuery = `user { ${nestedQuery} }`;
      }

      const depthQuery = `query DepthAttack${depth} { ${nestedQuery} }`;
      const payload = JSON.stringify({ query: depthQuery, variables: {} });
      ctx.combinedPayload += `// Depth Test: ${depth} levels\n${payload}\n\n`;

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
          if (depth === maxDepth && !foundProtection && findings.length === 0) {
            findings.push({
              severity: "high",
              title: "No Query Depth Limit Detected",
              description: `The GraphQL endpoint accepts deeply nested queries up to ${maxDepth} levels without any depth restrictions.`,
              evidence: `Successfully executed query with ${maxDepth} levels of deep nesting (${ctx.totalTiming}ms total execution time).`,
              recommendation:
                "Implement query depth limiting immediately to prevent DoS attacks.",
            });
            break;
          }
        } else if (result.response.getCode() === 400) {
          const parsed = parseGraphQLResponse(responseBody);
          if (
            parsed.kind === "Ok" &&
            parsed.value.errors !== undefined &&
            hasDepthLimitError(parsed.value.errors)
          ) {
            foundProtection = true;
            break;
          }
        }
      }
    } catch (error) {
      sdk.console.error(
        `Depth attack error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return {
    kind: "Ok",
    value: createAttackResult("depth-limit", config.targetUrl, ctx, findings),
  };
}
