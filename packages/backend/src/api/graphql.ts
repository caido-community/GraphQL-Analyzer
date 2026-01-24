import type { SDK } from "caido:plugin";
import type { GraphQLSchema, Result } from "shared";

import { GraphQLService } from "../services/graphql";

export async function testGraphQLEndpoint(
  sdk: SDK,
  url: string,
  customHeaders?: Record<string, string>,
): Promise<Result<{ supportsIntrospection: boolean; schema?: GraphQLSchema }>> {
  const graphqlService = new GraphQLService(sdk);
  return graphqlService.testEndpoint(url, customHeaders);
}

export async function testGraphQLEndpointFromRequest(
  sdk: SDK,
  requestId: string,
  customHeaders?: Record<string, string>,
): Promise<Result<{ supportsIntrospection: boolean; schema?: GraphQLSchema }>> {
  const graphqlService = new GraphQLService(sdk);
  return graphqlService.testEndpointFromRequest(requestId, customHeaders);
}

export function generateGraphQLQuery(
  sdk: SDK,
  field: {
    name: string;
    args?: Array<{ name: string; rawType?: unknown; type?: unknown }>;
    rawType?: unknown;
    type?: unknown;
  },
  operationType: "query" | "mutation" | "subscription",
  allTypes: unknown[],
  maxDepth: number = 5,
): string {
  const service = new GraphQLService(sdk);
  const query = service.generateGraphQLQuery(
    field as Parameters<typeof service.generateGraphQLQuery>[0],
    operationType,
    allTypes as Parameters<typeof service.generateGraphQLQuery>[2],
    maxDepth,
  );
  return query;
}

export async function executeGraphQLQuery(
  sdk: SDK,
  url: string,
  payload: {
    query: string;
    variables?: Record<string, unknown>;
    operationName?: string;
  },
): Promise<Result<Record<string, unknown>>> {
  const graphqlService = new GraphQLService(sdk);
  return graphqlService.executeQuery(url, payload);
}

export async function getRequestInfo(
  sdk: SDK,
  requestId: string,
): Promise<
  Result<{
    host: string;
    port: number;
    path: string;
    url: string;
    method: string;
  }>
> {
  try {
    if (!requestId) {
      return { kind: "Error", error: "No request ID provided" };
    }

    const result = await sdk.requests.get(requestId);
    if (!result) {
      return { kind: "Error", error: "Request not found" };
    }

    const request = result.request;
    return {
      kind: "Ok",
      value: {
        host: request.getHost(),
        port: request.getPort(),
        path: request.getPath(),
        url: request.getUrl(),
        method: request.getMethod(),
      },
    };
  } catch (error) {
    return {
      kind: "Error",
      error: `Failed to get request info: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
