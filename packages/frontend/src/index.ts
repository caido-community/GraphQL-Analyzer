import { Classic } from "@caido/primevue";
import PrimeVue from "primevue/config";
import { createApp } from "vue";

import GraphQLViewMode from "./views/GraphQLViewMode.vue";
import { SDKPlugin } from "./plugins/sdk";
import "./styles/index.css";
import type { FrontendSDK } from "./types";
import App from "./views/App.vue";


export const init = (sdk: FrontendSDK) => {

  
  const app = createApp(App);

  // Load the PrimeVue component library
  app.use(PrimeVue, {
    unstyled: true,
    pt: Classic,
  });

  // Provide the FrontendSDK
  app.use(SDKPlugin, sdk);

  // Create the root element for the app
  const root = document.createElement("div");
  Object.assign(root.style, {
    height: "100%",
    width: "100%",
  });


  root.id = `plugin--graphql-analyzer`;

  // Mount the app to the root element
  app.mount(root);

  // Add the page to the navigation
  sdk.navigation.addPage("/graphql-analyzer", {
    body: root,
  });

  // Add a sidebar item
  sdk.sidebar.registerItem("GraphQL Analyzer", "/graphql-analyzer", {
    icon: "fas fa-project-diagram",
  });

  // Register the GraphQL request view mode
  sdk.httpHistory.addRequestViewMode({
    label: "GraphQL",
    view: {
      component: GraphQLViewMode,
    },
    condition: (request) => {
      // Parse the raw HTTP request to check for GraphQL
      if (!request.raw) return false;
      
      // Split by double CRLF to separate headers from body
      const parts = request.raw.split('\r\n\r\n');
      if (parts.length < 2) return false;
      
      const body = parts.slice(1).join('\r\n\r\n');
      if (!body) return false;
      
      // Check method is POST
      const firstLine = request.raw.split('\r\n')[0];
      if (!firstLine.startsWith('POST')) return false;
      
      // Try to parse body as JSON and look for GraphQL structure
      try {
        const bodyJson = JSON.parse(body);
        return !!(bodyJson.query && typeof bodyJson.query === 'string');
      } catch {
        // If not JSON, check if it's raw GraphQL
        return /\b(query|mutation|subscription)\s*[\{\(]/.test(body);
      }
    },
  });



  // Register context menu commands
  sdk.commands.register("graphql-analyzer-scan", {
    name: "Scan GraphQL Endpoint",
    run: (context) => {
      let requests = [];

      if (context.type === "RequestRowContext") {
        context.requests.forEach((request: any) => {
          requests.push({
            id: request.id?.toString(),
            host: request.host,
            port: request.port,
            path: request.path,
            query: request.query,
          });
        });
      } else if (context.type === "RequestContext") {
        const request = context.request as any;
        requests.push({
          id: request.id?.toString(),
          host: request.host,
          port: request.port,
          path: request.path,
          query: request.query,
        });
      } else {
        sdk.window.showToast("No requests selected", { variant: "warning" });
        return;
      }

      if (requests.length === 0) {
        sdk.window.showToast("No requests selected", { variant: "warning" });
        return;
      }

      // Take the first request and construct GraphQL URL
      const firstRequest = requests[0];
      if (!firstRequest) {
        sdk.window.showToast("No valid requests found", { variant: "warning" });
        return;
      }
      
      const protocol = firstRequest.port === 443 ? "https" : "http";
      const portPart = (firstRequest.port === 80 || firstRequest.port === 443) ? "" : `:${firstRequest.port}`;
      let graphqlUrl = `${protocol}://${firstRequest.host}${portPart}${firstRequest.path}`;
      
      // If path doesn't already contain 'graphql', try common GraphQL endpoints
      if (!graphqlUrl.toLowerCase().includes('graphql')) {
        graphqlUrl = `${protocol}://${firstRequest.host}${portPart}/graphql`;
      }


      sdk.window.showToast(`Scanning GraphQL endpoint: ${graphqlUrl}`, { variant: "info" });
      

      window.location.hash = "/graphql-analyzer";
      
      // Store the URL to scan for the Dashboard to pick up
      localStorage.setItem('graphql-analyzer-context-scan-url', graphqlUrl);
      
      // Trigger a custom event that Dashboard can listen for
      window.dispatchEvent(new CustomEvent('graphql-analyzer-context-scan', { 
        detail: { url: graphqlUrl } 
      }));
    },
    group: "GraphQL Analyzer",
    when: (context) => {
      return (
        context.type === "RequestRowContext" ||
        context.type === "RequestContext"
      );
    },
  });

  // Register attack command  
  sdk.commands.register("graphql-analyzer-attack", {
    name: "Attack GraphQL Endpoint",
    run: (context) => {
      let selectedRequest: any = null;

      if (context.type === "RequestRowContext") {
        // Take the first request
        selectedRequest = context.requests[0];
      } else if (context.type === "RequestContext") {
        selectedRequest = context.request;
      }

      if (!selectedRequest) {
        sdk.window.showToast("No request selected", { variant: "warning" });
        return;
      }


      window.location.hash = "/graphql-analyzer";
      
      // Store navigation target and request data
      localStorage.setItem('graphql-analyzer-navigate-to', 'Attacks');
      
      // Use direct property access for request data
      const requestData = {
        id: selectedRequest.id?.toString(),
        host: selectedRequest.host,
        port: selectedRequest.port,
        path: selectedRequest.path,
        query: selectedRequest.query,
        headers: selectedRequest.headers || {},
        raw: selectedRequest.raw || ""
      };
      
      localStorage.setItem('graphql-analyzer-context-attack-request', JSON.stringify(requestData));
      
      // Trigger navigation event for App component
      window.dispatchEvent(new CustomEvent('graphql-analyzer-navigate', { 
        detail: { 
          page: 'Attacks',
          requestId: requestData.id,
          request: requestData
        } 
      }));
      
      // Trigger context attack event for Attacks component (with delay to ensure component is mounted)
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('graphql-analyzer-context-attack', { 
          detail: { 
            request: requestData
          } 
        }));
      }, 200);

      sdk.window.showToast("Redirecting to attack page...", { variant: "info" });
    },
    group: "GraphQL Analyzer",
    when: (context) => {
      return (
        context.type === "RequestRowContext" ||
        context.type === "RequestContext"
      );
    },
  });

  // Register context menu items
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

  // Register attack context menu items
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
