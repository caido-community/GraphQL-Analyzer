import type { IntrospectionSchema } from "shared";

export type SchemaFormat =
  | "introspection-wrapped"
  | "introspection-unwrapped"
  | "introspection-direct"
  | "unknown";

export interface DetectionResult {
  format: SchemaFormat;
  schema: IntrospectionSchema | undefined;
  error: string | undefined;
}

export function detectSchemaFormat(data: unknown): DetectionResult {
  if (data === undefined || data === null || typeof data !== "object") {
    return {
      format: "unknown",
      schema: undefined,
      error: "Input is not a valid object",
    };
  }

  const obj = data as Record<string, unknown>;

  if (isWrappedIntrospection(obj)) {
    const dataObj = obj.data as Record<string, unknown>;
    const schema = dataObj.__schema as IntrospectionSchema;
    return { format: "introspection-wrapped", schema, error: undefined };
  }

  if (isUnwrappedIntrospection(obj)) {
    const schema = obj.__schema as IntrospectionSchema;
    return { format: "introspection-unwrapped", schema, error: undefined };
  }
  if (isDirectSchemaObject(obj)) {
    const schema = obj as unknown as IntrospectionSchema;
    return { format: "introspection-direct", schema, error: undefined };
  }

  return {
    format: "unknown",
    schema: undefined,
    error:
      "JSON does not match any known GraphQL introspection format. " +
      'Expected one of: { "data": { "__schema": ... } }, ' +
      '{ "__schema": ... }, or a direct schema object with "queryType" and "types".',
  };
}

function isWrappedIntrospection(obj: Record<string, unknown>): boolean {
  if (
    obj.data === undefined ||
    obj.data === null ||
    typeof obj.data !== "object"
  ) {
    return false;
  }
  const dataObj = obj.data as Record<string, unknown>;
  return hasSchemaShape(dataObj.__schema);
}

function isUnwrappedIntrospection(obj: Record<string, unknown>): boolean {
  return hasSchemaShape(obj.__schema);
}

function isDirectSchemaObject(obj: Record<string, unknown>): boolean {
  return Array.isArray(obj.types) && obj.types.length > 0;
}

function hasSchemaShape(value: unknown): boolean {
  if (value === undefined || value === null || typeof value !== "object") {
    return false;
  }
  const schema = value as Record<string, unknown>;
  return Array.isArray(schema.types);
}
