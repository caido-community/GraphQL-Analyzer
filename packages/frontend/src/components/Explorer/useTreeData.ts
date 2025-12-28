import type { ExplorerSession } from "./useSessions";

export const useTreeData = (selectedSession: {
  value: ExplorerSession | undefined;
}) => {
  const getTreeData = () => {
    if (!selectedSession.value?.schema) return [];

    const schema = selectedSession.value.schema;
    const urlDomain = selectedSession.value.url
      ? new URL(selectedSession.value.url).hostname
      : "Unknown";

    const baseTree = [
      {
        key: "graphql",
        label: `GraphQL (${urlDomain})`,
        icon: "fas fa-project-diagram",
        children: [
          {
            key: "queries",
            label: `Queries (${schema.queries.length})`,
            icon: "fas fa-search",
            children: schema.queries.map((query: any) => ({
              key: `query-${query.name}`,
              label: query.name,
              icon: "fas fa-code",
              data: { type: "query", content: query },
            })),
          },
          {
            key: "mutations",
            label: `Mutations (${schema.mutations.length})`,
            icon: "fas fa-edit",
            children: schema.mutations.map((mutation) => ({
              key: `mutation-${mutation.name}`,
              label: mutation.name,
              icon: "fas fa-code",
              data: { type: "mutation", content: mutation },
            })),
          },
          {
            key: "subscriptions",
            label: `Subscriptions (${schema.subscriptions.length})`,
            icon: "fas fa-broadcast-tower",
            children: schema.subscriptions.map((subscription) => ({
              key: `subscription-${subscription.name}`,
              label: subscription.name,
              icon: "fas fa-code",
              data: { type: "subscription", content: subscription },
            })),
          },
        ],
      },
    ];

    if (
      schema.pointsOfInterest &&
      schema.pointsOfInterest.length > 0 &&
      baseTree[0]?.children
    ) {
      (baseTree[0].children as any).push({
        key: "points-of-interest",
        label: `Points of Interest (${schema.pointsOfInterest.length})`,
        icon: "fas fa-exclamation-triangle",
        children: schema.pointsOfInterest.map((poi: any, index: number) => ({
          key: `poi-${index}`,
          label: poi.name,
          icon:
            poi.severity === "high"
              ? "fas fa-exclamation-circle"
              : poi.severity === "medium"
                ? "fas fa-exclamation-triangle"
                : "fas fa-info-circle",
          data: { type: "point-of-interest", content: poi },
        })),
      });
    }

    if (schema.types && schema.types.length > 0 && baseTree[0]?.children) {
      (baseTree[0].children as any).push({
        key: "types",
        label: `Object Types (${schema.types.length})`,
        icon: "fas fa-cube",
        children: schema.types.map((type: any) => ({
          key: `type-${type.name}`,
          label: type.name,
          icon: "fas fa-code",
          data: { type: "object-type", content: type },
        })),
      });
    }

    if (schema.enums && schema.enums.length > 0 && baseTree[0]?.children) {
      (baseTree[0].children as any).push({
        key: "enums",
        label: `Enums (${schema.enums.length})`,
        icon: "fas fa-list",
        children: schema.enums.map((enumType: any) => ({
          key: `enum-${enumType.name}`,
          label: enumType.name,
          icon: "fas fa-code",
          data: { type: "enum", content: enumType },
        })),
      });
    }

    if (baseTree[0]?.children) {
      (baseTree[0].children as any).push(
        {
          key: "json-schema",
          label: "JSON Schema",
          icon: "fas fa-file-code",
          data: { type: "json-schema", content: schema },
        },
        {
          key: "request-template",
          label: "Request Template",
          icon: "fas fa-file-alt",
          data: {
            type: "request-template",
            content: { url: selectedSession.value?.url || "", schema },
          },
        },
      );
    }

    return baseTree;
  };

  return {
    getTreeData,
  };
};
