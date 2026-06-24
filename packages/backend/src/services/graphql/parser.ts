import type {
  GraphQLSchema,
  IntrospectionField,
  IntrospectionSchema,
} from "shared";
import { formatType } from "shared";

import { generatePointsOfInterest } from "./analysis";

export function parseIntrospectionResult(
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
      ...parseField(field),
      rawIntrospectionData: field,
    }));
  }

  if (mutationType?.fields && Array.isArray(mutationType.fields)) {
    schema.mutations = mutationType.fields.map((field) => ({
      ...parseField(field),
      rawIntrospectionData: field,
    }));
  }

  if (subscriptionType?.fields && Array.isArray(subscriptionType.fields)) {
    schema.subscriptions = subscriptionType.fields.map((field) => ({
      ...parseField(field),
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
                ? type.fields.map(parseField)
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
              ? type.fields.map(parseField)
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
        if (!["String", "Int", "Float", "Boolean", "ID"].includes(type.name)) {
          schema.scalars.push({
            name: type.name,
            description: type.description,
          });
        }
        break;
    }
  }

  schema.pointsOfInterest = generatePointsOfInterest(schema);

  schema.allTypes = schemaData.types;

  return schema;
}

const parseField = (field: IntrospectionField) => ({
  name: field.name,
  description: field.description,
  args: Array.isArray(field.args)
    ? field.args.map((arg) => ({
        name: arg.name,
        type: formatType(arg.type),
        defaultValue: arg.defaultValue,
        rawType: arg.type,
      }))
    : [],
  type: formatType(field.type),
  rawType: field.type,
  rawField: field,
});
