import type { SDK } from "caido:plugin";
import { RequestSpec } from "caido:utils";
import type { AttackConfig, AttackFinding, AttackResult, Result } from "shared";

import {
  hasIntrospectionDisabledError,
  parseGraphQLResponse,
} from "../../validation";

import { applyHeaders } from "./headerUtils";
import { createAttackResult, createEmptyContext } from "./types";

const INTROSPECTION_QUERY = `query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types {
      name
      kind
      description
    }
  }
}`;

export async function executeIntrospectionAttack(
  sdk: SDK,
  config: AttackConfig,
): Promise<Result<AttackResult>> {
  const findings: AttackFinding[] = [];
  const ctx = createEmptyContext();

  const queryTests = [
    { name: "Standard Introspection", query: INTROSPECTION_QUERY },
  ];

  for (const queryTest of queryTests) {
    const maxRetries = 3;
    let introspectionFound = false;

    for (let retry = 0; retry < maxRetries && !introspectionFound; retry++) {
      try {
        const payload = JSON.stringify({
          query: queryTest.query,
          variables: {},
        });
        ctx.combinedPayload += `// ${queryTest.name} (Retry ${retry + 1})\n${payload}\n\n`;

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
            const parsed = parseGraphQLResponse(responseBody);
            if (
              parsed.kind === "Ok" &&
              parsed.value.data !== undefined &&
              (parsed.value.data.__schema !== undefined ||
                parsed.value.data.__type !== undefined)
            ) {
              introspectionFound = true;
              findings.push({
                severity: "high",
                title: `GraphQL Introspection Enabled (${queryTest.name})`,
                description: `The GraphQL endpoint allows introspection queries via ${queryTest.name}, which completely exposes the schema structure including all types, fields, mutations, and subscriptions.`,
                evidence: `${queryTest.name} successful on retry ${retry + 1}`,
                recommendation:
                  "Disable introspection in production environments immediately.",
              });
              break;
            }
          } else if (result.response.getCode() === 400) {
            const parsed = parseGraphQLResponse(responseBody);
            if (
              parsed.kind === "Ok" &&
              parsed.value.errors !== undefined &&
              hasIntrospectionDisabledError(parsed.value.errors)
            ) {
              break;
            }
          }
        }
      } catch (error) {
        sdk.console.error(
          `Introspection attack error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (introspectionFound) break;
  }

  return {
    kind: "Ok",
    value: createAttackResult("introspection", config.targetUrl, ctx, findings),
  };
}
