import { Classic } from "@caido/primevue";
import PrimeVue from "primevue/config";
import Tooltip from "primevue/tooltip";
import { createApp } from "vue";

import { SDKPlugin } from "./plugins/sdk";
import "./styles/index.css";
import type { FrontendSDK } from "./types";
import App from "./views/App.vue";
import GraphQLViewMode from "./views/GraphQLViewMode.vue";

export const init = (sdk: FrontendSDK) => {
  const app = createApp(App);

  app.use(PrimeVue, {
    unstyled: true,
    pt: Classic,
  });

  app.directive("tooltip", Tooltip);

  app.use(SDKPlugin, sdk);

  const root = document.createElement("div");
  Object.assign(root.style, {
    height: "100%",
    width: "100%",
  });

  root.id = `plugin--graphql-analyzer`;

  app.mount(root);

  sdk.navigation.addPage("/graphql-analyzer", {
    body: root,
  });

  sdk.sidebar.registerItem("GraphQL Analyzer", "/graphql-analyzer", {
    icon: "fas fa-project-diagram",
  });

  // Detect whether a raw HTTP request contains a GraphQL query
  function isGraphQLRequest(raw: string): boolean {
    if (!raw || raw.trim() === "") return false;

    // Split headers from body
    let parts = raw.split("\r\n\r\n");
    if (parts.length < 2) {
      parts = raw.split("\n\n");
      if (parts.length < 2) return false;
    }

    const headerSection = parts[0] ?? "";
    const firstLine = headerSection.split(/\r?\n/)[0] ?? "";

    // Must be a POST request
    if (!firstLine.startsWith("POST ")) return false;

    const separator = raw.includes("\r\n") ? "\r\n\r\n" : "\n\n";
    const body = parts.slice(1).join(separator).trim();
    if (!body) return false;

    try {
      const parsed = JSON.parse(body) as { query?: unknown };
      return typeof parsed.query === "string" && parsed.query.trim() !== "";
    } catch {
      return false;
    }
  }

  type ViewModeOptions = {
    label: string;
    view: { component: unknown };
    when?: (...args: unknown[]) => boolean;
  };

  type ExtendedViewModeSDK = {
    addRequestViewMode: (options: ViewModeOptions) => void;
  };

  const requestViewMode: ViewModeOptions = {
    label: "GraphQL",
    view: { component: GraphQLViewMode },
    when: (request: unknown) => {
      const req = request as { raw?: string } | undefined;
      return isGraphQLRequest(req?.raw ?? "");
    },
  };

  const surfaces = [
    sdk.httpHistory,
    sdk.replay,
    sdk.search,
    sdk.sitemap,
    sdk.intercept,
  ] as unknown as ExtendedViewModeSDK[];

  for (const surface of surfaces) {
    try {
      surface.addRequestViewMode(requestViewMode);
    } catch {
      // ignore
    }
  }

  sdk.commands.register("graphql-analyzer-scan", {
    name: "Scan GraphQL Endpoint",
    run: async (context) => {
      let requestId: string | undefined = undefined;

      if (context.type === "RequestRowContext") {
        if (context.requests.length > 0) {
          const request = context.requests[0];
          if (request !== undefined && request.id !== undefined) {
            requestId = request.id.toString();
          }
        }
      } else if (context.type === "RequestContext") {
        const request = context.request;
        if (
          request !== undefined &&
          request.type === "RequestFull" &&
          request.id !== undefined
        ) {
          requestId = request.id.toString();
        }
      }

      if (requestId === undefined) {
        sdk.window.showToast("No request selected", { variant: "warning" });
        return;
      }

      window.location.hash = "/graphql-analyzer";

      const navigationData = {
        page: "Dashboard" as const,
        timestamp: Date.now(),
      };
      const currentStorage =
        (sdk.storage.get() as Record<string, unknown>) ?? {};
      currentStorage["graphql-analyzer-navigate-to"] = navigationData.page;
      currentStorage["graphql-analyzer-navigate-timestamp"] =
        navigationData.timestamp.toString();
      currentStorage["graphql-analyzer-context-scan-request-id"] = requestId;
      await sdk.storage.set(currentStorage as unknown as Record<string, never>);

      window.dispatchEvent(
        new CustomEvent("graphql-analyzer-navigate", {
          detail: { page: "Dashboard" },
        }),
      );

      window.dispatchEvent(
        new CustomEvent("graphql-analyzer-context-scan", {
          detail: { requestId },
        }),
      );
    },
    group: "GraphQL Analyzer",
    when: (context) => {
      return (
        context.type === "RequestRowContext" ||
        context.type === "RequestContext"
      );
    },
  });

  sdk.commands.register("graphql-analyzer-attack", {
    name: "Attack GraphQL Endpoint",
    run: async (context) => {
      let requestId: string | undefined = undefined;

      if (context.type === "RequestRowContext") {
        if (context.requests.length > 0) {
          const request = context.requests[0];
          if (request !== undefined && request.id !== undefined) {
            requestId = request.id.toString();
          }
        }
      } else if (context.type === "RequestContext") {
        const request = context.request;
        if (
          request !== undefined &&
          request.type === "RequestFull" &&
          request.id !== undefined
        ) {
          requestId = request.id.toString();
        }
      }

      if (requestId === undefined) {
        sdk.window.showToast("No request selected", { variant: "warning" });
        return;
      }

      window.location.hash = "/graphql-analyzer";

      const navigationData = {
        page: "Attacks" as const,
        timestamp: Date.now(),
      };
      const currentStorage =
        (sdk.storage.get() as Record<string, unknown>) ?? {};
      currentStorage["graphql-analyzer-navigate-to"] = navigationData.page;
      currentStorage["graphql-analyzer-navigate-timestamp"] =
        navigationData.timestamp.toString();
      currentStorage["graphql-analyzer-context-attack-request-id"] = requestId;
      await sdk.storage.set(currentStorage as unknown as Record<string, never>);

      window.dispatchEvent(
        new CustomEvent("graphql-analyzer-navigate", {
          detail: { page: "Attacks" },
        }),
      );

      window.dispatchEvent(
        new CustomEvent("graphql-analyzer-context-attack", {
          detail: { requestId },
        }),
      );
    },
    group: "GraphQL Analyzer",
    when: (context) => {
      return (
        context.type === "RequestRowContext" ||
        context.type === "RequestContext"
      );
    },
  });

  sdk.menu.registerItem({
    type: "RequestRow",
    commandId: "graphql-analyzer-scan",
    leadingIcon: "fas fa-project-diagram",
  });

  sdk.menu.registerItem({
    type: "Request",
    commandId: "graphql-analyzer-scan",
    leadingIcon: "fas fa-project-diagram",
  });

  sdk.menu.registerItem({
    type: "RequestRow",
    commandId: "graphql-analyzer-attack",
    leadingIcon: "fas fa-shield-alt",
  });

  sdk.menu.registerItem({
    type: "Request",
    commandId: "graphql-analyzer-attack",
    leadingIcon: "fas fa-shield-alt",
  });
};
