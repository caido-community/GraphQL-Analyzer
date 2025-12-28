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

// Compatible introspection query (works with most GraphQL servers)
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

  async testEndpoint(
    url: string,
    customHeaders?: Record<string, string>,
  ): Promise<
    Result<{ supportsIntrospection: boolean; schema?: GraphQLSchema }>
  > {
    try {
      // Ensure URL has protocol
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return {
          kind: "Error",
          error: "URL must start with http:// or https://",
        };
      }

      // Extract host from URL for Host header
      let hostHeader = "";
      try {
        const parsedUrl = new URL(url);
        // Include port in Host header if it's not default (80 for http, 443 for https)
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

      // Build headers object - start fresh to ensure no null values
      const headers: Record<string, string> = {};

      // Add required headers one by one with explicit string values
      headers["Host"] = String(hostHeader);
      headers["Content-Type"] = "application/json";
      headers["Accept"] = "application/json";
      headers["User-Agent"] = "Caido/GraphQL-Analyzer";

      // Merge custom headers if provided (these override defaults)
      if (customHeaders && typeof customHeaders === "object") {
        Object.entries(customHeaders).forEach(([key, value]) => {
          // Only add if both key and value are non-empty strings
          if (
            key &&
            value &&
            typeof key === "string" &&
            typeof value === "string" &&
            key.trim() &&
            value.trim()
          ) {
            headers[key] = String(value); // Ensure it's a string
          }
        });
      }

      // Validate all headers are strings (final safety check)
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

      // Create request using Caido SDK (same as attacks service)
      const requestBody = JSON.stringify({
        query: INTROSPECTION_QUERY,
      });

      // Ensure URL is valid string
      if (!url || typeof url !== "string") {
        return { kind: "Error", error: "Invalid URL" };
      }

      const spec = new RequestSpec(url);
      spec.setMethod("POST");

      // Set all headers using SDK
      for (const [name, value] of Object.entries(headers)) {
        if (value) {
          spec.setHeader(name, value);
        }
      }

      spec.setBody(requestBody);

      // Send request using Caido SDK (adds to HTTP History)
      const result = await this.sdk.requests.send(spec);

      if (!result.response) {
        return {
          kind: "Error",
          error: "No response received from the endpoint",
        };
      }

      const statusCode = result.response.getCode();
      const responseBody = result.response.getBody()?.toText() || "";

      // Check for authentication errors first
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

      // Only check for obvious HTML if status is not 200
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

      // For 200 responses, try to parse as JSON
      try {
        const jsonResponse = JSON.parse(responseBody);

        // Check for errors in the GraphQL response
        if (jsonResponse.errors) {
          // Check if it's an introspection disabled error
          const introspectionDisabled = jsonResponse.errors.some(
            (error: any) =>
              error.message?.toLowerCase().includes("introspection") ||
              error.message?.toLowerCase().includes("disabled") ||
              error.message?.toLowerCase().includes("not allowed"),
          );

          if (introspectionDisabled) {
            return { kind: "Ok", value: { supportsIntrospection: false } };
          }

          // Return the GraphQL errors
          const errorMessages = (
            jsonResponse.errors as Array<{ message?: string }>
          )
            .map((e) => e.message || "Unknown error")
            .join(", ");
          return {
            kind: "Error",
            error: `GraphQL error: ${errorMessages}`,
          };
        }

        // Check for successful introspection
        if (jsonResponse.data && jsonResponse.data.__schema) {
          const schema = this.parseIntrospectionResult(
            jsonResponse.data.__schema as IntrospectionSchema,
          );
          (
            schema as GraphQLSchema & { rawIntrospection?: unknown }
          ).rawIntrospection = jsonResponse.data;
          return { kind: "Ok", value: { supportsIntrospection: true, schema } };
        }

        // Response has data but no schema
        if (jsonResponse.data) {
          return {
            kind: "Error",
            error:
              "GraphQL endpoint responded but introspection is disabled or not available.",
          };
        }

        // Valid JSON but not a GraphQL response
        return {
          kind: "Error",
          error:
            "Endpoint returned JSON but it's not a valid GraphQL response.",
        };
      } catch (parseError) {
        // Failed to parse as JSON
        const preview = responseBody.substring(0, 100);
        return { kind: "Error", error: `Invalid JSON response: ${preview}...` };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (
        errorMessage.includes("ECONNREFUSED") ||
        errorMessage.includes("ENOTFOUND")
      ) {
        return {
          kind: "Error",
          error: `Cannot connect to endpoint. Check the URL and ensure the server is running.`,
        };
      }

      if (errorMessage.includes("timeout")) {
        return {
          kind: "Error",
          error: `Request timeout. The endpoint did not respond in time.`,
        };
      }

      if (
        errorMessage.includes("SSL") ||
        errorMessage.includes("certificate")
      ) {
        return {
          kind: "Error",
          error: `SSL/Certificate error. Check HTTPS connection.`,
        };
      }

      return { kind: "Error", error: `Connection failed: ${errorMessage}` };
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

    // Find root types
    const queryType = schemaData.types.find(
      (t) => t.name === schemaData.queryType?.name,
    );
    const mutationType = schemaData.types.find(
      (t) => t.name === schemaData.mutationType?.name,
    );
    const subscriptionType = schemaData.types.find(
      (t) => t.name === schemaData.subscriptionType?.name,
    );

    // Parse queries - store BOTH processed AND raw data
    if (queryType?.fields && Array.isArray(queryType.fields)) {
      schema.queries = queryType.fields.map((field) => ({
        ...this.parseField(field),
        rawIntrospectionData: field, // Store the complete raw field data
      }));
    }

    // Parse mutations - store BOTH processed AND raw data
    if (mutationType?.fields && Array.isArray(mutationType.fields)) {
      schema.mutations = mutationType.fields.map((field) => ({
        ...this.parseField(field),
        rawIntrospectionData: field, // Store the complete raw field data
      }));
    }

    // Parse subscriptions - store BOTH processed AND raw data
    if (subscriptionType?.fields && Array.isArray(subscriptionType.fields)) {
      schema.subscriptions = subscriptionType.fields.map((field) => ({
        ...this.parseField(field),
        rawIntrospectionData: field, // Store the complete raw field data
      }));
    }

    // Categorize all types (excluding built-in types)
    const customTypes = schemaData.types.filter(
      (t) => t.name && !t.name.startsWith("__"),
    );

    for (const type of customTypes) {
      if (!type.name) continue;

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
                    .map((pt) => pt.name || "")
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
                    .map((pt) => pt.name || "")
                    .filter((name) => name !== "")
                : [],
          });
          break;

        case "SCALAR":
          // Include custom scalars only (exclude built-ins)
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

    // Generate Points of Interest
    schema.pointsOfInterest = this.generatePointsOfInterest(schema);

    // Store all types for query generation
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
          rawType: arg.type, // Store raw type for query generation
        }))
      : [],
    type: this.formatType(field.type),
    rawType: field.type, // Store raw type for query generation
    rawField: field, // Store complete raw field data
  });

  private formatType = (type: IntrospectionTypeRef): string => {
    if (type.kind === "NON_NULL" && type.ofType) {
      return `${this.formatType(type.ofType)}!`;
    }
    if (type.kind === "LIST" && type.ofType) {
      return `[${this.formatType(type.ofType)}]`;
    }
    return type.name || "Unknown";
  };

  private generatePointsOfInterest(schema: GraphQLSchema): PointOfInterest[] {
    const points: PointOfInterest[] = [];

    // Check for authentication-related fields
    const allFields = [
      ...schema.queries,
      ...schema.mutations,
      ...schema.subscriptions,
    ];

    for (const field of allFields) {
      // Authentication-related fields
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

      // Admin/privileged operations
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

      // File/upload operations
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

    // Check for sensitive field names in types
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

  // Generate GraphQL query
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

    // Add operation header with arguments
    const args = this.formatFieldArguments(field.args || []);
    lines.push(`${operationType} ${capitalize(field.name)}${args} {`);

    // Add the field itself with nested fields
    lines.push(
      `  ${field.name}${this.formatQueryArguments(field.args || [])} {`,
    );

    // Generate nested fields recursively
    const visitedTypes = new Set<string>(); // Prevent infinite recursion
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
    if (!args || args.length === 0) return "";

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
    if (!args || args.length === 0) return "";

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

    // Unwrap the type (handle NON_NULL, LIST)
    const unwrappedType = this.unwrapType(type);
    if (!unwrappedType || !unwrappedType.name) return lines;

    // Cycle detection - prevent infinite recursion
    if (unwrappedType.name && visitedTypes.has(unwrappedType.name)) {
      lines.push(`${indent}# Cycle detected for type: ${unwrappedType.name}`);
      return lines;
    }

    // Find the type definition in allTypes
    const typeDefinition = unwrappedType.name
      ? allTypes.find((t) => t.name === unwrappedType.name)
      : undefined;
    if (!typeDefinition) return lines;

    // Add this type to visited set
    if (unwrappedType.name) {
      visitedTypes.add(unwrappedType.name);
    }

    // Handle different type kinds
    switch (typeDefinition.kind) {
      case "OBJECT":
      case "INTERFACE":
        if (
          typeDefinition.fields &&
          Array.isArray(typeDefinition.fields) &&
          typeDefinition.fields.length > 0
        ) {
          for (const field of typeDefinition.fields) {
            // Show ALL fields - no limits!
            if (this.isScalarOrEnum(field.type, allTypes)) {
              // Simple field
              lines.push(`${indent}${field.name}`);
            } else {
              // Complex field - recurse
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
            // Show ALL possible types!
            const typeName = possibleType.name || "";
            if (typeName) {
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
        // These are leaf types, no nested fields
        break;
    }

    // Remove from visited set to allow visiting in other branches
    if (unwrappedType.name) {
      visitedTypes.delete(unwrappedType.name);
    }

    return lines;
  }

  private unwrapType(
    type: IntrospectionTypeRef | string | undefined,
  ): IntrospectionTypeRef | null {
    if (!type || typeof type === "string") return null;
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
    if (!unwrapped || !unwrapped.name) return true;

    const typeDefinition = allTypes.find((t) => t.name === unwrapped.name);
    if (!typeDefinition) return true;

    return typeDefinition.kind === "SCALAR" || typeDefinition.kind === "ENUM";
  }

  // Execute GraphQL query against an endpoint
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

      // Send request using Caido SDK (adds to HTTP History)
      const result = await this.sdk.requests.send(spec);

      if (!result.response) {
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

      const responseBody = result.response.getBody()?.toText() || "";
      const parsedResult: Record<string, unknown> = JSON.parse(
        responseBody,
      ) as Record<string, unknown>;

      // Check for GraphQL errors
      if (
        parsedResult.errors &&
        Array.isArray(parsedResult.errors) &&
        parsedResult.errors.length > 0
      ) {
        const errorMessages = (
          parsedResult.errors as Array<{ message?: string }>
        )
          .map((err) => err.message || "Unknown error")
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
