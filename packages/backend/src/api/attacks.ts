import type { SDK } from "caido:plugin";
import type { Request, Response } from "caido:utils";
import { RequestSpec } from "caido:utils";
import type {
  AttackConfig,
  AttackFinding,
  AttackResult,
  AttackType,
  Result,
} from "shared";

type AttackSessionState = {
  config: AttackConfig;
  status: "running" | "completed" | "failed" | "cancelled";
  progress: number;
  results: AttackResult[];
  totalAttacks: number;
  completedAttacks: number;
  startTime: Date;
  endTime?: Date;
  currentAttack?: AttackType;
  error?: string;
};

export class GraphQLAttackService {
  private static attackSessions: Map<string, AttackSessionState> = new Map();

  constructor(private sdk: SDK) {}

  private addHeaders(spec: RequestSpec, config: AttackConfig) {
    let finalHeaders: Record<string, string> = {};

    let hostHeader = "";
    try {
      const url = new URL(config.targetUrl);
      const port = url.port;
      const hostname = url.hostname;

      if (port) {
        hostHeader = `${hostname}:${port}`;
      } else {
        const defaultPort = url.protocol === "https:" ? "443" : "80";
        if (
          (url.protocol === "https:" && port !== "443") ||
          (url.protocol === "http:" && port !== "80")
        ) {
          hostHeader = `${hostname}:${port || defaultPort}`;
        } else {
          hostHeader = hostname;
        }
      }
    } catch (error) {
      hostHeader = "";
    }

    if (config.useOriginalHeaders === true && config.originalHeaders) {
      finalHeaders = { ...config.originalHeaders };

      finalHeaders["Content-Type"] = "application/json";
      finalHeaders["Accept"] = "application/json";

      if (hostHeader) {
        finalHeaders["Host"] = hostHeader;
      }

      delete finalHeaders["Content-Length"];
    } else {
      finalHeaders = {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Caido/GraphQL-Analyzer",
      };

      if (hostHeader) {
        finalHeaders["Host"] = hostHeader;
      }
    }

    if (config.customHeaders) {
      for (const [customName, customValue] of Object.entries(
        config.customHeaders,
      )) {
        if (customName && customValue) {
          const matchingKey = Object.keys(finalHeaders).find(
            (existingKey) =>
              existingKey.toLowerCase() === customName.toLowerCase(),
          );

          if (matchingKey !== undefined) {
            delete finalHeaders[matchingKey];
            finalHeaders[customName] = customValue;
          } else {
            finalHeaders[customName] = customValue;
          }
        }
      }
    }

    for (const [name, value] of Object.entries(finalHeaders)) {
      if (value) {
        spec.setHeader(name, value);
      }
    }
  }

  async executeAttacks(config: AttackConfig): Promise<Result<AttackResult[]>> {
    try {
      const results: AttackResult[] = [];

      for (let i = 0; i < config.attackTypes.length; i++) {
        const attackType = config.attackTypes[i];
        if (!attackType) continue; // Skip if undefined

        const attackResult = await this.executeAttack(attackType, config);

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

  private async executeAttack(
    attackType: AttackType,
    config: AttackConfig,
  ): Promise<Result<AttackResult>> {
    switch (attackType) {
      case "introspection":
        return await this.executeIntrospectionAttack(config);
      case "depth-limit":
        return await this.executeDepthAttack(config);
      case "query-complexity":
        return await this.executeComplexityAttack(config);
      case "batch-query":
        return await this.executeBatchAttack(config);
      case "field-suggestion":
        return await this.executeFieldSuggestionAttack(config);
      default:
        return { kind: "Error", error: `Unknown attack type: ${attackType}` };
    }
  }

  private async executeIntrospectionAttack(
    config: AttackConfig,
  ): Promise<Result<AttackResult>> {
    const attackId = `introspection-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const findings: AttackFinding[] = [];

    const introspectionQueries = [
      {
        name: "Standard Introspection",
        query: `query IntrospectionQuery {
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
        }`,
      },
    ];

    let lastRequest: Request | undefined;
    let lastResponse: Response | undefined;
    let combinedPayload = "";
    let totalTiming = 0;
    let totalRequests = 0;

    for (const queryTest of introspectionQueries) {
      const maxRetries = 3;
      let introspectionFound = false;

      for (
        let retry = 0;
        retry < maxRetries && introspectionFound === false;
        retry++
      ) {
        try {
          const payload = JSON.stringify({
            query: queryTest.query,
            variables: {},
          });

          combinedPayload += `// ${queryTest.name} (Retry ${retry + 1})\n${payload}\n\n`;

          const spec = new RequestSpec(config.targetUrl);
          spec.setMethod("POST");
          this.addHeaders(spec, config);
          spec.setBody(payload);

          const startTime = Date.now();
          const result = await this.sdk.requests.send(spec);
          const endTime = Date.now();
          const timing = endTime - startTime;
          totalTiming += timing;
          totalRequests++;

          if (result.request !== undefined) {
            lastRequest = result.request;
          }
          if (result.response !== undefined) {
            lastResponse = result.response;
          }

          if (result.response !== undefined) {
            const responseBody = result.response.getBody()?.toText() ?? "";

            if (result.response.getCode() === 200) {
              try {
                const jsonResponse: {
                  data?: { __schema?: unknown; __type?: unknown };
                  errors?: Array<{ message?: string }>;
                } = JSON.parse(responseBody) as {
                  data?: { __schema?: unknown; __type?: unknown };
                  errors?: Array<{ message?: string }>;
                };

                if (
                  jsonResponse.data !== undefined &&
                  (jsonResponse.data.__schema !== undefined ||
                    jsonResponse.data.__type !== undefined)
                ) {
                  introspectionFound = true;
                  findings.push({
                    severity: "high",
                    title: `GraphQL Introspection Enabled (${queryTest.name})`,
                    description: `The GraphQL endpoint allows introspection queries via ${queryTest.name}, which completely exposes the schema structure including all types, fields, mutations, and subscriptions. This information disclosure vulnerability enables attackers to understand the full API surface and craft targeted attacks against exposed functionality.`,
                    evidence: `${queryTest.name} successful on retry ${retry + 1}: ${jsonResponse.data.__schema !== undefined ? `Exposed schema with ${((jsonResponse.data.__schema as { types?: unknown[] }).types?.length ?? 0).toString()} types, including sensitive type information and field definitions` : "Type information and field structure exposed"}`,
                    recommendation:
                      "Disable introspection in production environments immediately. Most GraphQL implementations allow disabling introspection via configuration (e.g., Apollo Server's introspection: false). This prevents schema structure discovery while maintaining normal API functionality.",
                  });

                  break;
                }
              } catch {
                void 0;
              }
            } else if (result.response.getCode() === 400) {
              try {
                const jsonResponse: { errors?: Array<{ message?: string }> } =
                  JSON.parse(responseBody) as {
                    errors?: Array<{ message?: string }>;
                  };
                if (
                  Array.isArray(jsonResponse.errors) &&
                  jsonResponse.errors.some(
                    (errorItem: { message?: string }) => {
                      const message = errorItem.message;
                      return (
                        typeof message === "string" &&
                        (message.toLowerCase().includes("introspection") ||
                          message.toLowerCase().includes("disabled"))
                      );
                    },
                  )
                ) {
                  break;
                }
              } catch {
                void 0;
              }
            }
          }
        } catch (error) {
          this.sdk.console.error(
            `Introspection attack error: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      if (introspectionFound) {
        break;
      }
    }

    const result: AttackResult = {
      id: attackId,
      attackType: "introspection",
      targetUrl: config.targetUrl,
      payload: combinedPayload.trim(),
      sentAt: new Date(),
      response:
        lastResponse !== undefined
          ? {
              statusCode: lastResponse.getCode(),
              body: lastResponse.getBody()?.toText() ?? "",
              headers: lastResponse.getHeaders(),
              timing: totalTiming,
            }
          : undefined,
      rawRequest: lastRequest?.getRaw()?.toText() ?? combinedPayload,
      rawResponse: lastResponse?.getRaw()?.toText() ?? "",
      requestId: lastRequest?.getId()?.toString() ?? undefined,
      findings,
      status: "completed",
      requestsExecuted: totalRequests,
      totalRequests: totalRequests,
    };

    return { kind: "Ok", value: result };
  }

  private async executeDepthAttack(
    config: AttackConfig,
  ): Promise<Result<AttackResult>> {
    const attackId = `depth-limit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const findings: AttackFinding[] = [];
    const maxDepth = config.maxDepth ?? 20;

    const depthTests = maxDepth <= 10 ? [maxDepth] : [10, maxDepth];
    let lastRequest: Request | undefined;
    let lastResponse: Response | undefined;
    let combinedPayload = "";
    let totalTiming = 0;
    let foundProtection = false;

    for (const depth of depthTests) {
      try {
        let nestedQuery = "id";
        for (let i = 0; i < depth; i++) {
          nestedQuery = `user { ${nestedQuery} }`;
        }

        const depthQuery = `query DepthAttack${depth} { ${nestedQuery} }`;
        const payload = JSON.stringify({
          query: depthQuery,
          variables: {},
        });

        combinedPayload += `// Depth Test: ${depth} levels\n${payload}\n\n`;

        const spec = new RequestSpec(config.targetUrl);
        spec.setMethod("POST");
        this.addHeaders(spec, config);
        spec.setBody(payload);

        const startTime = Date.now();
        const result = await this.sdk.requests.send(spec);
        const endTime = Date.now();
        const timing = endTime - startTime;
        totalTiming += timing;

        if (result.request !== undefined) {
          lastRequest = result.request;
        }
        if (result.response !== undefined) {
          lastResponse = result.response;
        }

        if (result.response !== undefined) {
          const responseBody = result.response.getBody()?.toText() ?? "";

          if (result.response.getCode() === 200) {
            if (
              depth === maxDepth &&
              !foundProtection &&
              findings.length === 0
            ) {
              findings.push({
                severity: "high",
                title: "No Query Depth Limit Detected",
                description: `The GraphQL endpoint accepts deeply nested queries up to ${maxDepth} levels without any depth restrictions. This lack of query depth limiting can be exploited by attackers to cause Denial of Service (DoS) by sending extremely nested queries that consume excessive server resources and memory, potentially crashing the application or degrading performance for legitimate users.`,
                evidence: `Successfully executed query with ${maxDepth} levels of deep nesting (${totalTiming}ms total execution time). The server processed the nested query without rejecting it, indicating no depth limits are configured.`,
                recommendation:
                  "Implement query depth limiting immediately to prevent DoS attacks. Most GraphQL servers support depth analysis (e.g., Apollo Server with 'graphql-depth-limit', GraphQL-Java with depth analysis). Set a reasonable depth limit (typically 5-15 levels) based on your application's legitimate use cases.",
              });
              break;
            }
          } else if (result.response.getCode() === 400) {
            try {
              const jsonResponse: { errors?: Array<{ message?: string }> } =
                JSON.parse(responseBody) as {
                  errors?: Array<{ message?: string }>;
                };
              if (
                Array.isArray(jsonResponse.errors) &&
                jsonResponse.errors.some((errorItem: { message?: string }) => {
                  const message = errorItem.message;
                  return (
                    typeof message === "string" &&
                    (message.toLowerCase().includes("depth") ||
                      message.toLowerCase().includes("complex") ||
                      message.toLowerCase().includes("nested"))
                  );
                })
              ) {
                foundProtection = true;
                break;
              }
            } catch {
              void 0;
            }
          }
        }
      } catch (error) {
        this.sdk.console.error(
          `Depth attack error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const result: AttackResult = {
      id: attackId,
      attackType: "depth-limit",
      targetUrl: config.targetUrl,
      payload: combinedPayload.trim(),
      sentAt: new Date(),
      response:
        lastResponse !== undefined
          ? {
              statusCode: lastResponse.getCode(),
              body: lastResponse.getBody()?.toText() ?? "",
              headers: lastResponse.getHeaders(),
              timing: totalTiming,
            }
          : undefined,
      rawRequest: lastRequest?.getRaw()?.toText() ?? combinedPayload,
      rawResponse: lastResponse?.getRaw()?.toText() ?? "",
      requestId: lastRequest?.getId()?.toString() ?? undefined,
      findings,
      status: "completed",
      requestsExecuted: depthTests.length,
      totalRequests: depthTests.length,
    };

    return { kind: "Ok", value: result };
  }

  private async executeComplexityAttack(
    config: AttackConfig,
  ): Promise<Result<AttackResult>> {
    const attackId = `complexity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const findings: AttackFinding[] = [];

    const complexityTests = [
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

    let lastRequest: Request | undefined;
    let lastResponse: Response | undefined;
    let combinedPayload = "";
    let totalTiming = 0;

    for (const complexityTest of complexityTests) {
      try {
        const payload = JSON.stringify({
          query: complexityTest.query,
          variables: {},
        });

        combinedPayload += `// ${complexityTest.name}\n${payload}\n\n`;

        const spec = new RequestSpec(config.targetUrl);
        spec.setMethod("POST");
        this.addHeaders(spec, config);
        spec.setBody(payload);

        const startTime = Date.now();
        const result = await this.sdk.requests.send(spec);
        const endTime = Date.now();
        const timing = endTime - startTime;
        totalTiming += timing;

        if (result.request !== undefined) {
          lastRequest = result.request;
        }
        if (result.response !== undefined) {
          lastResponse = result.response;
        }

        if (result.response !== undefined) {
          const responseBody = result.response.getBody()?.toText() ?? "";

          if (result.response.getCode() === 200) {
            if (timing > 5000 && complexityTest.name.includes("High")) {
              findings.push({
                severity: "high",
                title: "High Query Complexity Accepted",
                description: `The GraphQL endpoint accepts high-complexity queries that can cause significant resource consumption and potential Denial of Service. The server processed a complex query with multiple nested fields and relationships in ${timing}ms, indicating no query complexity analysis or cost limiting is implemented. Attackers can exploit this to overload the server with resource-intensive queries.`,
                evidence: `${complexityTest.name} executed successfully with ${timing}ms response time. The complex query with multiple field selections and nested relationships was processed without rejection, indicating absence of complexity analysis.`,
                recommendation:
                  "Implement query complexity analysis immediately to prevent resource exhaustion attacks. Use tools like 'graphql-query-complexity' for Apollo Server or similar cost analysis for other GraphQL implementations. Set reasonable complexity limits (typically 100-1000 points) and consider implementing query whitelisting for known safe queries.",
              });
            }
          } else if (result.response.getCode() === 400) {
            try {
              const jsonResponse: { errors?: Array<{ message?: string }> } =
                JSON.parse(responseBody) as {
                  errors?: Array<{ message?: string }>;
                };
              if (
                Array.isArray(jsonResponse.errors) &&
                jsonResponse.errors.some((errorItem: { message?: string }) => {
                  const message = errorItem.message;
                  return (
                    typeof message === "string" &&
                    (message.toLowerCase().includes("complex") ||
                      message.toLowerCase().includes("cost") ||
                      message.toLowerCase().includes("limit"))
                  );
                })
              ) {
                void 0;
              }
            } catch {
              void 0;
            }
          }
        }
      } catch (error) {
        this.sdk.console.error(
          `Complexity attack error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const result: AttackResult = {
      id: attackId,
      attackType: "query-complexity",
      targetUrl: config.targetUrl,
      payload: combinedPayload.trim(),
      sentAt: new Date(),
      response:
        lastResponse !== undefined
          ? {
              statusCode: lastResponse.getCode(),
              body: lastResponse.getBody()?.toText() ?? "",
              headers: lastResponse.getHeaders(),
              timing: totalTiming,
            }
          : undefined,
      rawRequest: lastRequest?.getRaw()?.toText() ?? combinedPayload,
      rawResponse: lastResponse?.getRaw()?.toText() ?? "",
      requestId: lastRequest?.getId()?.toString() ?? undefined,
      findings,
      status: "completed",
      requestsExecuted: complexityTests.length,
      totalRequests: complexityTests.length,
    };

    return { kind: "Ok", value: result };
  }

  private async executeBatchAttack(
    config: AttackConfig,
  ): Promise<Result<AttackResult>> {
    const attackId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const findings: AttackFinding[] = [];
    const maxBatchSize = config.batchSize ?? 10;

    const batchTests = [5, maxBatchSize];
    let lastRequest: Request | undefined;
    let lastResponse: Response | undefined;
    let combinedPayload = "";
    let totalTiming = 0;

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
        combinedPayload += `// Batch Test: ${batchSize} queries\n${payload}\n\n`;

        const spec = new RequestSpec(config.targetUrl);
        spec.setMethod("POST");
        this.addHeaders(spec, config);
        spec.setBody(payload);

        const startTime = Date.now();
        const result = await this.sdk.requests.send(spec);
        const endTime = Date.now();
        const timing = endTime - startTime;
        totalTiming += timing;

        if (result.request !== undefined) {
          lastRequest = result.request;
        }
        if (result.response !== undefined) {
          lastResponse = result.response;
        }

        if (result.response !== undefined) {
          const responseBody = result.response.getBody()?.toText() ?? "";

          if (result.response.getCode() === 200) {
            try {
              const jsonResponse = JSON.parse(responseBody);
              if (
                Array.isArray(jsonResponse) &&
                jsonResponse.length === batchSize
              ) {
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
            } catch {
              void 0;
            }
          } else if (result.response.getCode() === 400) {
            try {
              const jsonResponse: { errors?: Array<{ message?: string }> } =
                JSON.parse(responseBody) as {
                  errors?: Array<{ message?: string }>;
                };
              if (
                Array.isArray(jsonResponse.errors) &&
                jsonResponse.errors.some((errorItem: { message?: string }) => {
                  const message = errorItem.message;
                  return (
                    typeof message === "string" &&
                    (message.toLowerCase().includes("batch") ||
                      message.toLowerCase().includes("array") ||
                      message.toLowerCase().includes("multiple"))
                  );
                })
              ) {
                break;
              }
            } catch {
              void 0;
            }
          }
        }
      } catch (error) {
        this.sdk.console.error(
          `Batch attack error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const result: AttackResult = {
      id: attackId,
      attackType: "batch-query",
      targetUrl: config.targetUrl,
      payload: combinedPayload.trim(),
      sentAt: new Date(),
      response:
        lastResponse !== undefined
          ? {
              statusCode: lastResponse.getCode(),
              body: lastResponse.getBody()?.toText() ?? "",
              headers: lastResponse.getHeaders(),
              timing: totalTiming,
            }
          : undefined,
      rawRequest: lastRequest?.getRaw()?.toText() ?? combinedPayload,
      rawResponse: lastResponse?.getRaw()?.toText() ?? "",
      requestId: lastRequest?.getId()?.toString() ?? undefined,
      findings,
      status: "completed",
      requestsExecuted: batchTests.length,
      totalRequests: batchTests.length,
    };

    return { kind: "Ok", value: result };
  }

  private async executeFieldSuggestionAttack(
    config: AttackConfig,
  ): Promise<Result<AttackResult>> {
    const attackId = `field-suggestion-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const findings: AttackFinding[] = [];

    const suggestionTests = [
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

    let lastRequest: Request | undefined;
    let lastResponse: Response | undefined;
    let combinedPayload = "";
    let totalTiming = 0;

    for (const test of suggestionTests) {
      try {
        const payload = JSON.stringify({
          query: test.query,
          variables: {},
        });

        combinedPayload += `// ${test.name}\n${payload}\n\n`;

        const spec = new RequestSpec(config.targetUrl);
        spec.setMethod("POST");
        this.addHeaders(spec, config);
        spec.setBody(payload);

        const startTime = Date.now();
        const result = await this.sdk.requests.send(spec);
        const endTime = Date.now();
        const timing = endTime - startTime;
        totalTiming += timing;

        if (result.request !== undefined) {
          lastRequest = result.request;
        }
        if (result.response !== undefined) {
          lastResponse = result.response;
        }

        if (
          result.response !== undefined &&
          result.response.getCode() === 400
        ) {
          const responseBody = result.response.getBody()?.toText() ?? "";
          try {
            const jsonResponse = JSON.parse(responseBody);
            if (Array.isArray(jsonResponse.errors)) {
              const suggestiveErrors = jsonResponse.errors.filter(
                (error: { message?: string }) => {
                  const message = error.message;
                  return (
                    typeof message === "string" &&
                    (message.includes("Did you mean") ||
                      message.includes("Perhaps you meant") ||
                      /Cannot query field .+ on type .+\. Did you mean .+\?/.test(
                        message,
                      ))
                  );
                },
              );

              if (suggestiveErrors.length > 0) {
                findings.push({
                  severity: "low",
                  title: `Field Suggestion Information Disclosure (${test.name})`,
                  description:
                    "The GraphQL endpoint provides field suggestions in error messages, potentially revealing schema information.",
                  evidence: suggestiveErrors
                    .map(
                      (errorItem: { message?: string }) =>
                        errorItem.message ?? "",
                    )
                    .join("; "),
                  recommendation:
                    "Consider disabling detailed error messages in production to prevent schema enumeration.",
                });
              }
            }
          } catch {
            void 0;
          }
        }
      } catch (error) {
        this.sdk.console.error(
          `Field suggestion attack error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const result: AttackResult = {
      id: attackId,
      attackType: "field-suggestion",
      targetUrl: config.targetUrl,
      payload: combinedPayload.trim(),
      sentAt: new Date(),
      response:
        lastResponse !== undefined
          ? {
              statusCode: lastResponse.getCode(),
              body: lastResponse.getBody()?.toText() ?? "",
              headers: lastResponse.getHeaders(),
              timing: totalTiming,
            }
          : undefined,
      rawRequest: lastRequest?.getRaw()?.toText() ?? combinedPayload,
      rawResponse: lastResponse?.getRaw()?.toText() ?? "",
      requestId: lastRequest?.getId()?.toString() ?? undefined,
      findings,
      status: "completed",
      requestsExecuted: suggestionTests.length,
      totalRequests: suggestionTests.length,
    };

    return { kind: "Ok", value: result };
  }

  generateAttackTemplates(): Record<
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
    types {
      name
      kind
      description
      fields {
        name
        type {
          name
          kind
        }
      }
    }
  }
}`,
      },
      "depth-limit": {
        name: "Deep Nested Query",
        description: "Tests query depth limits with deeply nested selections",
        query: `query DepthAttack {
  user {
    posts {
      author {
        posts {
          author {
            posts {
              author {
                posts {
                  id
                }
              }
            }
          }
        }
      }
    }
  }
}`,
      },
      "query-complexity": {
        name: "High Complexity Query",
        description: "Tests query complexity limits with expensive operations",
        query: `query ComplexityAttack {
  users {
    id
    name
    email
    posts {
      id
      title
      content
      comments {
        id
        content
        author {
          id
          name
          posts {
            id
            title
          }
        }
      }
    }
  }
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
        query: `query FieldSuggestion {
  nonExistentField
  anotherBadField
  secretAdminField
}`,
      },
    };
  }

  startAttacksAsync(config: AttackConfig): Promise<Result<string>> {
    const sessionId = `attack-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    GraphQLAttackService.attackSessions.set(sessionId, {
      config,
      status: "running",
      progress: 0,
      results: [],
      totalAttacks: config.attackTypes.length,
      completedAttacks: 0,
      startTime: new Date(),
    });

    this.executeAttacksRealTime(sessionId, config).catch((error) => {
      this.sdk.console.error(
        `Attack execution error: ${error instanceof Error ? error.message : String(error)}`,
      );
      const session = GraphQLAttackService.attackSessions.get(sessionId);
      if (session !== undefined) {
        session.status = "failed";
        session.error =
          error instanceof Error ? error.message : "Unknown error";
      }
    });

    return Promise.resolve({ kind: "Ok" as const, value: sessionId });
  }

  getAttackStatus(sessionId: string): Promise<
    Result<{
      status: string;
      progress: number;
      results: AttackResult[];
      totalAttacks: number;
      completedAttacks: number;
      isComplete: boolean;
    }>
  > {
    const session = GraphQLAttackService.attackSessions.get(sessionId);

    if (session === undefined) {
      return Promise.resolve({
        kind: "Error" as const,
        error: "Attack session not found",
      });
    }

    return Promise.resolve({
      kind: "Ok" as const,
      value: {
        status: session.status,
        progress: session.progress,
        results: session.results,
        totalAttacks: session.totalAttacks,
        completedAttacks: session.completedAttacks,
        isComplete:
          session.status === "completed" ||
          session.status === "failed" ||
          session.status === "cancelled",
      },
    });
  }

  cancelAttackSession(sessionId: string): Promise<Result<void>> {
    const session = GraphQLAttackService.attackSessions.get(sessionId);

    if (session === undefined) {
      return Promise.resolve({
        kind: "Error" as const,
        error: "Attack session not found",
      });
    }

    session.status = "cancelled";
    return Promise.resolve({ kind: "Ok" as const, value: undefined });
  }

  private async executeAttacksRealTime(
    sessionId: string,
    config: AttackConfig,
  ): Promise<void> {
    const session = GraphQLAttackService.attackSessions.get(sessionId);
    if (session === undefined) {
      return;
    }

    try {
      for (let i = 0; i < config.attackTypes.length; i++) {
        if (session.status === "cancelled") {
          break;
        }

        const attackType = config.attackTypes[i];
        if (!attackType) continue;

        session.progress = (i / config.attackTypes.length) * 100;
        session.currentAttack = attackType;

        const attackResult = await this.executeAttack(attackType, config);

        if (attackResult.kind === "Ok") {
          session.results.push(attackResult.value);
        } else {
          session.results.push({
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

        session.completedAttacks = i + 1;
        session.progress = ((i + 1) / config.attackTypes.length) * 100;
      }

      session.status = "completed";
      session.progress = 100;
      session.endTime = new Date();
    } catch (error) {
      session.status = "failed";
      session.error = error instanceof Error ? error.message : "Unknown error";
    }
  }
}
