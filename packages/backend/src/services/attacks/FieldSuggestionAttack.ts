import type { SDK } from "caido:plugin";
import { RequestSpec } from "caido:utils";
import type { AttackConfig, AttackFinding, AttackResult, Result } from "shared";

import { parseGraphQLResponse } from "../../validation";

import { applyHeaders } from "./headerUtils";
import { createAttackResult, createEmptyContext } from "./types";

const SUGGESTION_TESTS = [
  {
    name: "Non-existent Fields",
    query: `query FieldSuggestion1 {
      nonExistentField12345
      anotherBadField98765
    }`,
  },
  {
    name: "Typo Fields",
    query: `query FieldSuggestion2 {
      usr
      ide
      nam
    }`,
  },
  {
    name: "Admin-like Fields",
    query: `query FieldSuggestion3 {
      adminUser
      secretKey
      internalData
    }`,
  },
];

export async function executeFieldSuggestionAttack(
  sdk: SDK,
  config: AttackConfig,
): Promise<Result<AttackResult>> {
  const findings: AttackFinding[] = [];
  const ctx = createEmptyContext();

  for (const test of SUGGESTION_TESTS) {
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

      if (result.response !== undefined && result.response.getCode() === 400) {
        const responseBody = result.response.getBody()?.toText() ?? "";
        const parsed = parseGraphQLResponse(responseBody);

        if (parsed.kind === "Ok" && parsed.value.errors !== undefined) {
          const suggestiveErrors = parsed.value.errors.filter((err) => {
            const msg = err.message ?? "";
            return (
              msg.includes("Did you mean") ||
              msg.includes("Perhaps you meant") ||
              /Cannot query field .+ on type .+\. Did you mean .+\?/.test(msg)
            );
          });

          if (suggestiveErrors.length > 0) {
            findings.push({
              severity: "low",
              title: `Field Suggestion Information Disclosure (${test.name})`,
              description:
                "The GraphQL endpoint provides field suggestions in error messages, potentially revealing schema information.",
              evidence: suggestiveErrors.map((e) => e.message ?? "").join("; "),
              recommendation:
                "Consider disabling detailed error messages in production to prevent schema enumeration.",
            });
          }
        }
      }
    } catch (error) {
      sdk.console.error(
        `Field suggestion attack error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return {
    kind: "Ok",
    value: createAttackResult(
      "field-suggestion",
      config.targetUrl,
      ctx,
      findings,
    ),
  };
}
