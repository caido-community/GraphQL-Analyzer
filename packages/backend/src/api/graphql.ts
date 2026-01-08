import type { SDK } from "caido:plugin";
import { RequestSpec } from "caido:utils";
import type {
  GraphQLField,
  GraphQLSchema,
  IntrospectionField,
  IntrospectionSchema,
  IntrospectionType,
  IntrospectionTypeRef,
  PointOfInterest,
  Result,
} from "shared";

const INTROSPECTION_QUERY = `
  query IntrospectionQuery {
    __schema {
      queryType { name }
      mutationType { name }
      subscriptionType { name }
      types {
        ...FullType
      }
    }
  }
  
  fragment FullType on __Type {
    kind
    name
    description
    fields(includeDeprecated: true) {
      name
      description
      args {
        ...InputValue
      }
      type {
        ...TypeRef
      }
      isDeprecated
      deprecationReason
    }
    inputFields {
      ...InputValue
    }
    interfaces {
      ...TypeRef
    }
    enumValues(includeDeprecated: true) {
      name
      description
      isDeprecated
      deprecationReason
    }
    possibleTypes {
      ...TypeRef
    }
  }
  
  fragment InputValue on __InputValue {
    name
    description
    type { ...TypeRef }
    defaultValue
  }
  
  fragment TypeRef on __Type {
    kind
    name
    ofType {
      kind
      name
      ofType {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                }
              }
            }
          }
        }
      }
    }
  }
`;

export class GraphQLService {
  constructor(private sdk: SDK) {}

  async testEndpointFromRequest(
    requestId: string,
    customHeaders?: Record<string, string>,
  ): Promise<
    Result<{ supportsIntrospection: boolean; schema?: GraphQLSchema }>
  > {
    try {
      const requestResult = await this.sdk.requests.get(requestId);
      if (!requestResult) {
        return {
          kind: "Error",
          error: "Request not found",
        };
      }

      const originalRequest = requestResult.request;
      const originalUrl = originalRequest.getUrl();

      if (
        !originalUrl.startsWith("http://") &&
        !originalUrl.startsWith("https://")
      ) {
        return {
          kind: "Error",
          error: "Request URL must start with http:// or https://",
        };
      }

      const originalRaw = originalRequest.getRaw().toText();
      const lines = originalRaw.split(/\r?\n/);
      const originalHeaders: Record<string, string> = {};
      let originalBody = "";

      let inHeaders = false;
      let bodyStartIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined) continue;

        const trimmedLine = line.trim();

        if (i === 0) {
          inHeaders = true;
          continue;
        }

        if (inHeaders === true && trimmedLine === "") {
          bodyStartIndex = i + 1;
          break;
        }

        if (
          inHeaders === true &&
          typeof trimmedLine === "string" &&
          trimmedLine.includes(":")
        ) {
          const colonIndex = trimmedLine.indexOf(":");
          const headerName = trimmedLine.substring(0, colonIndex).trim();
          const headerValue = trimmedLine.substring(colonIndex + 1).trim();
          if (
            headerName !== "" &&
            headerValue !== "" &&
            headerName.toLowerCase() !== "content-length"
          ) {
            originalHeaders[headerName] = headerValue;
          }
        }
      }

      if (bodyStartIndex > 0 && bodyStartIndex < lines.length) {
        originalBody = lines.slice(bodyStartIndex).join("\r\n").trim();
      }

      const headers: Record<string, string> = {
        ...originalHeaders,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Caido/GraphQL-Analyzer",
      };

      if (customHeaders && typeof customHeaders === "object") {
        Object.entries(customHeaders).forEach(([key, value]) => {
          if (
            key &&
            value &&
            typeof key === "string" &&
            typeof value === "string" &&
            key.trim() &&
            value.trim()
          ) {
            headers[key] = String(value);
          }
        });
      }

      for (const [key, value] of Object.entries(headers)) {
        if (
          typeof value !== "string" ||
          value === "" ||
          value === "null" ||
          value === "undefined"
        ) {
          delete headers[key];
        }
      }

      const method = originalRequest.getMethod() || "POST";

      if (originalBody && originalBody.trim() !== "") {
        try {
          const originalSpec = new RequestSpec(originalUrl);
          originalSpec.setMethod(method);

          for (const [name, value] of Object.entries(headers)) {
            if (value) {
              originalSpec.setHeader(name, value);
            }
          }

          originalSpec.setBody(originalBody);

          const originalResult = await this.sdk.requests.send(originalSpec);
          const originalProcessed =
            this.processIntrospectionResponse(originalResult);

          if (
            originalProcessed.kind === "Ok" &&
            originalProcessed.value.supportsIntrospection === true &&
            originalProcessed.value.schema !== undefined
          ) {
            return originalProcessed;
          }
        } catch {
          // Ignore errors when trying original request
        }
      }

      const requestBody = JSON.stringify({
        query: INTROSPECTION_QUERY,
      });

      const spec = new RequestSpec(originalUrl);
      spec.setMethod("POST");

      for (const [name, value] of Object.entries(headers)) {
        if (value) {
          spec.setHeader(name, value);
        }
      }

      spec.setBody(requestBody);

      const result = await this.sdk.requests.send(spec);

      return this.processIntrospectionResponse(result);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      return {
        kind: "Error",
        error: `Failed to test GraphQL endpoint: ${errorMsg}`,
      };
    }
  }

  async testEndpoint(
    url: string,
    customHeaders?: Record<string, string>,
  ): Promise<
    Result<{ supportsIntrospection: boolean; schema?: GraphQLSchema }>
  > {
    try {
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return {
          kind: "Error",
          error: "URL must start with http:// or https://",
        };
      }

      let hostHeader = "";
      try {
        const parsedUrl = new URL(url);
        if (
          parsedUrl.port &&
          ((parsedUrl.protocol === "https:" && parsedUrl.port !== "443") ||
            (parsedUrl.protocol === "http:" && parsedUrl.port !== "80"))
        ) {
          hostHeader = `${parsedUrl.hostname}:${parsedUrl.port}`;
        } else {
          hostHeader = parsedUrl.hostname;
        }
      } catch (error) {
        return { kind: "Error", error: "Invalid URL format" };
      }

      if (!hostHeader) {
        return { kind: "Error", error: "Failed to extract host from URL" };
      }

      const headers: Record<string, string> = {};

      headers["Host"] = String(hostHeader);
      headers["Content-Type"] = "application/json";
      headers["Accept"] = "application/json";
      headers["User-Agent"] = "Caido/GraphQL-Analyzer";

      if (customHeaders && typeof customHeaders === "object") {
        Object.entries(customHeaders).forEach(([key, value]) => {
          if (
            key &&
            value &&
            typeof key === "string" &&
            typeof value === "string" &&
            key.trim() &&
            value.trim()
          ) {
            headers[key] = String(value);
          }
        });
      }

      for (const [key, value] of Object.entries(headers)) {
        if (
          typeof value !== "string" ||
          value === "" ||
          value === "null" ||
          value === "undefined"
        ) {
          delete headers[key];
        }
      }

      const requestBody = JSON.stringify({
        query: INTROSPECTION_QUERY,
      });

      if (!url || typeof url !== "string") {
        return { kind: "Error", error: "Invalid URL" };
      }

      const spec = new RequestSpec(url);
      spec.setMethod("POST");

      for (const [name, value] of Object.entries(headers)) {
        if (value) {
          spec.setHeader(name, value);
        }
      }

      spec.setBody(requestBody);

      const result = await this.sdk.requests.send(spec);

      return this.processIntrospectionResponse(result);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      return {
        kind: "Error",
        error: `Failed to test GraphQL endpoint: ${errorMsg}`,
      };
    }
  }

  private processIntrospectionResponse(
    result: Awaited<ReturnType<typeof this.sdk.requests.send>>,
  ): Result<{ supportsIntrospection: boolean; schema?: GraphQLSchema }> {
    if (result.response === undefined) {
      return {
        kind: "Error",
        error: "No response received from the endpoint",
      };
    }

    const statusCode = result.response.getCode();
    const responseBody = result.response.getBody()?.toText() ?? "";

    if (statusCode === 401) {
      return {
        kind: "Error",
        error: `Authentication required (HTTP 401). Add Authorization, Cookie, or API key headers.`,
      };
    }

    if (statusCode === 403) {
      return {
        kind: "Error",
        error: `Access forbidden (HTTP 403). Your credentials lack required permissions.`,
      };
    }

    if (statusCode === 404) {
      return {
        kind: "Error",
        error: `Endpoint not found (HTTP 404). Verify the URL is correct.`,
      };
    }

    if (statusCode === 405) {
      return {
        kind: "Error",
        error: `Method not allowed (HTTP 405). This endpoint may not support POST requests.`,
      };
    }

    if (statusCode >= 500) {
      return {
        kind: "Error",
        error: `Server error (HTTP ${statusCode}). The server is experiencing issues.`,
      };
    }

    if (statusCode !== 200) {
      const trimmed = responseBody.trim();
      if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
        return {
          kind: "Error",
          error: `Received HTML page (HTTP ${statusCode}). This may not be a GraphQL endpoint.`,
        };
      }
      const preview = responseBody.substring(0, 150);
      return {
        kind: "Error",
        error: `Unexpected response (HTTP ${statusCode}): ${preview}...`,
      };
    }

    try {
      const jsonResponse = JSON.parse(responseBody);

      if (
        Array.isArray(jsonResponse.errors) &&
        jsonResponse.errors.length > 0
      ) {
        const introspectionDisabled = jsonResponse.errors.some(
          (error: { message?: string }) => {
            const message = error.message;
            return (
              typeof message === "string" &&
              (message.toLowerCase().includes("introspection") ||
                message.toLowerCase().includes("disabled") ||
                message.toLowerCase().includes("not allowed"))
            );
          },
        );

        if (introspectionDisabled === true) {
          return { kind: "Ok", value: { supportsIntrospection: false } };
        }

        const errorMessages = (
          jsonResponse.errors as Array<{ message?: string }>
        )
          .map((e) => e.message ?? "Unknown error")
          .join(", ");
        return {
          kind: "Error",
          error: `GraphQL error: ${errorMessages}`,
        };
      }

      if (
        jsonResponse.data !== undefined &&
        jsonResponse.data.__schema !== undefined
      ) {
        const schema = this.parseIntrospectionResult(
          jsonResponse.data.__schema as IntrospectionSchema,
        );
        (
          schema as GraphQLSchema & { rawIntrospection?: unknown }
        ).rawIntrospection = jsonResponse.data;
        return { kind: "Ok", value: { supportsIntrospection: true, schema } };
      }

      if (jsonResponse.data !== undefined) {
        return {
          kind: "Error",
          error:
            "GraphQL endpoint responded but introspection is disabled or not available.",
        };
      }

      return {
        kind: "Error",
        error: "Endpoint returned JSON but it's not a valid GraphQL response.",
      };
    } catch (parseError) {
      const preview = responseBody.substring(0, 100);
      return { kind: "Error", error: `Invalid JSON response: ${preview}...` };
    }
  }

  private parseIntrospectionResult(
    schemaData: IntrospectionSchema,
  ): GraphQLSchema {
    const schema: GraphQLSchema = {
      queries: [],
      mutations: [],
      subscriptions: [],
      types: [],
      enums: [],
      interfaces: [],
      unions: [],
      scalars: [],
      pointsOfInterest: [],
    };

    const queryType = schemaData.types.find(
      (t) => t.name === schemaData.queryType?.name,
    );
    const mutationType = schemaData.types.find(
      (t) => t.name === schemaData.mutationType?.name,
    );
    const subscriptionType = schemaData.types.find(
      (t) => t.name === schemaData.subscriptionType?.name,
    );

    if (queryType?.fields && Array.isArray(queryType.fields)) {
      schema.queries = queryType.fields.map((field) => ({
        ...this.parseField(field),
        rawIntrospectionData: field,
      }));
    }

    if (mutationType?.fields && Array.isArray(mutationType.fields)) {
      schema.mutations = mutationType.fields.map((field) => ({
        ...this.parseField(field),
        rawIntrospectionData: field,
      }));
    }

    if (subscriptionType?.fields && Array.isArray(subscriptionType.fields)) {
      schema.subscriptions = subscriptionType.fields.map((field) => ({
        ...this.parseField(field),
        rawIntrospectionData: field,
      }));
    }

    const customTypes = schemaData.types.filter(
      (t) => typeof t.name === "string" && !t.name.startsWith("__"),
    );

    for (const type of customTypes) {
      if (type.name === undefined) continue;

      switch (type.kind) {
        case "OBJECT":
          if (
            type.name !== schemaData.queryType?.name &&
            type.name !== schemaData.mutationType?.name &&
            type.name !== schemaData.subscriptionType?.name
          ) {
            schema.types.push({
              name: type.name,
              kind: type.kind,
              description: type.description,
              fields:
                type.fields && Array.isArray(type.fields)
                  ? type.fields.map(this.parseField)
                  : undefined,
            });
          }
          break;

        case "ENUM":
          schema.enums.push({
            name: type.name,
            description: type.description,
            values:
              type.enumValues && Array.isArray(type.enumValues)
                ? type.enumValues.map((val) => ({
                    name: val.name,
                    description: val.description,
                    isDeprecated: val.isDeprecated === true,
                    deprecationReason: val.deprecationReason,
                  }))
                : [],
          });
          break;

        case "INTERFACE":
          schema.interfaces.push({
            name: type.name,
            description: type.description,
            fields:
              type.fields && Array.isArray(type.fields)
                ? type.fields.map(this.parseField)
                : [],
            possibleTypes:
              type.possibleTypes && Array.isArray(type.possibleTypes)
                ? type.possibleTypes
                    .map((pt) => pt.name ?? "")
                    .filter((name) => name !== "")
                : [],
          });
          break;

        case "UNION":
          schema.unions.push({
            name: type.name,
            description: type.description,
            possibleTypes:
              type.possibleTypes && Array.isArray(type.possibleTypes)
                ? type.possibleTypes
                    .map((pt) => pt.name ?? "")
                    .filter((name) => name !== "")
                : [],
          });
          break;

        case "SCALAR":
          if (
            !["String", "Int", "Float", "Boolean", "ID"].includes(type.name)
          ) {
            schema.scalars.push({
              name: type.name,
              description: type.description,
            });
          }
          break;
      }
    }

    schema.pointsOfInterest = this.generatePointsOfInterest(schema);

    schema.allTypes = schemaData.types;

    return schema;
  }

  private parseField = (field: IntrospectionField) => ({
    name: field.name,
    description: field.description,
    args: Array.isArray(field.args)
      ? field.args.map((arg) => ({
          name: arg.name,
          type: this.formatType(arg.type),
          defaultValue: arg.defaultValue,
          rawType: arg.type,
        }))
      : [],
    type: this.formatType(field.type),
    rawType: field.type,
    rawField: field,
  });

  private formatType = (type: IntrospectionTypeRef): string => {
    if (type.kind === "NON_NULL" && type.ofType) {
      return `${this.formatType(type.ofType)}!`;
    }
    if (type.kind === "LIST" && type.ofType) {
      return `[${this.formatType(type.ofType)}]`;
    }
    return type.name ?? "Unknown";
  };

  private generatePointsOfInterest(schema: GraphQLSchema): PointOfInterest[] {
    const points: PointOfInterest[] = [];

    const allFields = [
      ...schema.queries,
      ...schema.mutations,
      ...schema.subscriptions,
    ];

    for (const field of allFields) {
      if (/auth|login|token|password|credential|session/i.test(field.name)) {
        points.push({
          name: field.name,
          type: schema.queries.includes(field)
            ? "query"
            : schema.mutations.includes(field)
              ? "mutation"
              : "subscription",
          description: field.description,
          reason: "Authentication-related operation",
          severity: "high",
        });
      }

      if (/admin|delete|remove|destroy|update.*user|manage/i.test(field.name)) {
        points.push({
          name: field.name,
          type: schema.queries.includes(field)
            ? "query"
            : schema.mutations.includes(field)
              ? "mutation"
              : "subscription",
          description: field.description,
          reason: "Potentially privileged operation",
          severity: "medium",
        });
      }

      if (/upload|file|download|import|export/i.test(field.name)) {
        points.push({
          name: field.name,
          type: schema.queries.includes(field)
            ? "query"
            : schema.mutations.includes(field)
              ? "mutation"
              : "subscription",
          description: field.description,
          reason:
            "File operation - potential for path traversal/upload vulnerabilities",
          severity: "medium",
        });
      }
    }

    for (const type of schema.types) {
      if (type.fields) {
        for (const field of type.fields) {
          if (
            /password|secret|token|key|credential|ssn|email|phone/i.test(
              field.name,
            )
          ) {
            points.push({
              name: `${type.name}.${field.name}`,
              type: "field",
              description: field.description,
              reason: "Potentially sensitive data field",
              severity: "medium",
            });
          }
        }
      }
    }

    return points;
  }

  generateGraphQLQuery(
    field: GraphQLField & {
      rawType?: IntrospectionTypeRef;
      type?: IntrospectionTypeRef | string;
    },
    operationType: "query" | "mutation" | "subscription",
    allTypes: IntrospectionType[],
    maxDepth: number = 200,
  ): string {
    const lines: string[] = [];
    const capitalize = (str: string) =>
      str.charAt(0).toUpperCase() + str.slice(1);

    const args = this.formatFieldArguments(field.args ?? []);
    lines.push(`${operationType} ${capitalize(field.name)}${args} {`);

    lines.push(
      `  ${field.name}${this.formatQueryArguments(field.args ?? [])} {`,
    );

    const visitedTypes = new Set<string>();
    const nestedFields = this.generateNestedFields(
      field.rawType || field.type,
      allTypes,
      maxDepth,
      2,
      visitedTypes,
    );
    lines.push(...nestedFields);

    lines.push("  }");
    lines.push("}");

    return lines.join("\n");
  }

  private formatFieldArguments(
    args: Array<{
      name: string;
      rawType?: IntrospectionTypeRef;
      type?: IntrospectionTypeRef | string;
    }>,
  ): string {
    if (args.length === 0) return "";

    const argStrings = args.map((arg) => {
      const type = arg.rawType
        ? this.formatType(arg.rawType)
        : typeof arg.type === "string"
          ? arg.type
          : arg.type
            ? this.formatType(arg.type)
            : "String";
      return `$${arg.name}: ${type}`;
    });

    return `(${argStrings.join(", ")})`;
  }

  private formatQueryArguments(args: Array<{ name: string }>): string {
    if (args.length === 0) return "";

    const argStrings = args.map((arg) => `${arg.name}: $${arg.name}`);
    return `(${argStrings.join(", ")})`;
  }

  private generateNestedFields(
    type: IntrospectionTypeRef | string | undefined,
    allTypes: IntrospectionType[],
    maxDepth: number,
    currentDepth: number = 0,
    visitedTypes: Set<string> = new Set(),
  ): string[] {
    const lines: string[] = [];
    const indent = "  ".repeat(currentDepth);

    if (currentDepth >= maxDepth) {
      lines.push(`${indent}# Maximum depth reached`);
      return lines;
    }

    const unwrappedType = this.unwrapType(type);
    if (unwrappedType === undefined || unwrappedType.name === undefined)
      return lines;

    if (
      unwrappedType.name !== undefined &&
      visitedTypes.has(unwrappedType.name)
    ) {
      return lines;
    }

    const typeDefinition = unwrappedType.name
      ? allTypes.find((t) => t.name === unwrappedType.name)
      : undefined;
    if (!typeDefinition) return lines;

    if (unwrappedType.name) {
      visitedTypes.add(unwrappedType.name);
    }

    switch (typeDefinition.kind) {
      case "OBJECT":
      case "INTERFACE":
        if (
          typeDefinition.fields &&
          Array.isArray(typeDefinition.fields) &&
          typeDefinition.fields.length > 0
        ) {
          for (const field of typeDefinition.fields) {
            if (this.isScalarOrEnum(field.type, allTypes)) {
              lines.push(`${indent}${field.name}`);
            } else {
              lines.push(`${indent}${field.name} {`);
              const nestedFields = this.generateNestedFields(
                field.type,
                allTypes,
                maxDepth,
                currentDepth + 1,
                new Set(visitedTypes),
              );
              lines.push(...nestedFields);
              lines.push(`${indent}}`);
            }
          }
        }
        break;

      case "UNION":
        if (
          typeDefinition.possibleTypes &&
          Array.isArray(typeDefinition.possibleTypes)
        ) {
          for (const possibleType of typeDefinition.possibleTypes) {
            const typeName = possibleType.name ?? "";
            if (typeName !== "") {
              lines.push(`${indent}... on ${typeName} {`);
              lines.push(`${indent}  __typename`);
              const nestedFields = this.generateNestedFields(
                possibleType,
                allTypes,
                maxDepth,
                currentDepth + 1,
                new Set(visitedTypes),
              );
              lines.push(...nestedFields);
              lines.push(`${indent}}`);
            }
          }
        }
        break;

      case "ENUM":
      case "SCALAR":
        break;
    }

    if (unwrappedType.name) {
      visitedTypes.delete(unwrappedType.name);
    }

    return lines;
  }

  private unwrapType(
    type: IntrospectionTypeRef | string | undefined,
  ): IntrospectionTypeRef | undefined {
    if (type === undefined || typeof type === "string") return undefined;
    if (type.kind === "NON_NULL" || type.kind === "LIST") {
      return this.unwrapType(type.ofType);
    }
    return type;
  }

  private isScalarOrEnum(
    type: IntrospectionTypeRef,
    allTypes: IntrospectionType[],
  ): boolean {
    const unwrapped = this.unwrapType(type);
    if (unwrapped === undefined || unwrapped.name === undefined) return true;

    const typeDefinition = allTypes.find((t) => t.name === unwrapped.name);
    if (!typeDefinition) return true;

    return typeDefinition.kind === "SCALAR" || typeDefinition.kind === "ENUM";
  }

  async executeQuery(
    url: string,
    payload: {
      query: string;
      variables?: Record<string, unknown>;
      operationName?: string;
    },
  ): Promise<Result<Record<string, unknown>>> {
    try {
      this.sdk.console.log(`Executing GraphQL query against: ${url}`);

      const requestBody = JSON.stringify(payload);

      const spec = new RequestSpec(url);
      spec.setMethod("POST");
      spec.setHeader("Content-Type", "application/json");
      spec.setHeader("Accept", "application/json");
      spec.setBody(requestBody);

      const result = await this.sdk.requests.send(spec);

      if (result.response === undefined) {
        return {
          kind: "Error",
          error: "No response received",
        };
      }

      const statusCode = result.response.getCode();
      if (statusCode < 200 || statusCode >= 300) {
        return {
          kind: "Error",
          error: `HTTP ${statusCode}`,
        };
      }

      const responseBody = result.response.getBody()?.toText() ?? "";
      const parsedResult: Record<string, unknown> = JSON.parse(
        responseBody,
      ) as Record<string, unknown>;

      if (
        Array.isArray(parsedResult.errors) &&
        parsedResult.errors.length > 0
      ) {
        const errorMessages = (
          parsedResult.errors as Array<{ message?: string }>
        )
          .map((err) => err.message ?? "Unknown error")
          .join(", ");
        return {
          kind: "Error",
          error: `GraphQL Error: ${errorMessages}`,
        };
      }

      return {
        kind: "Ok",
        value: parsedResult,
      };
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      this.sdk.console.error(`Error executing GraphQL query: ${errorMsg}`);
      return {
        kind: "Error",
        error: errorMsg,
      };
    }
  }
}
