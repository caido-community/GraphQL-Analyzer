export type HttpMessage = {
  method: string;
  headers: Record<string, string>;
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

  let parts = raw.split("\r\n\r\n");
  if (parts.length < 2) {
    parts = raw.split("\n\n");
    if (parts.length < 2) return undefined;
  }

  const headerSection = parts[0] ?? "";
  const separator = raw.includes("\r\n") ? "\r\n\r\n" : "\n\n";
  const body = parts.slice(1).join(separator);

  const eol = headerSection.includes("\r\n") ? "\r\n" : "\n";
  const lines = headerSection.split(eol);
  const method = (lines[0] ?? "").match(/^(\w+)\s+/)?.[1] ?? "UNKNOWN";

  const headers: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || line === "") continue;
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const name = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      if (name !== "" && value !== "") {
        headers[name] = value;
      }
    }
  }

  return { method, headers, body };
};

const operationPattern = /^\s*(query|mutation|subscription|fragment)\b/i;
const anonymousPattern = /^\{\s*[A-Za-z_]/;

const looksLikeGraphQLQuery = (text: string): boolean => {
  const trimmed = text.trim();
  if (trimmed === "") return false;
  return operationPattern.test(trimmed) || anonymousPattern.test(trimmed);
};

export const extractGraphQLOperation = (
  body: string,
): GraphQLOperation | undefined => {
  const trimmed = body.trim();
  if (trimmed === "") return undefined;

  try {
    const json = JSON.parse(trimmed) as {
      query?: unknown;
      variables?: unknown;
      operationName?: unknown;
      extensions?: { persistedQuery?: { sha256Hash?: unknown } };
    };

    const query = typeof json.query === "string" ? json.query : "";
    const operationName =
      typeof json.operationName === "string" ? json.operationName : undefined;
    const hasOperationName =
      operationName !== undefined && operationName.trim() !== "";
    const persistedQuery = json.extensions?.persistedQuery;
    const persistedQueryHash =
      typeof persistedQuery?.sha256Hash === "string"
        ? persistedQuery.sha256Hash
        : undefined;

    if (
      query.trim() !== "" ||
      hasOperationName ||
      persistedQuery !== undefined
    ) {
      return {
        query,
        variables: json.variables,
        operationName,
        persistedQueryHash,
      };
    }

    return undefined;
  } catch {
    if (looksLikeGraphQLQuery(trimmed)) {
      return { query: trimmed };
    }
    return undefined;
  }
};

export const isGraphQLRequest = (raw: string): boolean => {
  const message = parseHttpMessage(raw);
  if (message === undefined) return false;
  if (message.method.toUpperCase() !== "POST") return false;
  return extractGraphQLOperation(message.body) !== undefined;
};
