type ParsedRawRequest = {
  headers: Record<string, string>;
  body: string;
};

export function parseRawHttpRequest(rawText: string): ParsedRawRequest {
  const lines = rawText.split(/\r?\n/);
  const headers: Record<string, string> = {};
  let body = "";

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
        headers[headerName] = headerValue;
      }
    }
  }

  if (bodyStartIndex > 0 && bodyStartIndex < lines.length) {
    body = lines.slice(bodyStartIndex).join("\r\n").trim();
  }

  return { headers, body };
}

export function mergeHeaders(
  originalHeaders: Record<string, string>,
  customHeaders?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {
    ...originalHeaders,
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "Caido/GraphQL-Analyzer",
  };

  if (customHeaders !== undefined && typeof customHeaders === "object") {
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

  return headers;
}

export function mapHttpStatusToError(
  statusCode: number,
  responseBody: string,
): { kind: "Error"; error: string } | undefined {
  if (statusCode === 401) {
    return {
      kind: "Error",
      error:
        "Authentication required (HTTP 401). Add Authorization, Cookie, or API key headers.",
    };
  }

  if (statusCode === 403) {
    return {
      kind: "Error",
      error:
        "Access forbidden (HTTP 403). Your credentials lack required permissions.",
    };
  }

  if (statusCode === 404) {
    return {
      kind: "Error",
      error: "Endpoint not found (HTTP 404). Verify the URL is correct.",
    };
  }

  if (statusCode === 405) {
    return {
      kind: "Error",
      error:
        "Method not allowed (HTTP 405). This endpoint may not support POST requests.",
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

  return undefined;
}
