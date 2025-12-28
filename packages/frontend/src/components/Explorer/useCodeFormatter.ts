import type { GraphQLField, GraphQLType, PointOfInterest } from "shared";
import { ref } from "vue";

import type { ExplorerSession } from "./useSessions";

import { useSDK } from "@/plugins/sdk";

export const useCodeFormatter = (selectedSession: {
  value: ExplorerSession | undefined;
}) => {
  const sdk = useSDK();
  const selectedCode = ref("");
  const selectedType = ref("");
  const selectedLanguage = ref<"json" | "javascript" | "graphql">("json");

  const formatGraphQLField = async (
    field: GraphQLField & { rawIntrospectionData?: unknown },
    type: "query" | "mutation" | "subscription",
  ): Promise<string> => {
    const schema = selectedSession.value?.schema;
    if (schema?.allTypes === undefined) {
      const dataToShow =
        (field as { rawIntrospectionData?: unknown }).rawIntrospectionData ??
        field;
      return JSON.stringify(dataToShow, null, 2);
    }

    try {
      const generatedQuery = await sdk.backend.generateGraphQLQuery(
        field,
        type,
        schema.allTypes,
        200,
      );
      return generatedQuery;
    } catch (error) {
      const dataToShow =
        (field as { rawIntrospectionData?: unknown }).rawIntrospectionData ??
        field;
      return JSON.stringify(dataToShow, null, 2);
    }
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

  const generateRequestTemplate = (content: {
    url?: string;
    schema?: unknown;
  }): string => {
    const url = content.url ?? "";
    let hostname = "";
    let path = "/graphql";

    try {
      const urlObj = new URL(url);
      hostname = urlObj.hostname;
      path = urlObj.pathname !== "" ? urlObj.pathname : "/graphql";
    } catch {
      hostname = "example.com";
    }

    return `POST ${path} HTTP/1.1
Host: ${hostname}
Accept-Encoding: gzip, deflate, br
Accept: */*
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36
Connection: close
Cache-Control: max-age=0
Content-Type: application/json

{
  "query": "query { __typename }",
  "variables": {}
}`;
  };

  type TreeNodeData = {
    type: string;
    content: unknown;
  };

  const handleNodeSelect = async (node: { data?: TreeNodeData }) => {
    if (node.data !== undefined) {
      selectedType.value = node.data.type;

      switch (node.data.type) {
        case "query": {
          selectedCode.value = await formatGraphQLField(
            node.data.content as GraphQLField & {
              rawIntrospectionData?: unknown;
            },
            "query",
          );
          selectedLanguage.value = "graphql";
          break;
        }
        case "mutation": {
          selectedCode.value = await formatGraphQLField(
            node.data.content as GraphQLField & {
              rawIntrospectionData?: unknown;
            },
            "mutation",
          );
          selectedLanguage.value = "graphql";
          break;
        }
        case "subscription": {
          selectedCode.value = await formatGraphQLField(
            node.data.content as GraphQLField & {
              rawIntrospectionData?: unknown;
            },
            "subscription",
          );
          selectedLanguage.value = "graphql";
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
        case "request-template": {
          selectedCode.value = generateRequestTemplate(
            node.data.content as { url?: string; schema?: unknown },
          );
          selectedLanguage.value = "graphql";
          break;
        }
      }
    }
  };

  const clearCode = () => {
    selectedCode.value = "";
    selectedType.value = "";
    selectedLanguage.value = "json";
  };

  return {
    selectedCode,
    selectedType,
    selectedLanguage,
    handleNodeSelect,
    clearCode,
  };
};
