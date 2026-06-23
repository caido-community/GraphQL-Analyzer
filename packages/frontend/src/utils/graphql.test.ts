import { describe, expect, it } from "vitest";

import {
  extractGraphQLOperation,
  isGraphQLRequest,
  parseHttpMessage,
} from "./graphql";

const rawRequest = (method: string, body: string): string =>
  [
    `${method} /graphql HTTP/1.1`,
    "Host: example.com",
    "Content-Type: application/json",
    `Content-Length: ${body.length}`,
    "",
    body,
  ].join("\r\n");

describe("isGraphQLRequest", () => {
  it("detects a JSON body with a query field", () => {
    const body = JSON.stringify({
      query:
        "query IntrospectionQuery {\n __schema {\n queryType { name }\n }\n }",
      variables: {},
    });
    expect(isGraphQLRequest(rawRequest("POST", body))).toBe(true);
  });

  it("detects a raw query body with an operation name", () => {
    expect(
      isGraphQLRequest(rawRequest("POST", "query GetUser { user { id } }")),
    ).toBe(true);
  });

  it("detects an anonymous operation", () => {
    expect(isGraphQLRequest(rawRequest("POST", "{ user { id } }"))).toBe(true);
  });

  it("detects a mutation", () => {
    expect(isGraphQLRequest(rawRequest("POST", "mutation { logout }"))).toBe(
      true,
    );
  });

  it("detects an Apollo persisted query without an inline query", () => {
    const body = JSON.stringify({
      operationName: "TrackMutation",
      variables: { event: "RUN_EXPLORER_OPERATION" },
      extensions: { persistedQuery: { version: 1, sha256Hash: "abc" } },
    });
    expect(isGraphQLRequest(rawRequest("POST", body))).toBe(true);
  });

  it("detects a JSON body with only an operationName", () => {
    const body = JSON.stringify({ operationName: "GetUser", variables: {} });
    expect(isGraphQLRequest(rawRequest("POST", body))).toBe(true);
  });

  it("ignores non-GraphQL JSON", () => {
    expect(
      isGraphQLRequest(rawRequest("POST", JSON.stringify({ name: "x" }))),
    ).toBe(false);
  });

  it("ignores non-POST requests", () => {
    const body = JSON.stringify({ query: "{ user { id } }" });
    expect(isGraphQLRequest(rawRequest("GET", body))).toBe(false);
  });

  it("ignores empty input", () => {
    expect(isGraphQLRequest("")).toBe(false);
  });
});

describe("extractGraphQLOperation", () => {
  it("returns query, variables and operationName from JSON", () => {
    const op = extractGraphQLOperation(
      JSON.stringify({
        query: "query Q { a }",
        variables: { id: 1 },
        operationName: "Q",
      }),
    );
    expect(op).toEqual({
      query: "query Q { a }",
      variables: { id: 1 },
      operationName: "Q",
    });
  });

  it("returns the persisted query hash and empty query for an APQ body", () => {
    const op = extractGraphQLOperation(
      JSON.stringify({
        operationName: "UI__IdentityQuery",
        variables: { accountId: null },
        extensions: { persistedQuery: { version: 1, sha256Hash: "0b60a8" } },
      }),
    );
    expect(op?.query).toBe("");
    expect(op?.operationName).toBe("UI__IdentityQuery");
    expect(op?.persistedQueryHash).toBe("0b60a8");
  });

  it("returns a raw query body", () => {
    expect(extractGraphQLOperation("mutation M { x }")).toEqual({
      query: "mutation M { x }",
    });
  });

  it("returns undefined for JSON without a query", () => {
    expect(
      extractGraphQLOperation(JSON.stringify({ data: 1 })),
    ).toBeUndefined();
  });

  it("returns undefined for non-GraphQL text", () => {
    expect(extractGraphQLOperation("hello world")).toBeUndefined();
  });
});

describe("parseHttpMessage", () => {
  it("splits method, headers and body", () => {
    const message = parseHttpMessage(rawRequest("POST", "{ a }"));
    expect(message?.method).toBe("POST");
    expect(message?.headers["Content-Type"]).toBe("application/json");
    expect(message?.body).toBe("{ a }");
  });
});
