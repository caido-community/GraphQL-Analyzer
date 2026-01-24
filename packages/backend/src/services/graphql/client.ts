import type { SDK } from "caido:plugin";
import { RequestSpec } from "caido:utils";
import type { GraphQLSchema, IntrospectionSchema, Result } from "shared";

import { INTROSPECTION_QUERY } from "./introspection";
import { parseIntrospectionResult } from "./parser";

export class GraphQLClient {
  constructor(private sdk: SDK) {}

  async testEndpointFromRequest(
    requestId: string,
    customHeaders?: Record<string, string>,
  ): Promise<
    Result<{ supportsIntrospection: boolean; schema?: GraphQLSchema }>
  > {
    try {
      const requestResult = await this.sdk.requests.get(requestId);
      if (!requestResult) {
        return {
          kind: "Error",
          error: "Request not found",
        };
      }

      const originalRequest = requestResult.request;
      const originalUrl = originalRequest.getUrl();

      if (
        !originalUrl.startsWith("http://") &&
        !originalUrl.startsWith("https://")
      ) {
        return {
          kind: "Error",
          error: "Request URL must start with http:// or https://",
        };
      }

      const originalRaw = originalRequest.getRaw().toText();
      const lines = originalRaw.split(/\r?\n/);
      const originalHeaders: Record<string, string> = {};
      let originalBody = "";

      let inHeaders = false;
      let bodyStartIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined) continue;

        const trimmedLine = line.trim();

        if (i === 0) {
          inHeaders = true;
          continue;
        }

        if (inHeaders === true && trimmedLine === "") {
          bodyStartIndex = i + 1;
          break;
        }

        if (
          inHeaders === true &&
          typeof trimmedLine === "string" &&
          trimmedLine.includes(":")
        ) {
          const colonIndex = trimmedLine.indexOf(":");
          const headerName = trimmedLine.substring(0, colonIndex).trim();
          const headerValue = trimmedLine.substring(colonIndex + 1).trim();
          if (
            headerName !== "" &&
            headerValue !== "" &&
            headerName.toLowerCase() !== "content-length"
          ) {
            originalHeaders[headerName] = headerValue;
          }
        }
      }

      if (bodyStartIndex > 0 && bodyStartIndex < lines.length) {
        originalBody = lines.slice(bodyStartIndex).join("\r\n").trim();
      }

      const headers: Record<string, string> = {
        ...originalHeaders,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Caido/GraphQL-Analyzer",
      };

      if (customHeaders && typeof customHeaders === "object") {
        Object.entries(customHeaders).forEach(([key, value]) => {
          if (
            key &&
            value &&
            typeof key === "string" &&
            typeof value === "string" &&
            key.trim() &&
            value.trim()
          ) {
            headers[key] = String(value);
          }
        });
      }

      for (const [key, value] of Object.entries(headers)) {
        if (
          typeof value !== "string" ||
          value === "" ||
          value === "null" ||
          value === "undefined"
        ) {
          delete headers[key];
        }
      }

      const method = originalRequest.getMethod() || "POST";

      if (originalBody && originalBody.trim() !== "") {
        try {
          const originalSpec = new RequestSpec(originalUrl);
          originalSpec.setMethod(method);

          for (const [name, value] of Object.entries(headers)) {
            if (value) {
              originalSpec.setHeader(name, value);
            }
          }

          originalSpec.setBody(originalBody);

          const originalResult = await this.sdk.requests.send(originalSpec);
          const originalProcessed =
            this.processIntrospectionResponse(originalResult);

          if (
            originalProcessed.kind === "Ok" &&
            originalProcessed.value.supportsIntrospection === true &&
            originalProcessed.value.schema !== undefined
          ) {
            return originalProcessed;
          }
        } catch {
          // Ignore errors when trying original request
        }
      }

      const requestBody = JSON.stringify({
        query: INTROSPECTION_QUERY,
      });

      const spec = new RequestSpec(originalUrl);
      spec.setMethod("POST");

      for (const [name, value] of Object.entries(headers)) {
        if (value) {
          spec.setHeader(name, value);
        }
      }

      spec.setBody(requestBody);

      const result = await this.sdk.requests.send(spec);

      return this.processIntrospectionResponse(result);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      return {
        kind: "Error",
        error: `Failed to test GraphQL endpoint: ${errorMsg}`,
      };
    }
  }

  async testEndpoint(
    url: string,
    customHeaders?: Record<string, string>,
  ): Promise<
    Result<{ supportsIntrospection: boolean; schema?: GraphQLSchema }>
  > {
    try {
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return {
          kind: "Error",
          error: "URL must start with http:// or https://",
        };
      }

      let hostHeader = "";
      try {
        const parsedUrl = new URL(url);
        if (
          parsedUrl.port &&
          ((parsedUrl.protocol === "https:" && parsedUrl.port !== "443") ||
            (parsedUrl.protocol === "http:" && parsedUrl.port !== "80"))
        ) {
          hostHeader = `${parsedUrl.hostname}:${parsedUrl.port}`;
        } else {
          hostHeader = parsedUrl.hostname;
        }
      } catch {
        return { kind: "Error", error: "Invalid URL format" };
      }

      if (!hostHeader) {
        return { kind: "Error", error: "Failed to extract host from URL" };
      }

      const headers: Record<string, string> = {};

      headers["Host"] = String(hostHeader);
      headers["Content-Type"] = "application/json";
      headers["Accept"] = "application/json";
      headers["User-Agent"] = "Caido/GraphQL-Analyzer";

      if (customHeaders && typeof customHeaders === "object") {
        Object.entries(customHeaders).forEach(([key, value]) => {
          if (
            key &&
            value &&
            typeof key === "string" &&
            typeof value === "string" &&
            key.trim() &&
            value.trim()
          ) {
            headers[key] = String(value);
          }
        });
      }

      for (const [key, value] of Object.entries(headers)) {
        if (
          typeof value !== "string" ||
          value === "" ||
          value === "null" ||
          value === "undefined"
        ) {
          delete headers[key];
        }
      }

      const requestBody = JSON.stringify({
        query: INTROSPECTION_QUERY,
      });

      if (!url || typeof url !== "string") {
        return { kind: "Error", error: "Invalid URL" };
      }

      const spec = new RequestSpec(url);
      spec.setMethod("POST");

      for (const [name, value] of Object.entries(headers)) {
        if (value) {
          spec.setHeader(name, value);
        }
      }

      spec.setBody(requestBody);

      const result = await this.sdk.requests.send(spec);

      return this.processIntrospectionResponse(result);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      return {
        kind: "Error",
        error: `Failed to test GraphQL endpoint: ${errorMsg}`,
      };
    }
  }

  private processIntrospectionResponse(
    result: Awaited<ReturnType<typeof this.sdk.requests.send>>,
  ): Result<{ supportsIntrospection: boolean; schema?: GraphQLSchema }> {
    if (result.response === undefined) {
      return {
        kind: "Error",
        error: "No response received from the endpoint",
      };
    }

    const statusCode = result.response.getCode();
    const responseBody = result.response.getBody()?.toText() ?? "";

    if (statusCode === 401) {
      return {
        kind: "Error",
        error: `Authentication required (HTTP 401). Add Authorization, Cookie, or API key headers.`,
      };
    }

    if (statusCode === 403) {
      return {
        kind: "Error",
        error: `Access forbidden (HTTP 403). Your credentials lack required permissions.`,
      };
    }

    if (statusCode === 404) {
      return {
        kind: "Error",
        error: `Endpoint not found (HTTP 404). Verify the URL is correct.`,
      };
    }

    if (statusCode === 405) {
      return {
        kind: "Error",
        error: `Method not allowed (HTTP 405). This endpoint may not support POST requests.`,
      };
    }

    if (statusCode >= 500) {
      return {
        kind: "Error",
        error: `Server error (HTTP ${statusCode}). The server is experiencing issues.`,
      };
    }

    if (statusCode !== 200) {
      const trimmed = responseBody.trim();
      if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
        return {
          kind: "Error",
          error: `Received HTML page (HTTP ${statusCode}). This may not be a GraphQL endpoint.`,
        };
      }
      const preview = responseBody.substring(0, 150);
      return {
        kind: "Error",
        error: `Unexpected response (HTTP ${statusCode}): ${preview}...`,
      };
    }

    try {
      const jsonResponse = JSON.parse(responseBody);

      if (
        Array.isArray(jsonResponse.errors) &&
        jsonResponse.errors.length > 0
      ) {
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

        const errorMessages = (
          jsonResponse.errors as Array<{ message?: string }>
        )
          .map((e) => e.message ?? "Unknown error")
          .join(", ");
        return {
          kind: "Error",
          error: `GraphQL error: ${errorMessages}`,
        };
      }

      if (
        jsonResponse.data !== undefined &&
        jsonResponse.data.__schema !== undefined
      ) {
        const schema = parseIntrospectionResult(
          jsonResponse.data.__schema as IntrospectionSchema,
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

  async executeQuery(
    url: string,
    payload: {
      query: string;
      variables?: Record<string, unknown>;
      operationName?: string;
    },
  ): Promise<Result<Record<string, unknown>>> {
    try {
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return {
          kind: "Error",
          error: "URL must start with http:// or https://",
        };
      }

      const spec = new RequestSpec(url);
      spec.setMethod("POST");
      spec.setHeader("Content-Type", "application/json");
      spec.setHeader("User-Agent", "Caido/GraphQL-Analyzer");
      spec.setBody(JSON.stringify(payload));

      const result = await this.sdk.requests.send(spec);

      if (result.response === undefined) {
        return {
          kind: "Error",
          error: "No response received",
        };
      }

      const body = result.response.getBody()?.toText() ?? "";
      try {
        const json = JSON.parse(body);
        return { kind: "Ok", value: json };
      } catch {
        return {
          kind: "Error",
          error: "Invalid JSON response",
        };
      }
    } catch (error) {
      return {
        kind: "Error",
        error:
          error instanceof Error ? error.message : "Unknown execution error",
      };
    }
  }
}
