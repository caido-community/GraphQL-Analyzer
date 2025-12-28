import { Classic } from "@caido/primevue";
import PrimeVue from "primevue/config";
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

  sdk.httpHistory.addRequestViewMode({
    label: "GraphQL",
    view: {
      component: GraphQLViewMode,
    },
  });

  try {
    type ReplaySDK = {
      addRequestViewMode?: (config: {
        label: string;
        view: { component: unknown };
      }) => void;
    };
    const replaySDK = sdk.replay as ReplaySDK;
    replaySDK.addRequestViewMode?.({
      label: "GraphQL",
      view: {
        component: GraphQLViewMode,
      },
    });
  } catch {
    void 0;
  }

  sdk.search.addRequestViewMode({
    label: "GraphQL",
    view: {
      component: GraphQLViewMode,
    },
  });

  sdk.sitemap.addRequestViewMode({
    label: "GraphQL",
    view: {
      component: GraphQLViewMode,
    },
  });

  sdk.commands.register("graphql-analyzer-scan", {
    name: "Scan GraphQL Endpoint",
    run: (context) => {
      type RequestData = {
        host?: string;
        port?: number;
        path?: string;
        query?: string;
        getRaw?: () => { toText?: () => string } | undefined;
      };
      let requestData: RequestData | undefined = undefined;

      if (context.type === "RequestRowContext") {
        if (context.requests.length > 0) {
          requestData = context.requests[0];
        }
      } else if (context.type === "RequestContext") {
        requestData = context.request;
      }

      if (requestData === undefined) {
        sdk.window.showToast("No request selected", { variant: "warning" });
        return;
      }

      if (requestData.host === undefined || requestData.port === undefined) {
        sdk.window.showToast("Invalid request data", { variant: "error" });
        return;
      }

      const protocol = requestData.port === 443 ? "https" : "http";
      const portPart =
        requestData.port === 80 || requestData.port === 443
          ? ""
          : `:${requestData.port}`;

      const path = requestData.path ?? "/";
      const query = requestData.query ?? "";
      const queryString = query !== "" ? `?${query}` : "";

      let graphqlUrl = `${protocol}://${requestData.host}${portPart}${path}${queryString}`;

      if (!graphqlUrl.toLowerCase().includes("graphql") && queryString === "") {
        graphqlUrl = `${protocol}://${requestData.host}${portPart}/graphql`;
      }

      const headers: Record<string, string> = {};

      if (
        context.type === "RequestContext" &&
        requestData.getRaw !== undefined
      ) {
        try {
          const rawData = requestData.getRaw();
          const rawString = rawData?.toText?.() ?? "";

          if (rawString !== "") {
            const lines = rawString.split(/\r?\n/);
            let inHeaders = false;

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              if (line === undefined || line === "") {
                if (inHeaders === true) break;
                continue;
              }

              const trimmedLine = line.trim();

              if (i === 0) {
                inHeaders = true;
                continue;
              }

              if (inHeaders === true && trimmedLine === "") break;

              if (
                inHeaders === true &&
                typeof trimmedLine === "string" &&
                trimmedLine.includes(":")
              ) {
                const colonIndex = trimmedLine.indexOf(":");
                const headerName = trimmedLine.substring(0, colonIndex).trim();
                const headerValue = trimmedLine
                  .substring(colonIndex + 1)
                  .trim();
                if (
                  headerName !== "" &&
                  headerValue !== "" &&
                  headerName.toLowerCase() !== "content-length"
                ) {
                  headers[headerName] = headerValue;
                }
              }
            }
          }
        } catch (error) {
          void 0;
        }
      }

      window.location.hash = "/graphql-analyzer";

      localStorage.setItem("graphql-analyzer-navigate-to", "Dashboard");
      localStorage.setItem(
        "graphql-analyzer-navigate-timestamp",
        Date.now().toString(),
      );
      localStorage.setItem("graphql-analyzer-context-scan-url", graphqlUrl);
      localStorage.setItem(
        "graphql-analyzer-context-scan-headers",
        JSON.stringify(headers),
      );

      window.dispatchEvent(
        new CustomEvent("graphql-analyzer-navigate", {
          detail: { page: "Dashboard" },
        }),
      );

      window.dispatchEvent(
        new CustomEvent("graphql-analyzer-context-scan", {
          detail: { url: graphqlUrl, headers },
        }),
      );

      sdk.window.showToast(`Scanning: ${graphqlUrl}`, { variant: "info" });
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
    run: (context) => {
      type RequestData = {
        id?: { toString?: () => string };
        host?: string;
        port?: number;
        path?: string;
        query?: string;
        headers?: Record<string, string>;
        getRaw?: () => { toText?: () => string } | undefined;
      };
      let selectedRequest: RequestData | undefined = undefined;

      if (context.type === "RequestRowContext") {
        selectedRequest = context.requests[0] as RequestData | undefined;
      } else if (context.type === "RequestContext") {
        selectedRequest = context.request as RequestData | undefined;
      }

      if (selectedRequest === undefined) {
        sdk.window.showToast("No request selected", { variant: "warning" });
        return;
      }

      if (
        selectedRequest.host === undefined ||
        selectedRequest.port === undefined
      ) {
        sdk.window.showToast("Invalid request data", { variant: "error" });
        return;
      }

      window.location.hash = "/graphql-analyzer";

      localStorage.setItem("graphql-analyzer-navigate-to", "Attacks");
      localStorage.setItem(
        "graphql-analyzer-navigate-timestamp",
        Date.now().toString(),
      );

      let rawString = "";
      if (
        context.type === "RequestContext" &&
        selectedRequest.getRaw !== undefined
      ) {
        try {
          const rawData = selectedRequest.getRaw();
          rawString = rawData?.toText?.() ?? "";
        } catch (error) {
          void 0;
        }
      }

      const requestData = {
        id: selectedRequest.id?.toString?.() ?? "",
        host: selectedRequest.host ?? "",
        port: selectedRequest.port ?? 80,
        path: selectedRequest.path ?? "/",
        query: selectedRequest.query ?? "",
        headers: selectedRequest.headers ?? {},
        raw: rawString,
      };

      localStorage.setItem(
        "graphql-analyzer-context-attack-request",
        JSON.stringify(requestData),
      );

      window.dispatchEvent(
        new CustomEvent("graphql-analyzer-navigate", {
          detail: { page: "Attacks" },
        }),
      );

      window.dispatchEvent(
        new CustomEvent("graphql-analyzer-context-attack", {
          detail: { request: requestData },
        }),
      );

      sdk.window.showToast("Sending to attack page...", { variant: "info" });
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
