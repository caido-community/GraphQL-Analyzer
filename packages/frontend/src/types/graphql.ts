// GraphQL-specific types for the frontend

export type GraphQLQueryType = "query" | "mutation" | "subscription";

export type GraphQLOperation = {
  name?: string;
  type: GraphQLQueryType;
  query: string;
  variables?: Record<string, unknown>;
};

export type GraphQLRequest = {
  id: string;
  operation: GraphQLOperation;
  endpoint: string;
  timestamp: Date;
};

export type GraphQLSchema = {
  types: GraphQLTypeInfo[];
  queries: GraphQLFieldInfo[];
  mutations: GraphQLFieldInfo[];
  subscriptions: GraphQLFieldInfo[];
};

export type GraphQLTypeInfo = {
  name: string;
  kind: "OBJECT" | "SCALAR" | "ENUM" | "INTERFACE" | "UNION" | "INPUT_OBJECT";
  description?: string;
  fields?: GraphQLFieldInfo[];
};

export type GraphQLFieldInfo = {
  name: string;
  type: string;
  description?: string;
  args?: GraphQLArgumentInfo[];
};

export type GraphQLArgumentInfo = {
  name: string;
  type: string;
  defaultValue?: unknown;
  description?: string;
};
