import type { SDK } from "caido:plugin";
import type { RequestSpec } from "caido:utils";
import type { AttackConfig } from "shared";

async function extractRequestHeaders(
  sdk: SDK,
  requestId: string,
): Promise<Record<string, string>> {
  const result = await sdk.requests.get(requestId);
  if (!result?.request) {
    return {};
  }

  const headers: Record<string, string> = {};
  const rawHeaders = result.request.getHeaders();

  for (const [name, values] of Object.entries(rawHeaders)) {
    if (name.toLowerCase() !== "content-length" && values.length > 0) {
      headers[name] = values[0] ?? "";
    }
  }

  return headers;
}

function getHostHeader(targetUrl: string): string {
  try {
    const url = new URL(targetUrl);
    const port = url.port;
    const hostname = url.hostname;

    if (port) {
      return `${hostname}:${port}`;
    }

    const defaultPort = url.protocol === "https:" ? "443" : "80";
    if (
      (url.protocol === "https:" && port !== "443") ||
      (url.protocol === "http:" && port !== "80")
    ) {
      return `${hostname}:${port || defaultPort}`;
    }

    return hostname;
  } catch {
    return "";
  }
}

export async function applyHeaders(
  sdk: SDK,
  spec: RequestSpec,
  config: AttackConfig,
): Promise<void> {
  let finalHeaders: Record<string, string> = {};

  const hostHeader = getHostHeader(config.targetUrl);

  if (config.requestId !== undefined && config.requestId !== "") {
    finalHeaders = await extractRequestHeaders(sdk, config.requestId);
  } else if (
    config.useOriginalHeaders === true &&
    config.originalHeaders !== undefined
  ) {
    finalHeaders = { ...config.originalHeaders };
  }

  finalHeaders["Content-Type"] = "application/json";
  finalHeaders["Accept"] = "application/json";

  if (hostHeader !== "") {
    finalHeaders["Host"] = hostHeader;
  }

  delete finalHeaders["Content-Length"];

  if (Object.keys(finalHeaders).length === 0) {
    finalHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "Caido/GraphQL-Analyzer",
    };
    if (hostHeader !== "") {
      finalHeaders["Host"] = hostHeader;
    }
  }

  if (config.customHeaders) {
    for (const [customName, customValue] of Object.entries(
      config.customHeaders,
    )) {
      if (customName && customValue) {
        const matchingKey = Object.keys(finalHeaders).find(
          (existingKey) =>
            existingKey.toLowerCase() === customName.toLowerCase(),
        );

        if (matchingKey !== undefined) {
          delete finalHeaders[matchingKey];
        }
        finalHeaders[customName] = customValue;
      }
    }
  }

  for (const [name, value] of Object.entries(finalHeaders)) {
    if (value !== "") {
      spec.setHeader(name, value);
    }
  }
}
