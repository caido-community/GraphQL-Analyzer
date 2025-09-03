import { Request as FetchRequest, fetch } from "caido:http";
import type { SDK } from "caido:plugin";

import type { Result, GraphQLSchema } from "../types";

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

  async testEndpoint(url: string): Promise<Result<{ supportsIntrospection: boolean; schema?: GraphQLSchema }>> {
    try {
      this.sdk.console.log(`GraphQL Service: Testing endpoint ${url}`);
      
      // Create request using Caido's fetch API
      const request = new FetchRequest(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          query: INTROSPECTION_QUERY
        })
      });

      // Send request
      const response = await fetch(request);
      
      if (!response) {
        return { kind: "Error", error: "No response received from the endpoint" };
      }

      const statusCode = response.status;
      const contentType = response.headers.get("content-type") || "";
      const responseBody = await response.text();

      // Check if response is not successful
      if (statusCode < 200 || statusCode >= 300) {
        if (responseBody.includes("<!DOCTYPE") || responseBody.includes("<html")) {
          return { kind: "Error", error: `This endpoint returned HTML instead of JSON. This is not a GraphQL endpoint.` };
        }
        
        if (statusCode === 404) {
          return { kind: "Error", error: `GraphQL endpoint not found (404). This URL does not appear to be a GraphQL endpoint.` };
        }
        
        if (statusCode === 405) {
          return { kind: "Error", error: `Method not allowed (405). This endpoint does not support GraphQL POST requests.` };
        }
        
        if (statusCode >= 500) {
          return { kind: "Error", error: `Server error (${statusCode}). The GraphQL endpoint may be experiencing issues.` };
        }
        
        return { kind: "Error", error: `This endpoint is not responding as expected for GraphQL requests (HTTP ${statusCode}).` };
      }

      // Check if response is JSON
      if (!contentType.includes("application/json") && !responseBody.trim().startsWith("{")) {
        if (responseBody.includes("<!DOCTYPE") || responseBody.includes("<html")) {
          return { kind: "Error", error: "This endpoint returned HTML instead of JSON. This is not a GraphQL endpoint." };
        }
        return { kind: "Error", error: `This endpoint did not return JSON as expected for GraphQL. This may not be a GraphQL endpoint.` };
      }

      try {
        const jsonResponse = JSON.parse(responseBody);
        
        if (jsonResponse.errors) {
          // Check if it's an introspection disabled error
          const introspectionDisabled = jsonResponse.errors.some((error: any) => 
            error.message?.toLowerCase().includes("introspection") ||
            error.message?.toLowerCase().includes("disabled") ||
            error.message?.toLowerCase().includes("not allowed")
          );
          
          if (introspectionDisabled) {
            return { kind: "Ok", value: { supportsIntrospection: false } };
          }
          
          return { kind: "Error", error: `GraphQL errors: ${jsonResponse.errors.map((e: any) => e.message).join(", ")}` };
        }

        if (jsonResponse.data && jsonResponse.data.__schema) {
          // Parse schema AND store raw introspection
          const schema = this.parseIntrospectionResult(jsonResponse.data.__schema);
              // Store the COMPLETE raw introspection response for JSON Schema display
    (schema as any).rawIntrospection = jsonResponse.data;
          return { kind: "Ok", value: { supportsIntrospection: true, schema } };
        }

        return { kind: "Error", error: "Invalid GraphQL response: missing __schema data" };
        
      } catch (parseError) {
        // Better error message for JSON parsing failures
        const preview = responseBody.substring(0, 100);
        return { kind: "Error", error: `Failed to parse JSON response. Got: "${preview}..." - This might not be a GraphQL endpoint.` };
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes("ECONNREFUSED") || errorMessage.includes("ENOTFOUND")) {
        return { kind: "Error", error: `Cannot connect to this endpoint. Please check the URL and ensure the server is running.` };
      }
      
      if (errorMessage.includes("timeout")) {
        return { kind: "Error", error: `Request timeout. The endpoint did not respond in time.` };
      }
      
      if (errorMessage.includes("SSL") || errorMessage.includes("certificate")) {
        return { kind: "Error", error: `SSL/Certificate error. There may be an issue with the HTTPS connection.` };
      }
      
      return { kind: "Error", error: `Unable to connect to this endpoint. Please verify the URL is correct and accessible.` };
    }
  }

  private parseIntrospectionResult(schemaData: any): GraphQLSchema {
    const schema: GraphQLSchema = {
      queries: [],
      mutations: [],
      subscriptions: [],
      types: [],
      enums: [],
      interfaces: [],
      unions: [],
      scalars: [],
      pointsOfInterest: []
    };

    // Find root types
    const queryType = schemaData.types.find((t: any) => t.name === schemaData.queryType?.name);
    const mutationType = schemaData.types.find((t: any) => t.name === schemaData.mutationType?.name);
    const subscriptionType = schemaData.types.find((t: any) => t.name === schemaData.subscriptionType?.name);

    // Parse queries - store BOTH processed AND raw data
    if (queryType?.fields) {
      schema.queries = queryType.fields.map((field: any) => ({
        ...this.parseField(field),
        rawIntrospectionData: field // Store the complete raw field data
      }));
    }

    // Parse mutations - store BOTH processed AND raw data
    if (mutationType?.fields) {
      schema.mutations = mutationType.fields.map((field: any) => ({
        ...this.parseField(field),
        rawIntrospectionData: field // Store the complete raw field data
      }));
    }

    // Parse subscriptions - store BOTH processed AND raw data
    if (subscriptionType?.fields) {
      schema.subscriptions = subscriptionType.fields.map((field: any) => ({
        ...this.parseField(field),
        rawIntrospectionData: field // Store the complete raw field data
      }));
    }

    // Categorize all types (excluding built-in types)
    const customTypes = schemaData.types.filter((t: any) => !t.name.startsWith('__'));
    
    for (const type of customTypes) {
      switch (type.kind) {
        case 'OBJECT':
          if (type.name !== schemaData.queryType?.name && 
              type.name !== schemaData.mutationType?.name && 
              type.name !== schemaData.subscriptionType?.name) {
            schema.types.push({
              name: type.name,
              kind: type.kind,
              description: type.description,
              fields: type.fields ? type.fields.map(this.parseField) : undefined,
              rawIntrospectionData: type // Store the complete raw type data
            });
          }
          break;
         
        case 'ENUM':
          schema.enums.push({
            name: type.name,
            description: type.description,
            values: type.enumValues ? type.enumValues.map((val: any) => ({
              name: val.name,
              description: val.description,
              isDeprecated: val.isDeprecated || false,
              deprecationReason: val.deprecationReason
            })) : [],
            rawIntrospectionData: type // Store the complete raw enum data
          });
          break;
        
        case 'INTERFACE':
          schema.interfaces.push({
            name: type.name,
            description: type.description,
            fields: type.fields ? type.fields.map(this.parseField) : [],
            possibleTypes: type.possibleTypes ? type.possibleTypes.map((pt: any) => pt.name) : []
          });
          break;
        
        case 'UNION':
          schema.unions.push({
            name: type.name,
            description: type.description,
            possibleTypes: type.possibleTypes ? type.possibleTypes.map((pt: any) => pt.name) : []
          });
          break;
        
        case 'SCALAR':
          // Include custom scalars only (exclude built-ins)
          if (!['String', 'Int', 'Float', 'Boolean', 'ID'].includes(type.name)) {
            schema.scalars.push({
              name: type.name,
              description: type.description
            });
          }
          break;
      }
    }

    // Generate Points of Interest
    schema.pointsOfInterest = this.generatePointsOfInterest(schema);

    // Store all types for query generation
    (schema as any).allTypes = schemaData.types;

    return schema;
  }

  private parseField = (field: any) => ({
    name: field.name,
    description: field.description,
    args: field.args ? field.args.map((arg: any) => ({
      name: arg.name,
      type: this.formatType(arg.type),
      defaultValue: arg.defaultValue,
      rawType: arg.type // Store raw type for query generation
    })) : [],
    type: this.formatType(field.type),
    rawType: field.type, // Store raw type for query generation
    rawField: field // Store complete raw field data
  });

  private formatType = (type: any): string => {
    if (type.kind === 'NON_NULL') {
      return `${this.formatType(type.ofType)}!`;
    }
    if (type.kind === 'LIST') {
      return `[${this.formatType(type.ofType)}]`;
    }
    return type.name || 'Unknown';
  };

  private generatePointsOfInterest(schema: GraphQLSchema) {
    const points = [];

    // Check for authentication-related fields
    const allFields = [...schema.queries, ...schema.mutations, ...schema.subscriptions];
    
    for (const field of allFields) {
      // Authentication-related fields
      if (/auth|login|token|password|credential|session/i.test(field.name)) {
        points.push({
          name: field.name,
          type: schema.queries.includes(field) ? 'query' : 
                schema.mutations.includes(field) ? 'mutation' : 'subscription',
          description: field.description,
          reason: 'Authentication-related operation',
          severity: 'high'
        });
      }
      
      // Admin/privileged operations
      if (/admin|delete|remove|destroy|update.*user|manage/i.test(field.name)) {
        points.push({
          name: field.name,
          type: schema.queries.includes(field) ? 'query' : 
                schema.mutations.includes(field) ? 'mutation' : 'subscription',
          description: field.description,
          reason: 'Potentially privileged operation',
          severity: 'medium'
        });
      }
      
      // File/upload operations
      if (/upload|file|download|import|export/i.test(field.name)) {
        points.push({
          name: field.name,
          type: schema.queries.includes(field) ? 'query' : 
                schema.mutations.includes(field) ? 'mutation' : 'subscription',
          description: field.description,
          reason: 'File operation - potential for path traversal/upload vulnerabilities',
          severity: 'medium'
        });
      }
    }

    // Check for sensitive field names in types
    for (const type of schema.types) {
      if (type.fields) {
        for (const field of type.fields) {
          if (/password|secret|token|key|credential|ssn|email|phone/i.test(field.name)) {
            points.push({
              name: `${type.name}.${field.name}`,
              type: 'field',
              description: field.description,
              reason: 'Potentially sensitive data field',
              severity: 'medium'
            });
          }
        }
      }
    }

    return points;
  }

  // Generate GraphQL query
  generateGraphQLQuery(field: any, operationType: 'query' | 'mutation' | 'subscription', allTypes: any[], maxDepth: number = 200): string {
    const lines: string[] = [];
    const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);
    
    // Add operation header with arguments
    const args = this.formatFieldArguments(field.args || []);
    lines.push(`${operationType} ${capitalize(field.name)}${args} {`);
    
    // Add the field itself with nested fields
    lines.push(`  ${field.name}${this.formatQueryArguments(field.args || [])} {`);
    
    // Generate nested fields recursively
    const visitedTypes = new Set<string>(); // Prevent infinite recursion
    const nestedFields = this.generateNestedFields(field.rawType || field.type, allTypes, maxDepth, 2, visitedTypes);
    lines.push(...nestedFields);
    
    lines.push('  }');
    lines.push('}');
    
    return lines.join('\n');
  }

  private formatFieldArguments(args: any[]): string {
    if (!args || args.length === 0) return '';
    
    const argStrings = args.map(arg => {
      const type = this.formatType(arg.rawType || arg.type);
      return `$${arg.name}: ${type}`;
    });
    
    return `(${argStrings.join(', ')})`;
  }

  private formatQueryArguments(args: any[]): string {
    if (!args || args.length === 0) return '';
    
    const argStrings = args.map(arg => `${arg.name}: $${arg.name}`);
    return `(${argStrings.join(', ')})`;
  }

  private generateNestedFields(type: any, allTypes: any[], maxDepth: number, currentDepth: number = 0, visitedTypes: Set<string> = new Set()): string[] {
    const lines: string[] = [];
    const indent = '  '.repeat(currentDepth);
    
    if (currentDepth >= maxDepth) {
      lines.push(`${indent}# Maximum depth reached`);
      return lines;
    }

    // Unwrap the type (handle NON_NULL, LIST)
    const unwrappedType = this.unwrapType(type);
    if (!unwrappedType || !unwrappedType.name) return lines;

    // Cycle detection - prevent infinite recursion
    if (visitedTypes.has(unwrappedType.name)) {
      lines.push(`${indent}# Cycle detected for type: ${unwrappedType.name}`);
      return lines;
    }

    // Find the type definition in allTypes
    const typeDefinition = allTypes.find(t => t.name === unwrappedType.name);
    if (!typeDefinition) return lines;

    // Add this type to visited set
    visitedTypes.add(unwrappedType.name);

    // Handle different type kinds
    switch (typeDefinition.kind) {
      case 'OBJECT':
      case 'INTERFACE':
        if (typeDefinition.fields && typeDefinition.fields.length > 0) {
          for (const field of typeDefinition.fields) { // Show ALL fields - no limits!
            if (this.isScalarOrEnum(field.type, allTypes)) {
              // Simple field
              lines.push(`${indent}${field.name}`);
            } else {
              // Complex field - recurse
              lines.push(`${indent}${field.name} {`);
              const nestedFields = this.generateNestedFields(field.type, allTypes, maxDepth, currentDepth + 1, new Set(visitedTypes));
              lines.push(...nestedFields);
              lines.push(`${indent}}`);
            }
          }
        }
        break;
        
      case 'UNION':
        if (typeDefinition.possibleTypes) {
          for (const possibleType of typeDefinition.possibleTypes) { // Show ALL possible types!
            lines.push(`${indent}... on ${possibleType.name} {`);
            lines.push(`${indent}  __typename`);
            const nestedFields = this.generateNestedFields(possibleType, allTypes, maxDepth, currentDepth + 1, new Set(visitedTypes));
            lines.push(...nestedFields);
            lines.push(`${indent}}`);
          }
        }
        break;
        
      case 'ENUM':
      case 'SCALAR':
        // These are leaf types, no nested fields
        break;
    }

    // Remove from visited set to allow visiting in other branches
    visitedTypes.delete(unwrappedType.name);

    return lines;
  }

  private unwrapType(type: any): any {
    if (!type) return null;
    if (type.kind === 'NON_NULL' || type.kind === 'LIST') {
      return this.unwrapType(type.ofType);
    }
    return type;
  }

  private isScalarOrEnum(type: any, allTypes: any[]): boolean {
    const unwrapped = this.unwrapType(type);
    if (!unwrapped || !unwrapped.name) return true;
    
    const typeDefinition = allTypes.find(t => t.name === unwrapped.name);
    if (!typeDefinition) return true;
    
    return typeDefinition.kind === 'SCALAR' || typeDefinition.kind === 'ENUM';
  }

  // Execute GraphQL query against an endpoint
  async executeQuery(url: string, payload: { query: string; variables?: any; operationName?: string }): Promise<Result<any>> {
    try {
      this.sdk.console.log(`Executing GraphQL query against: ${url}`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        return {
          kind: 'Error',
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const result = await response.json();
      
      // Check for GraphQL errors
      if (result.errors && result.errors.length > 0) {
        const errorMessages = result.errors.map((err: any) => err.message).join(', ');
        return {
          kind: 'Error',
          error: `GraphQL Error: ${errorMessages}`,
        };
      }

      return {
        kind: 'Ok',
        value: result,
      };
    } catch (error) {
      this.sdk.console.error('Error executing GraphQL query:', error);
      return {
        kind: 'Error',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }
}
