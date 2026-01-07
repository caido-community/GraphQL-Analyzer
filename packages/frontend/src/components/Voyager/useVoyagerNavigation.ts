import type { GraphQLField, GraphQLSchema, GraphQLType } from "shared";
import { computed, ref, type Ref } from "vue";

import type { D3Node, NavItem } from "./types";
import { formatFieldSignature } from "./types";

export function useVoyagerNavigation(
  currentSchema: Ref<GraphQLSchema | undefined>,
  debouncedSearchTerm: Ref<string>,
  cachedD3Data: Ref<{ nodes: D3Node[]; links: unknown[] } | undefined>,
  focusOnNode: (nodeData: D3Node) => void,
) {
  const expandedSections = ref<Record<string, boolean>>({
    Query: true,
    Mutation: true,
    Subscription: true,
  });

  const filteredItems = computed(() => {
    if (currentSchema.value === undefined) return [];

    const items: NavItem[] = [];

    if (currentSchema.value.queries.length > 0) {
      items.push({
        name: "Query",
        type: "root",
        children: currentSchema.value.queries.map((q: GraphQLField) => ({
          name: q.name,
          type: "query",
          parent: "Query",
        })),
      });
    }

    if (currentSchema.value.mutations.length > 0) {
      items.push({
        name: "Mutation",
        type: "root",
        children: currentSchema.value.mutations.map((m: GraphQLField) => ({
          name: m.name,
          type: "mutation",
          parent: "Mutation",
        })),
      });
    }

    if (currentSchema.value.subscriptions.length > 0) {
      items.push({
        name: "Subscription",
        type: "root",
        children: currentSchema.value.subscriptions.map((s: GraphQLField) => ({
          name: s.name,
          type: "subscription",
          parent: "Subscription",
        })),
      });
    }

    if (currentSchema.value.types.length > 0) {
      currentSchema.value.types.forEach((type: GraphQLType) => {
        items.push({
          name: type.name,
          type: "type",
          children: (type.fields ?? []).map((f: GraphQLField) => ({
            name: f.name,
            fullSignature: formatFieldSignature(f),
            fieldData: f,
            type: "field",
            parent: type.name,
          })),
        });
      });
    }

    if (currentSchema.value.enums.length > 0) {
      currentSchema.value.enums.forEach(
        (enumType: { name: string; values: Array<{ name: string }> }) => {
          items.push({
            name: enumType.name,
            type: "enum",
            children: (enumType.values ?? []).map((v: { name: string }) => ({
              name: v.name,
              fullSignature: v.name,
              fieldData: v,
              type: "enumValue",
              parent: enumType.name,
            })),
          });
        },
      );
    }

    if (debouncedSearchTerm.value.trim() === "") return items;

    const search = debouncedSearchTerm.value.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(search) ||
        item.children?.some((child: NavItem) =>
          child.name.toLowerCase().includes(search),
        ) === true,
    );
  });

  const toggleSection = (sectionName: string) => {
    const currentValue = expandedSections.value[sectionName];
    expandedSections.value[sectionName] =
      currentValue === undefined ? true : !currentValue;
  };

  const shouldShowChildren = (item: NavItem): boolean => {
    if (
      item.type === "root" &&
      ["Query", "Mutation", "Subscription"].includes(item.name)
    ) {
      return expandedSections.value[item.name] === true;
    }

    return true;
  };

  const onNavItemClick = (item: NavItem) => {
    if (
      item.type === "root" &&
      ["Query", "Mutation", "Subscription"].includes(item.name)
    ) {
      toggleSection(item.name);
      return;
    }

    if (cachedD3Data.value === undefined) return;

    const { nodes } = cachedD3Data.value;
    const targetNode = nodes.find(
      (n) => n.name === item.name || n.name === item.parent,
    );

    if (targetNode !== undefined) {
      focusOnNode(targetNode);
    }
  };

  return {
    expandedSections,
    filteredItems,
    toggleSection,
    shouldShowChildren,
    onNavItemClick,
  };
}

