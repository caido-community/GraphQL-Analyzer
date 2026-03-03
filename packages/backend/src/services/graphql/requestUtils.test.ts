import { describe, expect, it } from "vitest";

import {
  mapHttpStatusToError,
  mergeHeaders,
  parseRawHttpRequest,
} from "./requestUtils";

describe("parseRawHttpRequest", () => {
  it("parses a standard POST request with headers and body", () => {
    const raw = [
      "POST /graphql HTTP/1.1",
      "Host: example.com",
      "Content-Type: application/json",
      "Authorization: Bearer token123",
      "Content-Length: 42",
      "",
      '{"query":"{ __typename }"}',
    ].join("\r\n");

    const result = parseRawHttpRequest(raw);

    expect(result.headers["Host"]).toBe("example.com");
    expect(result.headers["Content-Type"]).toBe("application/json");
    expect(result.headers["Authorization"]).toBe("Bearer token123");
    expect(result.headers["Content-Length"]).toBeUndefined();
    expect(result.body).toBe('{"query":"{ __typename }"}');
  });

  it("parses request with LF line endings", () => {
    const raw = [
      "POST /graphql HTTP/1.1",
      "Host: example.com",
      "Cookie: session=abc",
      "",
      '{"query":"{ users { id } }"}',
    ].join("\n");

    const result = parseRawHttpRequest(raw);
    expect(result.headers["Host"]).toBe("example.com");
    expect(result.headers["Cookie"]).toBe("session=abc");
    expect(result.body).toBe('{"query":"{ users { id } }"}');
  });

  it("returns empty body for request without body", () => {
    const raw = ["GET /graphql HTTP/1.1", "Host: example.com", ""].join("\r\n");

    const result = parseRawHttpRequest(raw);
    expect(result.headers["Host"]).toBe("example.com");
    expect(result.body).toBe("");
  });

  it("handles headers with colons in value", () => {
    const raw = [
      "POST /graphql HTTP/1.1",
      "Host: example.com:8080",
      "Authorization: Basic dXNlcjpwYXNz",
      "",
      "{}",
    ].join("\r\n");

    const result = parseRawHttpRequest(raw);
    expect(result.headers["Host"]).toBe("example.com:8080");
    expect(result.headers["Authorization"]).toBe("Basic dXNlcjpwYXNz");
  });

  it("handles multiline body", () => {
    const body = JSON.stringify(
      { query: "{ users { id name email } }" },
      undefined,
      2,
    );
    const raw = [
      "POST /graphql HTTP/1.1",
      "Host: example.com",
      "Content-Type: application/json",
      "",
      body,
    ].join("\r\n");

    const result = parseRawHttpRequest(raw);
    expect(JSON.parse(result.body)).toEqual({
      query: "{ users { id name email } }",
    });
  });

  it("handles empty raw input", () => {
    const result = parseRawHttpRequest("");
    expect(result.headers).toEqual({});
    expect(result.body).toBe("");
  });
});

describe("mergeHeaders", () => {
  it("adds default headers to original headers", () => {
    const result = mergeHeaders({ Host: "example.com" });
    expect(result["Host"]).toBe("example.com");
    expect(result["Content-Type"]).toBe("application/json");
    expect(result["Accept"]).toBe("application/json");
    expect(result["User-Agent"]).toBe("Caido/GraphQL-Analyzer");
  });

  it("custom headers override defaults", () => {
    const result = mergeHeaders(
      { Host: "example.com" },
      { Authorization: "Bearer token", "User-Agent": "Custom-Agent" },
    );
    expect(result["Authorization"]).toBe("Bearer token");
    expect(result["User-Agent"]).toBe("Custom-Agent");
  });

  it("filters out null/undefined/empty string values", () => {
    const result = mergeHeaders({
      Host: "example.com",
      "X-Bad-Null": "null",
      "X-Bad-Undefined": "undefined",
      "X-Bad-Empty": "",
    });
    expect(result["Host"]).toBe("example.com");
    expect(result["X-Bad-Null"]).toBeUndefined();
    expect(result["X-Bad-Undefined"]).toBeUndefined();
    expect(result["X-Bad-Empty"]).toBeUndefined();
  });

  it("ignores custom headers with empty key or value", () => {
    const result = mergeHeaders(
      { Host: "example.com" },
      { "": "value", "X-Valid": "ok", "X-Empty": "   " },
    );
    expect(result[""]).toBeUndefined();
    expect(result["X-Valid"]).toBe("ok");
  });

  it("works with no custom headers", () => {
    const result = mergeHeaders({ Host: "example.com" });
    expect(Object.keys(result).length).toBeGreaterThanOrEqual(4);
  });
});

describe("mapHttpStatusToError", () => {
  it("returns auth error for 401", () => {
    const result = mapHttpStatusToError(401, "");
    expect(result).toBeDefined();
    expect(result?.kind).toBe("Error");
    if (result?.kind === "Error") {
      expect(result.error).toContain("401");
      expect(result.error).toContain("Authentication");
    }
  });

  it("returns forbidden error for 403", () => {
    const result = mapHttpStatusToError(403, "");
    expect(result?.kind).toBe("Error");
    if (result?.kind === "Error") {
      expect(result.error).toContain("403");
    }
  });

  it("returns not found error for 404", () => {
    const result = mapHttpStatusToError(404, "");
    expect(result?.kind).toBe("Error");
    if (result?.kind === "Error") {
      expect(result.error).toContain("404");
    }
  });

  it("returns method not allowed for 405", () => {
    const result = mapHttpStatusToError(405, "");
    expect(result?.kind).toBe("Error");
    if (result?.kind === "Error") {
      expect(result.error).toContain("405");
    }
  });

  it("returns server error for 500+", () => {
    for (const code of [500, 502, 503]) {
      const result = mapHttpStatusToError(code, "");
      expect(result?.kind).toBe("Error");
      if (result?.kind === "Error") {
        expect(result.error).toContain(String(code));
      }
    }
  });

  it("detects HTML page responses", () => {
    const result = mapHttpStatusToError(
      302,
      "<!DOCTYPE html><html><body>Redirect</body></html>",
    );
    expect(result?.kind).toBe("Error");
    if (result?.kind === "Error") {
      expect(result.error).toContain("HTML page");
    }
  });

  it("returns preview for unknown non-200 status", () => {
    const result = mapHttpStatusToError(418, "I'm a teapot");
    expect(result?.kind).toBe("Error");
    if (result?.kind === "Error") {
      expect(result.error).toContain("418");
      expect(result.error).toContain("teapot");
    }
  });

  it("returns undefined for 200 (no error)", () => {
    const result = mapHttpStatusToError(200, "");
    expect(result).toBeUndefined();
  });
});
