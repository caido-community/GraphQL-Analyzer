import type { SDK } from "caido:plugin";
import type { Request, Response } from "caido:utils";
import { RequestSpec } from "caido:utils";

import type { Result, AttackType, AttackResult, AttackFinding, AttackConfig } from "../types";

export class GraphQLAttackService {
  private static attackSessions: Map<string, any> = new Map();
  
  constructor(private sdk: SDK) {}

  // Add headers to RequestSpec
  private addHeaders(spec: RequestSpec, config: AttackConfig) {
    let finalHeaders: Record<string, string> = {};

    if (config.useOriginalHeaders && config.originalHeaders) {
      // Use original request headers as base
      finalHeaders = { ...config.originalHeaders };
      
      // Ensure critical GraphQL headers are set correctly
      finalHeaders["Content-Type"] = "application/json";
      finalHeaders["Accept"] = "application/json";
      
      // Remove query-related headers that might interfere
      delete finalHeaders["Content-Length"];
      
    } else {
      // Use default headers
      finalHeaders = {
        "Content-Type": "application/json",
        "Accept": "application/json", 
        "User-Agent": "GraphQL-Analyzer/1.0"
      };
    }

    // Apply custom headers (these always override everything)
    if (config.customHeaders) {
      for (const [customName, customValue] of Object.entries(config.customHeaders)) {
        if (customName && customValue) {
          // Check for header conflicts
          const matchingKey = Object.keys(finalHeaders).find(
            existingKey => existingKey.toLowerCase() === customName.toLowerCase()
          );
          
          if (matchingKey) {
            // Override the existing header
            delete finalHeaders[matchingKey];
            finalHeaders[customName] = customValue;
          } else {
            // Add new custom header
            finalHeaders[customName] = customValue;
          }
        }
      }
    }

    // Set all final headers
    for (const [name, value] of Object.entries(finalHeaders)) {
      if (value) {
        spec.setHeader(name, value);
      }
    }
  }

  // Execute multiple attack types
  async executeAttacks(config: AttackConfig): Promise<Result<AttackResult[]>> {
    try {
      const results: AttackResult[] = [];
      
      for (let i = 0; i < config.attackTypes.length; i++) {
        const attackType = config.attackTypes[i];
        const attackResult = await this.executeAttack(attackType, config);
        
        if (attackResult.kind === "Ok") {
          results.push(attackResult.value);
        } else {
          // Add failed attack result
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
            totalRequests: 1
          });
        }
      }

      return { kind: "Ok", value: results };
    } catch (error) {
      return {
        kind: "Error",
        error: error instanceof Error ? error.message : "Unknown attack execution error"
      };
    }
  }

  // Execute single attack type
  private async executeAttack(attackType: AttackType, config: AttackConfig): Promise<Result<AttackResult>> {
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

  // Introspection Attack - Tests if schema introspection is enabled with multiple retries
  private async executeIntrospectionAttack(config: AttackConfig): Promise<Result<AttackResult>> {
    const attackId = `introspection-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const findings: AttackFinding[] = [];
    
    // Single introspection query for faster execution (was 4 queries)
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
        }`
      }
    ];

    let lastRequest: Request | undefined;
    let lastResponse: Response | undefined;
    let combinedPayload = "";
    let totalTiming = 0;
    let totalRequests = 0;
    
    for (const queryTest of introspectionQueries) {
      // Try each query multiple times (2-3 retries) to ensure reliability
      const maxRetries = 3;
      let introspectionFound = false;
      
      for (let retry = 0; retry < maxRetries && !introspectionFound; retry++) {
        try {
          const payload = JSON.stringify({
            query: queryTest.query,
            variables: {}
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
          
          // Store the request/response data - ensure we always have valid data
          if (result.request) {
            lastRequest = result.request;
          }
          if (result.response) {
            lastResponse = result.response;
          }

        if (result.response) {
          const responseBody = result.response.getBody()?.toText() || "";
          
          if (result.response.getCode() === 200) {
            try {
              const jsonResponse = JSON.parse(responseBody);
              
                              if (jsonResponse.data && (jsonResponse.data.__schema || jsonResponse.data.__type)) {
                  introspectionFound = true;
                  findings.push({
                    severity: "high",
                    title: `GraphQL Introspection Enabled (${queryTest.name})`,
                    description: `The GraphQL endpoint allows introspection queries via ${queryTest.name}, which completely exposes the schema structure including all types, fields, mutations, and subscriptions. This information disclosure vulnerability enables attackers to understand the full API surface and craft targeted attacks against exposed functionality.`,
                    evidence: `${queryTest.name} successful on retry ${retry + 1}: ${jsonResponse.data.__schema ? `Exposed schema with ${jsonResponse.data.__schema.types?.length || 0} types, including sensitive type information and field definitions` : 'Type information and field structure exposed'}`,
                    recommendation: "Disable introspection in production environments immediately. Most GraphQL implementations allow disabling introspection via configuration (e.g., Apollo Server's introspection: false). This prevents schema structure discovery while maintaining normal API functionality."
                  });

                  // Note: Caido findings are now created manually by user from the frontend
                  
                  break; // Found introspection, no need to retry this query
              }
            } catch (parseError) {
              // Continue to next test
            }
          }
        }
              } catch (error) {

        }
      }
      
      // If we found introspection with this query, no need to test other queries
      if (introspectionFound) {
        break;
      }
    }

    // If no introspection found, that's good - no finding needed for proper security behavior

    const result: AttackResult = {
      id: attackId,
      attackType: "introspection",
      targetUrl: config.targetUrl,
      payload: combinedPayload.trim(),
      sentAt: new Date(),
      response: lastResponse ? {
        statusCode: lastResponse.getCode(),
        body: lastResponse.getBody()?.toText() || "",
        headers: lastResponse.getHeaders(),
        timing: totalTiming
      } : undefined,
      rawRequest: lastRequest?.getRaw()?.toText() || combinedPayload,
      rawResponse: lastResponse?.getRaw()?.toText() || "",
      requestId: lastRequest?.getId()?.toString(),
      findings,
      status: "completed",
      requestsExecuted: totalRequests,
      totalRequests: totalRequests
    };

    return { kind: "Ok", value: result };
  }

  // Depth Attack - Tests for query depth limits with multiple depth levels
  private async executeDepthAttack(config: AttackConfig): Promise<Result<AttackResult>> {
    const attackId = `depth-limit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const findings: AttackFinding[] = [];
    const maxDepth = config.maxDepth || 20;
    
    // Test fewer depth levels for faster execution (was [5, 10, 15, maxDepth])
    const depthTests = [10, maxDepth];
    let lastRequest: Request | undefined;
    let lastResponse: Response | undefined;
    let combinedPayload = "";
    let totalTiming = 0;
    let protectionFound = false;
    
    for (const depth of depthTests) {
      try {
        // Generate deeply nested query
        let nestedQuery = "id";
        for (let i = 0; i < depth; i++) {
          nestedQuery = `user { ${nestedQuery} }`;
        }
        
        const depthQuery = `query DepthAttack${depth} { ${nestedQuery} }`;
        const payload = JSON.stringify({
          query: depthQuery,
          variables: {}
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
        
        // Store the request/response data - ensure we always have valid data
        if (result.request) {
          lastRequest = result.request;
        }
        if (result.response) {
          lastResponse = result.response;
        }

        if (result.response) {
          const responseBody = result.response.getBody()?.toText() || "";
          
          if (result.response.getCode() === 200) {
            if (depth === maxDepth) {
              findings.push({
                severity: "high",
                title: "No Query Depth Limit Detected",
                description: `The GraphQL endpoint accepts deeply nested queries up to ${maxDepth} levels without any depth restrictions. This lack of query depth limiting can be exploited by attackers to cause Denial of Service (DoS) by sending extremely nested queries that consume excessive server resources and memory, potentially crashing the application or degrading performance for legitimate users.`,
                evidence: `Successfully executed query with ${maxDepth} levels of deep nesting (${totalTiming}ms total execution time). The server processed the nested query without rejecting it, indicating no depth limits are configured.`,
                recommendation: "Implement query depth limiting immediately to prevent DoS attacks. Most GraphQL servers support depth analysis (e.g., Apollo Server with 'graphql-depth-limit', GraphQL-Java with depth analysis). Set a reasonable depth limit (typically 5-15 levels) based on your application's legitimate use cases."
              });

            }
          } else if (result.response.getCode() === 400) {
            try {
              const jsonResponse = JSON.parse(responseBody);
              if (jsonResponse.errors?.some((e: any) => 
                e.message?.toLowerCase().includes("depth") || 
                e.message?.toLowerCase().includes("complex") ||
                e.message?.toLowerCase().includes("nested")
              )) {
                protectionFound = true;
                // Protection found - this is good security behavior, no finding needed
                break; // Found protection, no need to test deeper
              }
            } catch {
              // Continue testing
            }
          }
        }
      } catch (error) {

      }
    }

    // If no protection found and no high-severity findings, add medium finding


    const result: AttackResult = {
      id: attackId,
      attackType: "depth-limit",
      targetUrl: config.targetUrl,
      payload: combinedPayload.trim(),
      sentAt: new Date(),
      response: lastResponse ? {
        statusCode: lastResponse.getCode(),
        body: lastResponse.getBody()?.toText() || "",
        headers: lastResponse.getHeaders(),
        timing: totalTiming
      } : undefined,
      rawRequest: lastRequest?.getRaw()?.toText() || combinedPayload,
      rawResponse: lastResponse?.getRaw()?.toText() || "",
      requestId: lastRequest?.getId()?.toString(),
      findings,
      status: "completed",
      requestsExecuted: depthTests.length,
      totalRequests: depthTests.length
    };

    return { kind: "Ok", value: result };
  }

  // Complexity Attack - Tests for query complexity limits with escalating complexity
  private async executeComplexityAttack(config: AttackConfig): Promise<Result<AttackResult>> {
    const attackId = `complexity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const findings: AttackFinding[] = [];
    
    // Test increasing complexity levels
    const complexityTests = [
      {
        name: "Medium Complexity", 
        query: `query MediumComplexity { 
          users { 
            id name email 
            posts { id title } 
          } 
        }`
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
        }`
      }
    ];

    let lastRequest: Request | undefined;
    let lastResponse: Response | undefined;
    let combinedPayload = "";
    let totalTiming = 0;
    let protectionFound = false;
    
    for (const complexityTest of complexityTests) {
      try {
        const payload = JSON.stringify({
          query: complexityTest.query,
          variables: {}
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
        
        // Store the request/response data - ensure we always have valid data
        if (result.request) {
          lastRequest = result.request;
        }
        if (result.response) {
          lastResponse = result.response;
        }

        if (result.response) {
          const responseBody = result.response.getBody()?.toText() || "";
          
          if (result.response.getCode() === 200) {
            if (timing > 5000 && complexityTest.name.includes("High")) {
              findings.push({
                severity: "high",
                title: "High Query Complexity Accepted",
                description: `The GraphQL endpoint accepts high-complexity queries that can cause significant resource consumption and potential Denial of Service. The server processed a complex query with multiple nested fields and relationships in ${timing}ms, indicating no query complexity analysis or cost limiting is implemented. Attackers can exploit this to overload the server with resource-intensive queries.`,
                evidence: `${complexityTest.name} executed successfully with ${timing}ms response time. The complex query with multiple field selections and nested relationships was processed without rejection, indicating absence of complexity analysis.`,
                recommendation: "Implement query complexity analysis immediately to prevent resource exhaustion attacks. Use tools like 'graphql-query-complexity' for Apollo Server or similar cost analysis for other GraphQL implementations. Set reasonable complexity limits (typically 100-1000 points) and consider implementing query whitelisting for known safe queries."
              });

              // Note: Caido findings are now created manually by user from the frontend
            }
          } else if (result.response.getCode() === 400) {
            try {
              const jsonResponse = JSON.parse(responseBody);
              if (jsonResponse.errors?.some((e: any) => 
                e.message?.toLowerCase().includes("complex") ||
                e.message?.toLowerCase().includes("cost") ||
                e.message?.toLowerCase().includes("limit")
              )) {
                protectionFound = true;
                // Protection found - this is good security behavior, no finding needed
              }
            } catch {
              // Continue testing
            }
          }
        }
      } catch (error) {

      }
    }



    const result: AttackResult = {
      id: attackId,
      attackType: "query-complexity",
      targetUrl: config.targetUrl,
      payload: combinedPayload.trim(),
      sentAt: new Date(),
      response: lastResponse ? {
        statusCode: lastResponse.getCode(),
        body: lastResponse.getBody()?.toText() || "",
        headers: lastResponse.getHeaders(),
        timing: totalTiming
      } : undefined,
      rawRequest: lastRequest?.getRaw()?.toText() || combinedPayload,
      rawResponse: lastResponse?.getRaw()?.toText() || "",
      requestId: lastRequest?.getId()?.toString(),
      findings,
      status: "completed",
      requestsExecuted: complexityTests.length,
      totalRequests: complexityTests.length
    };

    return { kind: "Ok", value: result };
  }

  // Batch Attack - Tests for batch query limits with increasing batch sizes
  private async executeBatchAttack(config: AttackConfig): Promise<Result<AttackResult>> {
    const attackId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const findings: AttackFinding[] = [];
    const maxBatchSize = config.batchSize || 10;
    
    // Test fewer batch sizes for faster execution (was [2, 5, maxBatchSize, maxBatchSize * 2])
    const batchTests = [5, maxBatchSize];
    let lastRequest: Request | undefined;
    let lastResponse: Response | undefined;
    let combinedPayload = "";
    let totalTiming = 0;
    let protectionFound = false;
    
    for (const batchSize of batchTests) {
      try {
        // Generate batch query array
        const queries = [];
        for (let i = 0; i < batchSize; i++) {
          queries.push({
            query: `query Batch${i} { __typename }`,
            variables: {}
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
        
        // Store the request/response data - ensure we always have valid data
        if (result.request) {
          lastRequest = result.request;
        }
        if (result.response) {
          lastResponse = result.response;
        }

        if (result.response) {
          const responseBody = result.response.getBody()?.toText() || "";
          
          if (result.response.getCode() === 200) {
            try {
              const jsonResponse = JSON.parse(responseBody);
              if (Array.isArray(jsonResponse) && jsonResponse.length === batchSize) {
                if (batchSize >= maxBatchSize) {
                  findings.push({
                    severity: "medium",
                    title: "Batch Queries Allowed",
                    description: `The GraphQL endpoint accepts batch queries (${batchSize} queries processed).`,
                    evidence: `Successfully processed ${batchSize} queries in single request`,
                    recommendation: "Consider implementing batch query limits to prevent resource exhaustion."
                  });
                }
              }
            } catch {
              // Non-JSON response to batch query
            }
          } else if (result.response.getCode() === 400) {
            try {
              const jsonResponse = JSON.parse(responseBody);
              if (jsonResponse.errors?.some((e: any) => 
                e.message?.toLowerCase().includes("batch") ||
                e.message?.toLowerCase().includes("array") ||
                e.message?.toLowerCase().includes("multiple")
              )) {
                protectionFound = true;
                // Protection found - this is good security behavior, no finding needed
                break; // Found protection
              }
            } catch {
              // Continue testing
            }
          }
        }
      } catch (error) {

      }
    }

    // If no clear protection found and no findings, no need to create "unclear" findings
    // Only actual vulnerabilities should create findings

    const result: AttackResult = {
      id: attackId,
      attackType: "batch-query",
      targetUrl: config.targetUrl,
      payload: combinedPayload.trim(),
      sentAt: new Date(),
      response: lastResponse ? {
        statusCode: lastResponse.getCode(),
        body: lastResponse.getBody()?.toText() || "",
        headers: lastResponse.getHeaders(),
        timing: totalTiming
      } : undefined,
      rawRequest: lastRequest?.getRaw()?.toText() || combinedPayload,
      rawResponse: lastResponse?.getRaw()?.toText() || "",
      requestId: lastRequest?.getId()?.toString(),
      findings,
      status: "completed",
      requestsExecuted: batchTests.length,
      totalRequests: batchTests.length
    };

    return { kind: "Ok", value: result };
  }

  // Field Suggestion Attack - Tests for field suggestion vulnerabilities with multiple probes
  private async executeFieldSuggestionAttack(config: AttackConfig): Promise<Result<AttackResult>> {
    const attackId = `field-suggestion-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const findings: AttackFinding[] = [];
    
    // Test different types of malformed queries to trigger suggestions
    const suggestionTests = [
      {
        name: "Non-existent Fields",
        query: `query FieldSuggestion1 {
          nonExistentField12345
          anotherBadField98765
        }`
      },
      {
        name: "Typo Fields",
        query: `query FieldSuggestion2 {
          usr
          ide
          nam
        }`
      },
      {
        name: "Admin-like Fields",
        query: `query FieldSuggestion3 {
          adminUser
          secretKey
          internalData
        }`
      }
    ];

    let lastRequest: Request | undefined;
    let lastResponse: Response | undefined;
    let combinedPayload = "";
    let totalTiming = 0;
    let suggestionsFound = false;
    
    for (const test of suggestionTests) {
      try {
        const payload = JSON.stringify({
          query: test.query,
          variables: {}
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
        
        // Store the request/response data - ensure we always have valid data
        if (result.request) {
          lastRequest = result.request;
        }
        if (result.response) {
          lastResponse = result.response;
        }

        if (result.response && result.response.getCode() === 400) {
          const responseBody = result.response.getBody()?.toText() || "";
          try {
            const jsonResponse = JSON.parse(responseBody);
            if (jsonResponse.errors) {
              const suggestiveErrors = jsonResponse.errors.filter((error: any) => 
                error.message?.includes("Did you mean") || 
                error.message?.includes("Perhaps you meant") ||
                error.message?.match(/Cannot query field .+ on type .+\. Did you mean .+\?/)
              );

              if (suggestiveErrors.length > 0) {
                suggestionsFound = true;
                findings.push({
                  severity: "low",
                  title: `Field Suggestion Information Disclosure (${test.name})`,
                  description: "The GraphQL endpoint provides field suggestions in error messages, potentially revealing schema information.",
                  evidence: suggestiveErrors.map((e: any) => e.message).join("; "),
                  recommendation: "Consider disabling detailed error messages in production to prevent schema enumeration."
                });
              }
            }
          } catch {
            // Continue testing other queries
          }
        }
      } catch (error) {

      }
    }

    // If no suggestions found, that's good - no finding needed for proper security behavior

    const result: AttackResult = {
      id: attackId,
      attackType: "field-suggestion",
      targetUrl: config.targetUrl,
      payload: combinedPayload.trim(),
      sentAt: new Date(),
      response: lastResponse ? {
        statusCode: lastResponse.getCode(),
        body: lastResponse.getBody()?.toText() || "",
        headers: lastResponse.getHeaders(),
        timing: totalTiming
      } : undefined,
      rawRequest: lastRequest?.getRaw()?.toText() || combinedPayload,
      rawResponse: lastResponse?.getRaw()?.toText() || "",
      requestId: lastRequest?.getId()?.toString(),
      findings,
      status: "completed",
      requestsExecuted: suggestionTests.length,
      totalRequests: suggestionTests.length
    };

    return { kind: "Ok", value: result };
  }



  // Create Caido finding for security issues
  private async createCaidoFinding(finding: AttackFinding, request: Request): Promise<void> {
    try {
      if (finding.severity === "critical" || finding.severity === "high") {
        await this.sdk.findings.create({
          title: `GraphQL ${finding.title}`,
          description: `${finding.description}\n\n**Evidence**: ${finding.evidence}\n\n**Recommendation**: ${finding.recommendation}`,
          reporter: "GraphQL Analyzer",
          request: request
        });

      }
    } catch (error) {

    }
  }

  // Generate attack templates for manual testing 
  generateAttackTemplates(): Record<AttackType, { name: string; description: string; query: string }> {
    return {
      "introspection": {
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
}`
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
}`
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
}`
      },
      "batch-query": {
        name: "Batch Query Attack",
        description: "Tests batch query processing limits",
        query: `[
  {"query": "query { __typename }"},
  {"query": "query { __typename }"},
  {"query": "query { __typename }"}
]`
      },
      "field-suggestion": {
        name: "Field Suggestion Probe",
        description: "Tests for information disclosure via error messages",
        query: `query FieldSuggestion {
  nonExistentField
  anotherBadField
  secretAdminField
}`
      }
    };
  }

  // Start attacks asynchronously
  async startAttacksAsync(config: AttackConfig): Promise<Result<string>> {
    const sessionId = `attack-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Initialize session
    GraphQLAttackService.attackSessions.set(sessionId, {
      config,
      status: 'running',
      progress: 0,
      results: [],
      totalAttacks: config.attackTypes.length,
      completedAttacks: 0,
      startTime: new Date()
    });



    // Start attacks in background with error handling
    this.executeAttacksRealTime(sessionId, config).catch(error => {

      const session = GraphQLAttackService.attackSessions.get(sessionId);
      if (session) {
        session.status = 'failed';
        session.error = error instanceof Error ? error.message : "Unknown error";
      }
    });

    return { kind: "Ok", value: sessionId };
  }

  // Get current attack status and results
  async getAttackStatus(sessionId: string): Promise<Result<any>> {
    const session = GraphQLAttackService.attackSessions.get(sessionId);
    
    if (!session) {
      return { kind: "Error", error: "Attack session not found" };
    }

    return { 
      kind: "Ok", 
      value: {
        status: session.status,
        progress: session.progress,
        results: session.results,
        totalAttacks: session.totalAttacks,
        completedAttacks: session.completedAttacks,
        isComplete: session.status === 'completed' || session.status === 'failed' || session.status === 'cancelled'
      }
    };
  }

  // Cancel attack session
  async cancelAttackSession(sessionId: string): Promise<Result<void>> {
    const session = GraphQLAttackService.attackSessions.get(sessionId);
    
    if (!session) {
      return { kind: "Error", error: "Attack session not found" };
    }

    session.status = 'cancelled';
    return { kind: "Ok", value: undefined };
  }

  // Execute attacks with real-time updates
  private async executeAttacksRealTime(sessionId: string, config: AttackConfig): Promise<void> {
    const session = GraphQLAttackService.attackSessions.get(sessionId);
    if (!session) {
      return;
    }

    try {
      for (let i = 0; i < config.attackTypes.length; i++) {
        // Check if session was cancelled
        if (session.status === 'cancelled') {
          break;
        }

        const attackType = config.attackTypes[i];
        
        // Update progress
        session.progress = (i / config.attackTypes.length) * 100;
        session.currentAttack = attackType;
        
        const attackResult = await this.executeAttack(attackType, config);
        
        if (attackResult.kind === "Ok") {
          session.results.push(attackResult.value);
        } else {
          // Add failed attack result
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
            totalRequests: 1
          });
        }
        
        session.completedAttacks = i + 1;
        session.progress = ((i + 1) / config.attackTypes.length) * 100;
      }

      // Mark as completed
      session.status = 'completed';
      session.progress = 100;
      session.endTime = new Date();

    } catch (error) {
      session.status = 'failed';
      session.error = error instanceof Error ? error.message : "Unknown error";
    }
  }
}
