import type { Result } from "shared";

import type { FrontendSDK } from "@/plugins/sdk";

type ConnectionInfo = {
  host: string;
  port: number;
  isTLS: boolean;
};

const collectionPrefix = "GraphQL - ";

const parseConnection = (targetUrl: string): ConnectionInfo | undefined => {
  if (!URL.canParse(targetUrl)) {
    return undefined;
  }

  const url = new URL(targetUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return undefined;
  }
  if (url.hostname === "") {
    return undefined;
  }

  const isTLS = url.protocol === "https:";
  const port = url.port !== "" ? Number(url.port) : isTLS ? 443 : 80;

  return { host: url.hostname, port, isTLS };
};

const sessionNameFromRaw = (rawRequest: string): string => {
  const parts = (rawRequest.split("\n")[0]?.trim() ?? "").split(" ");
  const method = parts[0] ?? "POST";
  const path = (parts[1] ?? "/").split("?")[0] ?? "/";

  return `${method} ${path}`;
};

export class GraphQLReplayService {
  private sdk: FrontendSDK;

  constructor(sdk: FrontendSDK) {
    this.sdk = sdk;
  }

  async createReplayFromRequest(
    rawRequest: string,
    targetUrl: string,
  ): Promise<Result<{ collectionName: string; sessionName: string }>> {
    const connection = parseConnection(targetUrl);
    if (connection === undefined) {
      return { kind: "Error", error: "Invalid target URL" };
    }

    const collectionName = `${collectionPrefix}${connection.host}`;
    const sessionName = sessionNameFromRaw(rawRequest);

    try {
      const existing = this.sdk.replay
        .getCollections()
        .find((collection) => collection.name === collectionName);
      const collectionId =
        existing?.id ??
        (await this.sdk.replay.createCollection(collectionName)).id;

      const existingIds = new Set(
        this.sdk.replay.getSessions().map((session) => session.id),
      );

      await this.sdk.replay.createSession(
        { type: "Raw", raw: rawRequest, connectionInfo: connection },
        collectionId,
      );

      const created = this.sdk.replay
        .getSessions()
        .find(
          (session) =>
            session.collectionId === collectionId &&
            !existingIds.has(session.id),
        );
      if (created !== undefined) {
        await this.sdk.replay.renameSession(created.id, sessionName);
      }

      return { kind: "Ok", value: { collectionName, sessionName } };
    } catch (error) {
      return {
        kind: "Error",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

let replayServiceInstance: GraphQLReplayService | undefined = undefined;

export function createReplayService(sdk: FrontendSDK): GraphQLReplayService {
  if (replayServiceInstance === undefined) {
    replayServiceInstance = new GraphQLReplayService(sdk);
  }
  return replayServiceInstance;
}
