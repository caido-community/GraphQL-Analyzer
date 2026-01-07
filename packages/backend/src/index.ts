import type { DefineAPI, SDK } from "caido:plugin";
import type { AttackConfig, Result } from "shared";

import { GraphQLAttackService } from "./api/attacks";
import { GraphQLService } from "./api/graphql";
import { setSDK } from "./sdk";

export type {
  Result,
  GraphQLSchema,
  GraphQLField,
  GraphQLArg,
  GraphQLType,
  GraphQLEnum,
  GraphQLInterface,
  GraphQLUnion,
  GraphQLScalar,
  PointOfInterest,
  AttackType,
  AttackResult,
  AttackFinding,
  AttackConfig,
  AttackSession,
} from "shared";

export { type BackendEvents } from "./types";

const testGraphQLEndpoint = async (
  sdk: SDK,
  url: string,
  customHeaders?: Record<string, string>,
) => {
  const graphqlService = new GraphQLService(sdk);
  return await graphqlService.testEndpoint(url, customHeaders);
};

const testGraphQLEndpointFromRequest = async (
  sdk: SDK,
  requestId: string,
  customHeaders?: Record<string, string>,
) => {
  const graphqlService = new GraphQLService(sdk);
  return await graphqlService.testEndpointFromRequest(requestId, customHeaders);
};

const generateGraphQLQuery = (
  sdk: SDK,
  field: {
    name: string;
    args?: Array<{ name: string; rawType?: unknown; type?: unknown }>;
    rawType?: unknown;
    type?: unknown;
  },
  operationType: "query" | "mutation" | "subscription",
  allTypes: unknown[],
  maxDepth: number = 200,
) => {
  const graphqlService = new GraphQLService(sdk);
  return graphqlService.generateGraphQLQuery(
    field as Parameters<typeof graphqlService.generateGraphQLQuery>[0],
    operationType,
    allTypes as Parameters<typeof graphqlService.generateGraphQLQuery>[2],
    maxDepth,
  );
};

const executeGraphQLQuery = async (
  sdk: SDK,
  url: string,
  payload: {
    query: string;
    variables?: Record<string, unknown>;
    operationName?: string;
  },
) => {
  const graphqlService = new GraphQLService(sdk);
  return await graphqlService.executeQuery(url, payload);
};

const executeGraphQLAttacks = async (sdk: SDK, config: AttackConfig) => {
  const attackService = new GraphQLAttackService(sdk);
  return await attackService.executeAttacks(config);
};

const startGraphQLAttacks = async (
  sdk: SDK,
  config: AttackConfig,
): Promise<Result<string>> => {
  const attackService = new GraphQLAttackService(sdk);
  return await attackService.startAttacksAsync(config);
};

const getAttackStatus = async (
  sdk: SDK,
  sessionId: string,
): Promise<Result<Record<string, unknown>>> => {
  const attackService = new GraphQLAttackService(sdk);
  return await attackService.getAttackStatus(sessionId);
};

const cancelAttackSession = async (
  sdk: SDK,
  sessionId: string,
): Promise<Result<void>> => {
  const attackService = new GraphQLAttackService(sdk);
  return await attackService.cancelAttackSession(sessionId);
};

const getAttackTemplates = (sdk: SDK) => {
  const attackService = new GraphQLAttackService(sdk);
  return attackService.generateAttackTemplates();
};

const getRequestInfo = async (
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
> => {
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
};

const createCaidoFinding = async (
  sdk: SDK,
  findingData: { title: string; description: string },
  requestId: string,
): Promise<Result<void>> => {
  try {
    if (!requestId) {
      return { kind: "Error", error: "No request ID provided" };
    }

    const result = await sdk.requests.get(requestId);
    if (!result) {
      return { kind: "Error", error: "Request not found in Caido storage" };
    }

    let dedupeKey = `graphql-${findingData.title}`;
    try {
      dedupeKey += `-${result.request.getUrl()}`;
    } catch (e) {
      dedupeKey += `-${Date.now()}`;
    }

    await sdk.findings.create({
      title: findingData.title,
      description: findingData.description,
      reporter: "GraphQL Analyzer",
      request: result.request,
      dedupeKey: dedupeKey,
    });

    return { kind: "Ok", value: undefined };
  } catch (error) {
    return {
      kind: "Error",
      error: `Failed to create Caido finding: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

export type API = DefineAPI<{
  testGraphQLEndpoint: typeof testGraphQLEndpoint;
  testGraphQLEndpointFromRequest: typeof testGraphQLEndpointFromRequest;
  generateGraphQLQuery: typeof generateGraphQLQuery;
  executeGraphQLQuery: typeof executeGraphQLQuery;
  executeGraphQLAttacks: typeof executeGraphQLAttacks;
  startGraphQLAttacks: typeof startGraphQLAttacks;
  getAttackStatus: typeof getAttackStatus;
  cancelAttackSession: typeof cancelAttackSession;
  getAttackTemplates: typeof getAttackTemplates;
  createCaidoFinding: typeof createCaidoFinding;
  getRequestInfo: typeof getRequestInfo;
}>;

export function init(sdk: SDK<API>) {
  setSDK(sdk);

  sdk.api.register("testGraphQLEndpoint", testGraphQLEndpoint);
  sdk.api.register(
    "testGraphQLEndpointFromRequest",
    testGraphQLEndpointFromRequest,
  );
  sdk.api.register("generateGraphQLQuery", generateGraphQLQuery);
  sdk.api.register("executeGraphQLQuery", executeGraphQLQuery);
  sdk.api.register("executeGraphQLAttacks", executeGraphQLAttacks);
  sdk.api.register("startGraphQLAttacks", startGraphQLAttacks);
  sdk.api.register("getAttackStatus", getAttackStatus);
  sdk.api.register("cancelAttackSession", cancelAttackSession);
  sdk.api.register("getAttackTemplates", getAttackTemplates);
  sdk.api.register("createCaidoFinding", createCaidoFinding);
  sdk.api.register("getRequestInfo", getRequestInfo);

  sdk.console.log("GraphQL Analyzer backend initialized");
}
