import type {
  GraphQLField,
  IntrospectionType,
  IntrospectionTypeRef,
} from "./index";

export const formatType = (type: IntrospectionTypeRef): string => {
  if (type.kind === "NON_NULL" && type.ofType) {
    return `${formatType(type.ofType)}!`;
  }
  if (type.kind === "LIST" && type.ofType) {
    return `[${formatType(type.ofType)}]`;
  }
  return type.name ?? "Unknown";
};

export function generateGraphQLQuery(
  field: GraphQLField & {
    rawType?: IntrospectionTypeRef;
    type?: IntrospectionTypeRef | string;
  },
  operationType: "query" | "mutation" | "subscription",
  allTypes: IntrospectionType[],
  maxDepth: number = 5,
): string {
  const capitalize = (str: string) =>
    str.charAt(0).toUpperCase() + str.slice(1);

  const args = formatFieldArguments(field.args ?? []);
  const queryArgs = formatQueryArguments(field.args ?? []);

  const typeName = getTypeName(field.rawType ?? field.type ?? "");
  const returnType =
    typeName !== undefined
      ? allTypes.find((t) => t.name === typeName)
      : undefined;
  const isLeaf = returnType?.kind === "SCALAR" || returnType?.kind === "ENUM";

  const lines: string[] = [
    `${operationType} ${capitalize(field.name)}${args} {`,
  ];

  if (isLeaf) {
    lines.push(`  ${field.name}${queryArgs}`);
  } else {
    const nestedFields = generateNestedFields(
      field.rawType ?? field.type,
      allTypes,
      maxDepth,
      2,
      new Set<string>(),
    );
    const selection =
      nestedFields.length > 0 ? nestedFields : ["    __typename"];
    lines.push(`  ${field.name}${queryArgs} {`);
    lines.push(...selection);
    lines.push("  }");
  }

  lines.push("}");

  return lines.join("\n");
}

function generateNestedFields(
  typeRef: IntrospectionTypeRef | string | undefined,
  allTypes: IntrospectionType[],
  maxDepth: number,
  currentDepth: number,
  visitedTypes: Set<string>,
): string[] {
  if (currentDepth > maxDepth || typeRef === undefined) return [];

  const typeName = getTypeName(typeRef);
  if (typeName === undefined) return [];

  if (visitedTypes.has(typeName)) return [];

  visitedTypes.add(typeName);

  const type = allTypes.find((t) => t.name === typeName);
  if (type === undefined || type.fields === undefined) return [];

  const lines: string[] = [];
  const indent = "  ".repeat(currentDepth);

  for (const field of type.fields) {
    if (field.isDeprecated === true) continue;

    if (field.args !== undefined && field.args.length > 0) {
      const requiredArgs = field.args.filter(
        (arg) => arg.type.kind === "NON_NULL",
      );
      if (requiredArgs.length > 0) continue;
    }

    const fieldTypeName = getTypeName(field.type);
    if (fieldTypeName === undefined) continue;
    const fieldType = allTypes.find((t) => t.name === fieldTypeName);

    if (fieldType?.kind === "SCALAR" || fieldType?.kind === "ENUM") {
      lines.push(`${indent}${field.name}`);
    } else if (currentDepth < maxDepth) {
      const nestedLines = generateNestedFields(
        field.type,
        allTypes,
        maxDepth,
        currentDepth + 1,
        new Set(visitedTypes),
      );
      if (nestedLines.length > 0) {
        lines.push(`${indent}${field.name} {`);
        lines.push(...nestedLines);
        lines.push(`${indent}}`);
      }
    }
  }

  return lines;
}

function getTypeName(type: IntrospectionTypeRef | string): string | undefined {
  if (typeof type === "string") {
    if (type !== "") return type;
    return undefined;
  }
  if (type.name !== undefined && type.name !== null) return type.name;
  if (type.ofType) return getTypeName(type.ofType);
  return undefined;
}

function formatFieldArguments(
  args: Array<{
    name: string;
    rawType?: IntrospectionTypeRef;
    type?: IntrospectionTypeRef | string;
  }>,
): string {
  if (args.length === 0) return "";

  const argStrings = args.map((arg) => {
    const type = arg.rawType
      ? formatType(arg.rawType)
      : typeof arg.type === "string"
        ? arg.type
        : arg.type
          ? formatType(arg.type)
          : "String";
    return `$${arg.name}: ${type}`;
  });

  return `(${argStrings.join(", ")})`;
}

function formatQueryArguments(args: Array<{ name: string }>): string {
  if (args.length === 0) return "";

  const argStrings = args.map((arg) => `${arg.name}: $${arg.name}`);
  return `(${argStrings.join(", ")})`;
}
