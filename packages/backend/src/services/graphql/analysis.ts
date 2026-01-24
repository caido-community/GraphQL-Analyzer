import type { GraphQLSchema, PointOfInterest } from "shared";

export function generatePointsOfInterest(
  schema: GraphQLSchema,
): PointOfInterest[] {
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
