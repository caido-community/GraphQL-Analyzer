import type { GraphQLSchema, IntrospectionSchema, Result } from "shared";

import { parseIntrospectionResult } from "./parser";

type IntrospectionResult = {
  supportsIntrospection: boolean;
  schema?: GraphQLSchema;
};

export function unwrapBatchedResponse(parsed: unknown): unknown {
  if (Array.isArray(parsed) && parsed.length > 0) {
    return parsed[0];
  }
  return parsed;
}

export function parseIntrospectionResponseBody(
  responseBody: string,
): Result<IntrospectionResult> {
  try {
    const parsed = JSON.parse(responseBody);
    const jsonResponse = unwrapBatchedResponse(parsed) as Record<
      string,
      unknown
    >;

    if (Array.isArray(jsonResponse.errors) && jsonResponse.errors.length > 0) {
      const introspectionDisabled = jsonResponse.errors.some(
        (error: { message?: string }) => {
          const message = error.message;
          return (
            typeof message === "string" &&
            (message.toLowerCase().includes("introspection") ||
              message.toLowerCase().includes("disabled") ||
              message.toLowerCase().includes("not allowed"))
          );
        },
      );

      if (introspectionDisabled === true) {
        return { kind: "Ok", value: { supportsIntrospection: false } };
      }

      const errorMessages = (jsonResponse.errors as Array<{ message?: string }>)
        .map((e) => e.message ?? "Unknown error")
        .join(", ");
      return {
        kind: "Error",
        error: `GraphQL error: ${errorMessages}`,
      };
    }

    if (
      jsonResponse.data !== undefined &&
      (jsonResponse.data as Record<string, unknown>).__schema !== undefined
    ) {
      const schema = parseIntrospectionResult(
        (jsonResponse.data as Record<string, unknown>)
          .__schema as IntrospectionSchema,
      );
      (
        schema as GraphQLSchema & { rawIntrospection?: unknown }
      ).rawIntrospection = jsonResponse.data;
      return { kind: "Ok", value: { supportsIntrospection: true, schema } };
    }

    if (jsonResponse.data !== undefined) {
      return {
        kind: "Error",
        error:
          "GraphQL endpoint responded but introspection is disabled or not available.",
      };
    }

    return {
      kind: "Error",
      error: "Endpoint returned JSON but it's not a valid GraphQL response.",
    };
  } catch {
    const preview = responseBody.substring(0, 100);
    return { kind: "Error", error: `Invalid JSON response: ${preview}...` };
  }
}

export function parseQueryResponseBody(
  responseBody: string,
): Result<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(responseBody);
    const json = unwrapBatchedResponse(parsed);
    return { kind: "Ok", value: json as Record<string, unknown> };
  } catch {
    return {
      kind: "Error",
      error: "Invalid JSON response",
    };
  }
}
