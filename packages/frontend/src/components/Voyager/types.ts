import type { ExplorerSession, GraphQLField } from "shared";

export type { ExplorerSession };

export type D3Node = {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  fields?: Array<{ name: string; type: string }>;
};

export type D3Link = {
  source: D3Node | number;
  target: D3Node | number | undefined;
  type: string;
  fieldName?: string;
  fromRoot?: boolean;
};

export type NavItem = {
  name: string;
  type: string;
  parent?: string;
  children?: NavItem[];
  fullSignature?: string;
  fieldData?: unknown;
};

export const LAYOUT = {
  ROOT_SPACING: 80,
  COLUMN_SPACING: 150,
  NODE_SPACING: 40,
  ENUM_SPACING: 40,
  MAX_HEIGHT_PER_COLUMN: 1400,
  MIN_WIDTH: 200,
  MAX_WIDTH: 950,
  MIN_HEIGHT: 80,
  HEADER_HEIGHT: 30,
  FIELD_HEIGHT: 18,
  PADDING: 20,
};

export function formatFieldSignature(field: GraphQLField): string {
  let signature = field.name;

  if (field.args.length > 0) {
    const argsStr = field.args
      .map((arg: { name: string; type: string }) => `${arg.name}: ${arg.type}`)
      .join(", ");
    signature += `(${argsStr})`;
  }

  if (field.type !== undefined) {
    signature += `: ${field.type}`;
  }

  return signature;
}

export function extractTypeName(typeString: string): string {
  if (typeString === "") return "";
  return typeString.replace(/[[\]!]/g, "");
}
