import { HttpForge } from "ts-http-forge";
import { z } from "zod";

export type HttpMessage = {
  method: string;
  body: string;
};

export type GraphQLOperation = {
  query: string;
  variables?: unknown;
  operationName?: string;
  persistedQueryHash?: string;
};

export const parseHttpMessage = (raw: string): HttpMessage | undefined => {
  if (raw.trim() === "") return undefined;

  const forge = HttpForge.create(raw);

  return {
    method: forge.getMethod() ?? "UNKNOWN",
    body: forge.getBody() ?? "",
  };
};

export const replaceHttpBody = (raw: string, body: string): string => {
  const length = new TextEncoder().encode(body).length;
  return HttpForge.create(raw)
    .body(body)
    .setHeader("Content-Length", String(length))
    .build();
};

const operationPattern = /^\s*(query|mutation|subscription|fragment)\b/i;
const anonymousPattern = /^\{\s*[A-Za-z_]/;

const looksLikeGraphQLQuery = (text: string): boolean => {
  const trimmed = text.trim();
  if (trimmed === "") return false;
  return operationPattern.test(trimmed) || anonymousPattern.test(trimmed);
};

const graphqlBodySchema = z.object({
  query: z.string().optional(),
  variables: z.unknown().optional(),
  operationName: z.string().optional(),
  extensions: z
    .object({
      persistedQuery: z
        .object({ sha256Hash: z.string().optional() })
        .optional(),
    })
    .optional(),
});

export const extractGraphQLOperation = (
  body: string,
): GraphQLOperation | undefined => {
  const trimmed = body.trim();
  if (trimmed === "") return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return looksLikeGraphQLQuery(trimmed) ? { query: trimmed } : undefined;
  }

  const result = graphqlBodySchema.safeParse(parsed);
  if (!result.success) return undefined;

  const data = result.data;
  const persistedQueryHash = data.extensions?.persistedQuery?.sha256Hash;
  const hasQuery = data.query !== undefined && data.query.trim() !== "";
  const hasOperationName =
    data.operationName !== undefined && data.operationName.trim() !== "";

  if (hasQuery || hasOperationName || persistedQueryHash !== undefined) {
    return {
      query: data.query ?? "",
      variables: data.variables,
      operationName: data.operationName,
      persistedQueryHash,
    };
  }

  return undefined;
};

export const isGraphQLRequest = (raw: string): boolean => {
  const message = parseHttpMessage(raw);
  if (message === undefined) return false;
  if (message.method.toUpperCase() !== "POST") return false;
  return extractGraphQLOperation(message.body) !== undefined;
};
