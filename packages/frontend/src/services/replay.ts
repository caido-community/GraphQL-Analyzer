import type { FrontendSDK } from "../plugins/sdk";

export type Result<T> =
  | { kind: "Ok"; value: T }
  | { kind: "Error"; error: string };

type RequestSpec = {
  method: string;
  host: string;
  port: number;
  path: string;
  query: string;
  headers: Record<string, string>;
  body: string;
  tls: boolean;
  url: string;
};

export class GraphQLReplayService {
  private sdk: FrontendSDK;
  private collections: Map<string, string> = new Map();

  constructor(sdk: FrontendSDK) {
    this.sdk = sdk;
  }

  async createReplayFromRequest(
    rawRequest: string,
    domain: string,
  ): Promise<Result<{ collectionName: string; sessionName: string }>> {
    try {
      const parsedRequest = this.parseRawHttpRequest(rawRequest);
      if (parsedRequest === null) {
        return { kind: "Error", error: "Failed to parse HTTP request" };
      }

      const collectionName = this.getOrCreateCollection(domain);

      if (parsedRequest === undefined) {
        return {
          kind: "Error",
          error: "Failed to parse HTTP request",
        };
      }
      const sessionName = this.generateSessionName(parsedRequest);

      const requestSpec = this.buildRequestSpec(parsedRequest);
      if (requestSpec === undefined) {
        return {
          kind: "Error",
          error: "Failed to build request specification",
        };
      }

      await this.sendToReplay(requestSpec, collectionName, sessionName);

      return {
        kind: "Ok",
        value: {
          collectionName,
          sessionName,
        },
      };
    } catch (error) {
      return {
        kind: "Error",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private getOrCreateCollection(domain: string): string {
    const collectionName = `GraphQL - ${domain}`;

    if (!this.collections.has(domain)) {
      this.collections.set(domain, collectionName);
    }

    return collectionName;
  }

  private parseRawHttpRequest(
    rawRequest: string,
  ): ParsedHttpRequest | undefined {
    try {
      const lines = rawRequest.split("\n");
      if (lines.length === 0) return undefined;

      const requestLine = lines[0]?.trim();
      if (requestLine === undefined || requestLine === "") return undefined;
      const parts = requestLine.split(" ");
      const method = parts[0];
      const path = parts[1];
      const protocol = parts[2];
      if (method === undefined || path === undefined) return undefined;

      const headers: Record<string, string> = {};
      let bodyStartIndex = -1;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i]?.trim();
        if (line === undefined || line === "") {
          bodyStartIndex = i + 1;
          break;
        }

        const colonIndex = line.indexOf(":");
        if (colonIndex > 0) {
          const headerName = line.substring(0, colonIndex).trim();
          const headerValue = line.substring(colonIndex + 1).trim();
          if (headerName !== "" && headerValue !== "") {
            headers[headerName] = headerValue;
          }
        }
      }

      let body = "";
      if (bodyStartIndex > 0 && bodyStartIndex < lines.length) {
        body = lines.slice(bodyStartIndex).join("\n").trim();
      }

      const host = headers["Host"] ?? headers["host"] ?? "localhost";
      const tls =
        (protocol !== undefined && protocol.includes("HTTPS")) ||
        headers["X-Forwarded-Proto"] === "https";

      let port = 80;
      if (tls === true) port = 443;
      if (host.includes(":")) {
        const parts = host.split(":");
        const portStr = parts[1];
        if (portStr !== undefined && portStr !== "") {
          const parsedPort = parseInt(portStr);
          port = Number.isNaN(parsedPort) ? port : parsedPort;
        }
      }

      return {
        method: method.toUpperCase(),
        path: path ?? "/",
        host: host.split(":")[0] ?? "localhost",
        port,
        tls,
        headers,
        body,
        protocol: protocol ?? "HTTP/1.1",
      };
    } catch (error) {
      return undefined;
    }
  }

  private buildRequestSpec(
    parsedRequest: ParsedHttpRequest,
  ): RequestSpec | undefined {
    try {
      const protocol = parsedRequest.tls === true ? "https" : "http";
      const portStr =
        (parsedRequest.tls === true && parsedRequest.port === 443) ||
        (parsedRequest.tls === false && parsedRequest.port === 80)
          ? ""
          : `:${parsedRequest.port}`;
      const url = `${protocol}://${parsedRequest.host}${portStr}${parsedRequest.path}`;

      const [pathname, queryString] = parsedRequest.path.split("?");

      return {
        method: parsedRequest.method,
        host: parsedRequest.host,
        port: parsedRequest.port,
        path: pathname ?? "/",
        query: queryString ?? "",
        headers: parsedRequest.headers,
        body: parsedRequest.body,
        tls: parsedRequest.tls,
        url,
      };
    } catch (error) {
      return undefined;
    }
  }

  private generateSessionName(parsedRequest: ParsedHttpRequest): string {
    const path = parsedRequest.path.split("?")[0];
    return `${parsedRequest.method} ${path}`;
  }

  private async sendToReplay(
    requestSpec: RequestSpec,
    collectionName: string,
    sessionName: string,
  ): Promise<void> {
    try {
      let collectionId: string | undefined;

      try {
        const collections = this.sdk.replay.getCollections();
        type Collection = { name: string; id?: string };
        const existingCollection = collections.find(
          (c: Collection) => c.name === collectionName,
        );
        collectionId = existingCollection?.id;
      } catch {
        collectionId = undefined;
      }

      if (collectionId === undefined) {
        const createCollectionResult =
          await this.sdk.graphql.createReplaySessionCollection({
            input: {
              name: collectionName,
            },
          });

        collectionId =
          createCollectionResult.createReplaySessionCollection?.collection?.id;
        if (collectionId === undefined) {
          throw new Error("Failed to create replay collection");
        }
      }

      const rawRequest = this.buildRawHttpRequest(requestSpec);

      const createSessionResult = await this.sdk.graphql.createReplaySession({
        input: {
          requestSource: {
            raw: {
              raw: rawRequest,
              connectionInfo: {
                host: requestSpec.host ?? "localhost",
                port: requestSpec.port ?? (requestSpec.tls === true ? 443 : 80),
                isTLS: requestSpec.tls === true,
              },
            },
          },
        },
      });

      const sessionId = createSessionResult.createReplaySession?.session?.id;
      if (sessionId === undefined) {
        throw new Error("Failed to create replay session");
      }

      try {
        type ReplaySDK = {
          moveSession?: (
            sessionId: string,
            collectionId: string,
          ) => Promise<unknown>;
        };
        const replaySDK = this.sdk.replay as unknown as ReplaySDK;
        if (replaySDK.moveSession !== undefined) {
          await replaySDK.moveSession(sessionId, collectionId);
        }
      } catch {
      }

      try {
        await this.sdk.graphql.renameReplaySession({
          id: sessionId,
          name: sessionName,
        });
      } catch {
      }
    } catch (error) {
      throw new Error(
        `Failed to send to replay: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  private buildRawHttpRequest(spec: RequestSpec): string {
    try {
      const method = spec.method ?? "POST";
      const host = spec.host ?? "localhost";
      const port = spec.port ?? (spec.tls === true ? 443 : 80);
      const path = spec.path ?? "/";
      const query = spec.query !== "" ? `?${spec.query}` : "";
      const headers = spec.headers ?? {};
      const body = spec.body ?? "";
      const isTls = spec.tls === true;

      const fullPath = path + query;
      let request = `${method} ${fullPath} HTTP/1.1\r\n`;

      if (
        (isTls === true && port !== 443) ||
        (isTls === false && port !== 80)
      ) {
        request += `Host: ${host}:${port}\r\n`;
      } else {
        request += `Host: ${host}\r\n`;
      }

      for (const [name, value] of Object.entries(headers)) {
        const lowerName = name.toLowerCase();
        if (
          name !== "" &&
          value !== "" &&
          lowerName !== "host" &&
          lowerName !== "content-length"
        ) {
          request += `${name}: ${value}\r\n`;
        }
      }

      if (typeof body === "string" && body.length > 0) {
        request += `Content-Length: ${body.length}\r\n`;
      }

      request += "\r\n";

      if (typeof body === "string" && body.length > 0) {
        request += body;
      }

      return request;
    } catch (error) {
      return `POST / HTTP/1.1\r\nHost: localhost\r\n\r\n`;
    }
  }
}

interface ParsedHttpRequest {
  method: string;
  path: string;
  host: string;
  port: number;
  tls: boolean;
  headers: Record<string, string>;
  body: string;
  protocol: string;
}

let replayServiceInstance: GraphQLReplayService | undefined = undefined;

export function createReplayService(sdk: FrontendSDK): GraphQLReplayService {
  if (replayServiceInstance === undefined) {
    replayServiceInstance = new GraphQLReplayService(sdk);
  }
  return replayServiceInstance;
}
