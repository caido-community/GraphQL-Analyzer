import type { SDK } from "caido:plugin";
import { RequestSpec } from "caido:utils";
import type { AttackConfig, AttackFinding, AttackResult, Result } from "shared";

import { hasComplexityError, parseGraphQLResponse } from "../../validation";

import { applyHeaders } from "./headerUtils";
import { createAttackResult, createEmptyContext } from "./types";

const COMPLEXITY_TESTS = [
  {
    name: "Medium Complexity",
    query: `query MediumComplexity { 
      users { 
        id name email 
        posts { id title } 
      } 
    }`,
  },
  {
    name: "High Complexity",
    query: `query HighComplexity { 
      users { 
        id name email 
        posts { 
          id title content
          author { id name email }
          comments { id content author { id name } }
        } 
      } 
    }`,
  },
];

export async function executeComplexityAttack(
  sdk: SDK,
  config: AttackConfig,
): Promise<Result<AttackResult>> {
  const findings: AttackFinding[] = [];
  const ctx = createEmptyContext();

  for (const test of COMPLEXITY_TESTS) {
    try {
      const payload = JSON.stringify({ query: test.query, variables: {} });
      ctx.combinedPayload += `// ${test.name}\n${payload}\n\n`;

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
          if (timing > 5000 && test.name.includes("High")) {
            findings.push({
              severity: "high",
              title: "High Query Complexity Accepted",
              description: `The GraphQL endpoint accepts high-complexity queries that can cause significant resource consumption.`,
              evidence: `${test.name} executed successfully with ${timing}ms response time.`,
              recommendation:
                "Implement query complexity analysis immediately to prevent resource exhaustion attacks.",
            });
          }
        } else if (result.response.getCode() === 400) {
          const parsed = parseGraphQLResponse(responseBody);
          if (
            parsed.kind === "Ok" &&
            parsed.value.errors !== undefined &&
            hasComplexityError(parsed.value.errors)
          ) {
            // Complexity protection found
          }
        }
      }
    } catch (error) {
      sdk.console.error(
        `Complexity attack error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return {
    kind: "Ok",
    value: createAttackResult(
      "query-complexity",
      config.targetUrl,
      ctx,
      findings,
    ),
  };
}
