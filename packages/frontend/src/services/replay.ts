import type { FrontendSDK } from "../plugins/sdk";

export type Result<T> = 
  | { kind: "Ok"; value: T }
  | { kind: "Error"; error: string };

/**
 * GraphQL Replay Service
 * Creates replay sessions and collections for GraphQL requests
 */
export class GraphQLReplayService {
  private sdk: FrontendSDK;
  private collections: Map<string, string> = new Map(); // domain -> collection name

  constructor(sdk: FrontendSDK) {
    this.sdk = sdk;
  }

  /**
   * Creates a replay session from raw HTTP request
   * Automatically creates domain-based collections
   */
  async createReplayFromRequest(rawRequest: string, domain: string): Promise<Result<{ collectionName: string; sessionName: string }>> {
    try {
      // Parse the raw HTTP request
      const parsedRequest = this.parseRawHttpRequest(rawRequest);
      if (!parsedRequest) {
        return { kind: "Error", error: "Failed to parse HTTP request" };
      }

      // Get or create collection for this domain
      const collectionName = await this.getOrCreateCollection(domain);

      // Generate session name
      const sessionName = this.generateSessionName(parsedRequest);

      // Create RequestSpec from parsed request
      const requestSpec = await this.buildRequestSpec(parsedRequest);
      if (!requestSpec) {
        return { kind: "Error", error: "Failed to build request specification" };
      }

      // Send to Caido Replay (using the SDK)
      // Note: This will need to be implemented based on Caido's actual replay SDK
      await this.sendToReplay(requestSpec, collectionName, sessionName);

      return { 
        kind: "Ok", 
        value: { 
          collectionName, 
          sessionName 
        } 
      };

    } catch (error) {
      return { 
        kind: "Error", 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Gets existing collection or creates new one for domain
   */
  private async getOrCreateCollection(domain: string): Promise<string> {
    const collectionName = `GraphQL - ${domain}`;
    
    if (!this.collections.has(domain)) {
      this.collections.set(domain, collectionName);
      // Here we would create the actual collection in Caido
      // For now, we just track it locally
    }

    return collectionName;
  }

  /**
   * Parses raw HTTP request into structured data
   */
  private parseRawHttpRequest(rawRequest: string): ParsedHttpRequest | null {
    try {
      const lines = rawRequest.split('\n');
      if (lines.length === 0) return null;

      // Parse request line
      const requestLine = lines[0].trim();
      const [method, path, protocol] = requestLine.split(' ');
      if (!method || !path) return null;

      // Parse headers
      const headers: Record<string, string> = {};
      let bodyStartIndex = -1;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '') {
          bodyStartIndex = i + 1;
          break;
        }

        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const headerName = line.substring(0, colonIndex).trim();
          const headerValue = line.substring(colonIndex + 1).trim();
          headers[headerName] = headerValue;
        }
      }

      // Extract body
      let body = '';
      if (bodyStartIndex > 0 && bodyStartIndex < lines.length) {
        body = lines.slice(bodyStartIndex).join('\n').trim();
      }

      // Extract host and determine if TLS
      const host = headers['Host'] || headers['host'] || 'localhost';
      const tls = protocol?.includes('HTTPS') || headers['X-Forwarded-Proto'] === 'https';
      
      // Determine port
      let port = 80;
      if (tls) port = 443;
      if (host.includes(':')) {
        const [hostname, portStr] = host.split(':');
        port = parseInt(portStr) || port;
      }

      return {
        method: method.toUpperCase(),
        path,
        host: host.split(':')[0], // Remove port from host
        port,
        tls,
        headers,
        body,
        protocol: protocol || 'HTTP/1.1'
      };

    } catch (error) {
      return null;
    }
  }

  /**
   * Builds Caido RequestSpec from parsed request
   */
  private async buildRequestSpec(parsedRequest: ParsedHttpRequest): Promise<any | null> {
    try {
      // Build URL
      const protocol = parsedRequest.tls ? 'https' : 'http';
      const portStr = (parsedRequest.tls && parsedRequest.port === 443) || 
                     (!parsedRequest.tls && parsedRequest.port === 80) 
                     ? '' : `:${parsedRequest.port}`;
      const url = `${protocol}://${parsedRequest.host}${portStr}${parsedRequest.path}`;

      // Extract query parameters from path
      const [pathname, queryString] = parsedRequest.path.split('?');

      return {
        method: parsedRequest.method,
        host: parsedRequest.host,
        port: parsedRequest.port,
        path: pathname || '/',
        query: queryString || '',
        headers: parsedRequest.headers,
        body: parsedRequest.body,
        tls: parsedRequest.tls,
        url
      };

    } catch (error) {
      return null;
    }
  }

  /**
   * Generates session name from parsed request
   */
  private generateSessionName(parsedRequest: ParsedHttpRequest): string {
    const path = parsedRequest.path.split('?')[0]; // Remove query params
    return `${parsedRequest.method} ${path}`;
  }

  /**
   * Sends request to Caido Replay system using real Caido SDK
   */
  private async sendToReplay(requestSpec: any, collectionName: string, sessionName: string): Promise<void> {
    try {
      // Step 1: Check if collection exists, create if not
      let collectionId: string | undefined;
      
      try {
        const collections = await this.sdk.replay.getCollections();
        const existingCollection = collections.find((c: any) => c.name === collectionName);
        collectionId = existingCollection?.id;
      } catch (error) {
        // If replay.getCollections() fails, we'll create a new collection anyway
      }

      // Step 2: Create collection if it doesn't exist
      if (!collectionId) {
        const createCollectionResult = await this.sdk.graphql.createReplaySessionCollection({
          input: {
            name: collectionName
          }
        });
        
        collectionId = createCollectionResult.createReplaySessionCollection?.collection?.id;
        if (!collectionId) {
          throw new Error('Failed to create replay collection');
        }
      }

      // Step 3: Build raw HTTP request from spec
      const rawRequest = this.buildRawHttpRequest(requestSpec);

      // Step 4: Create replay session
      const createSessionResult = await this.sdk.graphql.createReplaySession({
        input: {
          requestSource: {
            raw: {
              raw: rawRequest,
              connectionInfo: {
                host: requestSpec.host || 'localhost',
                port: requestSpec.port || (requestSpec.tls ? 443 : 80),
                isTLS: requestSpec.tls !== false,
              },
            },
          },
        },
      });

      const sessionId = createSessionResult.createReplaySession?.session?.id;
      if (!sessionId) {
        throw new Error('Failed to create replay session');
      }

      // Step 5: Move session to collection
      try {
        await (this.sdk.replay as any).moveSession(sessionId, collectionId);
      } catch (moveError) {
        // Non-fatal, session still created
      }

      // Step 6: Rename session
      try {
        await this.sdk.graphql.renameReplaySession({
          id: sessionId,
          name: sessionName,
        });
      } catch (renameError) {
        // Non-fatal, session still created
      }

    } catch (error) {
      throw new Error(`Failed to send to replay: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Builds raw HTTP request string from request spec (like redocs does)
   */
  private buildRawHttpRequest(spec: any): string {
    try {
      const method = spec.method || 'POST';
      const host = spec.host || 'localhost';
      const port = spec.port || (spec.tls ? 443 : 80);
      const path = spec.path || '/';
      const query = spec.query ? `?${spec.query}` : '';
      const headers = spec.headers || {};
      const body = spec.body || '';
      const isTls = spec.tls !== false;

      // Build request line
      const fullPath = path + query;
      let request = `${method} ${fullPath} HTTP/1.1\r\n`;
      
      // Add Host header
      if ((isTls && port !== 443) || (!isTls && port !== 80)) {
        request += `Host: ${host}:${port}\r\n`;
      } else {
        request += `Host: ${host}\r\n`;
      }
      
      // Add other headers
      for (const [name, value] of Object.entries(headers)) {
        if (name && value && name.toLowerCase() !== 'host') {
          request += `${name}: ${value}\r\n`;
        }
      }
      
      // Add Content-Length if there's a body
      if (body && typeof body === 'string' && body.length > 0) {
        request += `Content-Length: ${body.length}\r\n`;
      }
      
      // End headers
      request += '\r\n';
      
      // Add body
      if (body && typeof body === 'string' && body.length > 0) {
        request += body;
      }
      
      return request;
    } catch (error) {
      // Fallback
      return `POST / HTTP/1.1\r\nHost: localhost\r\n\r\n`;
    }
  }
}

/**
 * Parsed HTTP Request structure
 */
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

/**
 * Create and export singleton instance
 */
let replayServiceInstance: GraphQLReplayService | null = null;

export function createReplayService(sdk: FrontendSDK): GraphQLReplayService {
  if (!replayServiceInstance) {
    replayServiceInstance = new GraphQLReplayService(sdk);
  }
  return replayServiceInstance;
}

export { replayServiceInstance as replayService };
