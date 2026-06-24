import type { SDK } from "caido:plugin";
import type { GraphQLSchema, Result, SchemaImportResult } from "shared";

import { GraphQLService } from "../services/graphql";
import { parseSchemaFromFileContent } from "../services/graphql/schemaImporter";

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
    raw: string;
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
        raw: request.getRaw().toText(),
      },
    };
  } catch (error) {
    return {
      kind: "Error",
      error: `Failed to get request info: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export function importSchemaFromFile(
  _sdk: SDK,
  fileContent: string,
  fileName: string,
): Result<SchemaImportResult & { fileName: string }> {
  const result = parseSchemaFromFileContent(fileContent);

  if (result.kind === "Error") {
    return result;
  }

  return {
    kind: "Ok",
    value: {
      ...result.value,
      fileName,
    },
  };
}
