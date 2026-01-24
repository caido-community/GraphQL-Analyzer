import { z } from "zod/v4";

const GraphQLIntrospectionDataSchema = z.object({
  __schema: z.unknown().optional(),
  __type: z.unknown().optional(),
});

const GraphQLErrorSchema = z.object({
  message: z.string().optional(),
});

const GraphQLResponseSchema = z.object({
  data: GraphQLIntrospectionDataSchema.optional(),
  errors: z.array(GraphQLErrorSchema).optional(),
});

const BatchQueryResponseSchema = z.array(z.unknown());

export type GraphQLResponse = z.infer<typeof GraphQLResponseSchema>;

export function parseGraphQLResponse(body: string):
  | {
      kind: "Ok";
      value: GraphQLResponse;
    }
  | {
      kind: "Error";
      error: string;
    } {
  try {
    const json = JSON.parse(body);
    const result = GraphQLResponseSchema.safeParse(json);
    if (!result.success) {
      return { kind: "Error", error: z.prettifyError(result.error) };
    }
    return { kind: "Ok", value: result.data };
  } catch (e) {
    return {
      kind: "Error",
      error: e instanceof Error ? e.message : "Invalid JSON",
    };
  }
}

export function parseBatchResponse(body: string):
  | {
      kind: "Ok";
      value: unknown[];
    }
  | {
      kind: "Error";
      error: string;
    } {
  try {
    const json = JSON.parse(body);
    const result = BatchQueryResponseSchema.safeParse(json);
    if (!result.success) {
      return { kind: "Error", error: z.prettifyError(result.error) };
    }
    return { kind: "Ok", value: result.data };
  } catch (e) {
    return {
      kind: "Error",
      error: e instanceof Error ? e.message : "Invalid JSON",
    };
  }
}

export function hasIntrospectionDisabledError(
  errors: Array<{ message?: string }>,
): boolean {
  return errors.some((err) => {
    const msg = err.message?.toLowerCase() ?? "";
    return (
      msg.includes("introspection") ||
      msg.includes("disabled") ||
      msg.includes("not allowed")
    );
  });
}

export function hasDepthLimitError(
  errors: Array<{ message?: string }>,
): boolean {
  return errors.some((err) => {
    const msg = err.message?.toLowerCase() ?? "";
    return (
      msg.includes("depth") || msg.includes("complex") || msg.includes("nested")
    );
  });
}

export function hasComplexityError(
  errors: Array<{ message?: string }>,
): boolean {
  return errors.some((err) => {
    const msg = err.message?.toLowerCase() ?? "";
    return (
      msg.includes("complex") || msg.includes("cost") || msg.includes("limit")
    );
  });
}

export function hasBatchError(errors: Array<{ message?: string }>): boolean {
  return errors.some((err) => {
    const msg = err.message?.toLowerCase() ?? "";
    return (
      msg.includes("batch") || msg.includes("array") || msg.includes("multiple")
    );
  });
}
