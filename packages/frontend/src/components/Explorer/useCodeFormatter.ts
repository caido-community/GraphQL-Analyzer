import type { GraphQLField, GraphQLType, PointOfInterest } from "shared";
import { generateGraphQLQuery } from "shared";
import { ref } from "vue";

import type { ExplorerSession } from "./useSessions";

import { useSDK } from "@/plugins/sdk";
import { createStorageService } from "@/services/storage";

export const useCodeFormatter = (selectedSession: {
  value: ExplorerSession | undefined;
}) => {
  const sdk = useSDK();
  const storageService = createStorageService(sdk);
  const selectedCode = ref("");
  const selectedQuery = ref<string | undefined>(undefined);
  const selectedVariables = ref<Record<string, string> | undefined>(undefined);
  const selectedType = ref("");
  const selectedLanguage = ref<"json" | "javascript" | "graphql">("json");

  const formatGraphQLField = (
    field: GraphQLField & { rawIntrospectionData?: unknown },
    type: "query" | "mutation" | "subscription",
  ): { code: string; query?: string } => {
    const schema = selectedSession.value?.schema;
    if (schema?.allTypes === undefined) {
      const dataToShow = field.rawIntrospectionData ?? field;
      return { code: JSON.stringify(dataToShow, null, 2) };
    }

    const maxDepth =
      storageService.get<number>("graphql-analyzer-max-depth") ?? 5;
    const generatedQuery = generateGraphQLQuery(
      field,
      type,
      schema.allTypes,
      maxDepth,
    );
    return { code: generatedQuery, query: generatedQuery };
  };

  const buildVariableScaffold = (
    field: GraphQLField,
  ): Record<string, string> | undefined => {
    if (field.args === undefined || field.args.length === 0) return undefined;
    return Object.fromEntries(
      field.args.map((arg): [string, string] => [arg.name, ""]),
    );
  };

  const formatObjectType = (
    type: GraphQLType & { rawIntrospectionData?: unknown },
  ): string => {
    const dataToShow = type.rawIntrospectionData ?? type;
    return JSON.stringify(dataToShow, null, 2);
  };

  const formatEnum = (enumType: {
    name: string;
    rawIntrospectionData?: unknown;
  }): string => {
    const dataToShow = enumType.rawIntrospectionData ?? enumType;
    return JSON.stringify(dataToShow, null, 2);
  };

  const formatPointOfInterest = (poi: PointOfInterest): string => {
    return JSON.stringify(poi, null, 2);
  };

  type TreeNodeData = {
    type: string;
    content: unknown;
  };

  const handleNodeSelect = (node: { data?: TreeNodeData }) => {
    if (node.data !== undefined) {
      selectedType.value = node.data.type;
      selectedQuery.value = undefined;
      selectedVariables.value = undefined;

      switch (node.data.type) {
        case "query":
        case "mutation":
        case "subscription": {
          const field = node.data.content as GraphQLField & {
            rawIntrospectionData?: unknown;
          };
          const result = formatGraphQLField(field, node.data.type);
          selectedCode.value = result.code;
          selectedQuery.value = result.query;
          selectedVariables.value =
            result.query !== undefined
              ? buildVariableScaffold(field)
              : undefined;
          selectedLanguage.value =
            result.query !== undefined ? "graphql" : "json";
          break;
        }
        case "object-type": {
          selectedCode.value = formatObjectType(
            node.data.content as GraphQLType & {
              rawIntrospectionData?: unknown;
            },
          );
          selectedLanguage.value = "json";
          break;
        }
        case "enum": {
          selectedCode.value = formatEnum(
            node.data.content as {
              name: string;
              rawIntrospectionData?: unknown;
            },
          );
          selectedLanguage.value = "json";
          break;
        }
        case "point-of-interest": {
          selectedCode.value = formatPointOfInterest(
            node.data.content as PointOfInterest,
          );
          selectedLanguage.value = "json";
          break;
        }
        case "json-schema": {
          const content = node.data.content;
          const rawData =
            typeof content === "object" &&
            content !== null &&
            "rawIntrospection" in content
              ? content.rawIntrospection
              : content;
          selectedCode.value = JSON.stringify(rawData, null, 2);
          selectedLanguage.value = "json";
          break;
        }
      }
    }
  };

  const clearCode = () => {
    selectedCode.value = "";
    selectedQuery.value = undefined;
    selectedVariables.value = undefined;
    selectedType.value = "";
    selectedLanguage.value = "json";
  };

  return {
    selectedCode,
    selectedQuery,
    selectedVariables,
    selectedType,
    selectedLanguage,
    handleNodeSelect,
    clearCode,
  };
};
