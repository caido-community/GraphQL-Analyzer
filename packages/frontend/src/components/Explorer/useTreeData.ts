import type { GraphQLField, GraphQLType, PointOfInterest } from "shared";

import type { ExplorerSession } from "./useSessions";

import type { TreeItem } from "@/components/common/CTree";

export const useTreeData = (selectedSession: {
  value: ExplorerSession | undefined;
}) => {
  const getTreeData = (): TreeItem<{ type: string; content: unknown }>[] => {
    if (!selectedSession.value?.schema) return [];

    const schema = selectedSession.value.schema;
    let urlDomain = "Unknown";

    if (
      selectedSession.value.title &&
      selectedSession.value.title !== "Unknown"
    ) {
      urlDomain = selectedSession.value.title;
    } else if (selectedSession.value.url) {
      if (selectedSession.value.url.startsWith("request:")) {
        urlDomain = selectedSession.value.url
          .replace("request:", "")
          .substring(0, 8);
      } else {
        try {
          urlDomain = new URL(selectedSession.value.url).hostname;
        } catch {
          urlDomain = "Unknown";
        }
      }
    }

    const items: TreeItem<{ type: string; content: unknown }>[] = [];

    const rootId = "graphql";
    items.push({
      id: rootId,
      label: `GraphQL (${urlDomain})`,
      data: { type: "root", content: null },
      hasChildren: true,
      parentId: undefined,
      icon: "fas fa-project-diagram",
    });

    if (schema.queries.length > 0) {
      const queriesId = "queries";
      items.push({
        id: queriesId,
        label: `Queries (${schema.queries.length})`,
        data: { type: "folder", content: null },
        hasChildren: true,
        parentId: rootId,
        icon: "fas fa-search",
      });

      schema.queries.forEach((query: GraphQLField) => {
        items.push({
          id: `query-${query.name}`,
          label: query.name,
          data: { type: "query", content: query },
          hasChildren: false,
          parentId: queriesId,
          icon: "fas fa-code",
        });
      });
    }

    if (schema.mutations.length > 0) {
      const mutationsId = "mutations";
      items.push({
        id: mutationsId,
        label: `Mutations (${schema.mutations.length})`,
        data: { type: "folder", content: null },
        hasChildren: true,
        parentId: rootId,
        icon: "fas fa-edit",
      });

      schema.mutations.forEach((mutation) => {
        items.push({
          id: `mutation-${mutation.name}`,
          label: mutation.name,
          data: { type: "mutation", content: mutation },
          hasChildren: false,
          parentId: mutationsId,
          icon: "fas fa-code",
        });
      });
    }

    if (schema.subscriptions.length > 0) {
      const subscriptionsId = "subscriptions";
      items.push({
        id: subscriptionsId,
        label: `Subscriptions (${schema.subscriptions.length})`,
        data: { type: "folder", content: null },
        hasChildren: true,
        parentId: rootId,
        icon: "fas fa-broadcast-tower",
      });

      schema.subscriptions.forEach((subscription: GraphQLField) => {
        items.push({
          id: `subscription-${subscription.name}`,
          label: subscription.name,
          data: { type: "subscription", content: subscription },
          hasChildren: false,
          parentId: subscriptionsId,
          icon: "fas fa-code",
        });
      });
    }

    if (schema.pointsOfInterest.length > 0) {
      const poiId = "points-of-interest";
      items.push({
        id: poiId,
        label: `Points of Interest (${schema.pointsOfInterest.length})`,
        data: { type: "folder", content: null },
        hasChildren: true,
        parentId: rootId,
        icon: "fas fa-exclamation-triangle",
      });

      schema.pointsOfInterest.forEach((poi: PointOfInterest, index: number) => {
        items.push({
          id: `poi-${index}`,
          label: poi.name,
          data: { type: "point-of-interest", content: poi },
          hasChildren: false,
          parentId: poiId,
          icon:
            poi.severity === "high"
              ? "fas fa-exclamation-circle"
              : poi.severity === "medium"
                ? "fas fa-exclamation-triangle"
                : "fas fa-info-circle",
        });
      });
    }

    if (schema.types.length > 0) {
      const typesId = "types";
      items.push({
        id: typesId,
        label: `Object Types (${schema.types.length})`,
        data: { type: "folder", content: null },
        hasChildren: true,
        parentId: rootId,
        icon: "fas fa-cube",
      });

      schema.types.forEach((type: GraphQLType) => {
        items.push({
          id: `type-${type.name}`,
          label: type.name,
          data: { type: "object-type", content: type },
          hasChildren: false,
          parentId: typesId,
          icon: "fas fa-code",
        });
      });
    }

    if (schema.enums.length > 0) {
      const enumsId = "enums";
      items.push({
        id: enumsId,
        label: `Enums (${schema.enums.length})`,
        data: { type: "folder", content: null },
        hasChildren: true,
        parentId: rootId,
        icon: "fas fa-list",
      });

      schema.enums.forEach((enumType: { name: string }) => {
        items.push({
          id: `enum-${enumType.name}`,
          label: enumType.name,
          data: { type: "enum", content: enumType },
          hasChildren: false,
          parentId: enumsId,
          icon: "fas fa-code",
        });
      });
    }

    const jsonSchemaId = "json-schema";
    items.push({
      id: jsonSchemaId,
      label: "JSON Schema",
      data: { type: "json-schema", content: schema },
      hasChildren: false,
      parentId: rootId,
      icon: "fas fa-file-code",
    });

    return items;
  };

  return {
    getTreeData,
  };
};
