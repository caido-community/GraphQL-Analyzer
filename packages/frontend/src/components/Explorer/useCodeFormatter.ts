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
    field: any,
    type: "query" | "mutation" | "subscription",
  ): Promise<string> => {
    const schema = selectedSession.value?.schema as any;
    if (!schema?.allTypes) {
      const dataToShow = field.rawIntrospectionData || field;
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
      const dataToShow = field.rawIntrospectionData || field;
      return JSON.stringify(dataToShow, null, 2);
    }
  };

  const formatObjectType = (type: any): string => {
    const dataToShow = type.rawIntrospectionData || type;
    return JSON.stringify(dataToShow, null, 2);
  };

  const formatEnum = (enumType: any): string => {
    const dataToShow = enumType.rawIntrospectionData || enumType;
    return JSON.stringify(dataToShow, null, 2);
  };

  const formatPointOfInterest = (poi: any): string => {
    return JSON.stringify(poi, null, 2);
  };

  const generateRequestTemplate = (content: any): string => {
    const url = content.url || "";
    let hostname = "";
    let path = "/graphql";

    try {
      const urlObj = new URL(url);
      hostname = urlObj.hostname;
      path = urlObj.pathname || "/graphql";
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

  const handleNodeSelect = async (node: any) => {
    if (node.data) {
      selectedType.value = node.data.type;

      switch (node.data.type) {
        case "query":
          selectedCode.value = await formatGraphQLField(
            node.data.content,
            "query",
          );
          selectedLanguage.value = "graphql";
          break;
        case "mutation":
          selectedCode.value = await formatGraphQLField(
            node.data.content,
            "mutation",
          );
          selectedLanguage.value = "graphql";
          break;
        case "subscription":
          selectedCode.value = await formatGraphQLField(
            node.data.content,
            "subscription",
          );
          selectedLanguage.value = "graphql";
          break;
        case "object-type":
          selectedCode.value = formatObjectType(node.data.content);
          selectedLanguage.value = "json";
          break;
        case "enum":
          selectedCode.value = formatEnum(node.data.content);
          selectedLanguage.value = "json";
          break;
        case "point-of-interest":
          selectedCode.value = formatPointOfInterest(node.data.content);
          selectedLanguage.value = "json";
          break;
        case "json-schema":
          const rawData =
            node.data.content.rawIntrospection || node.data.content;
          selectedCode.value = JSON.stringify(rawData, null, 2);
          selectedLanguage.value = "json";
          break;
        case "request-template":
          selectedCode.value = generateRequestTemplate(node.data.content);
          selectedLanguage.value = "graphql";
          break;
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
