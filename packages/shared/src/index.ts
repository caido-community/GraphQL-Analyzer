export type Result<T> =
  | { kind: "Error"; error: string }
  | { kind: "Ok"; value: T };

export type GraphQLSchema = {
  queries: GraphQLField[];
  mutations: GraphQLField[];
  subscriptions: GraphQLField[];
  types: GraphQLType[];
  enums: GraphQLEnum[];
  interfaces: GraphQLInterface[];
  unions: GraphQLUnion[];
  scalars: GraphQLScalar[];
  pointsOfInterest: PointOfInterest[];
  allTypes?: IntrospectionType[];
};

export type GraphQLEnum = {
  name: string;
  description?: string;
  values: GraphQLEnumValue[];
};

export type GraphQLEnumValue = {
  name: string;
  description?: string;
  isDeprecated: boolean;
  deprecationReason?: string;
};

export type GraphQLInterface = {
  name: string;
  description?: string;
  fields: GraphQLField[];
  possibleTypes: string[];
};

export type GraphQLUnion = {
  name: string;
  description?: string;
  possibleTypes: string[];
};

export type GraphQLScalar = {
  name: string;
  description?: string;
};

export type PointOfInterest = {
  name: string;
  type: "query" | "mutation" | "subscription" | "type" | "field";
  description?: string;
  reason: string;
  severity: "high" | "medium" | "low";
};

export type GraphQLField = {
  name: string;
  description?: string;
  args: GraphQLArg[];
  type: string;
};

export type GraphQLArg = {
  name: string;
  type: string;
  defaultValue?: string;
};

export type GraphQLType = {
  name: string;
  kind: string;
  description?: string;
  fields?: GraphQLField[];
};

export type IntrospectionType = {
  kind: string;
  name?: string;
  description?: string;
  fields?: IntrospectionField[];
  inputFields?: IntrospectionInputValue[];
  interfaces?: IntrospectionTypeRef[];
  enumValues?: IntrospectionEnumValue[];
  possibleTypes?: IntrospectionTypeRef[];
  ofType?: IntrospectionTypeRef;
};

export type IntrospectionField = {
  name: string;
  description?: string;
  args: IntrospectionInputValue[];
  type: IntrospectionTypeRef;
  isDeprecated?: boolean;
  deprecationReason?: string;
};

export type IntrospectionInputValue = {
  name: string;
  description?: string;
  type: IntrospectionTypeRef;
  defaultValue?: string;
};

export type IntrospectionTypeRef = {
  kind: string;
  name?: string;
  ofType?: IntrospectionTypeRef;
};

export type IntrospectionEnumValue = {
  name: string;
  description?: string;
  isDeprecated?: boolean;
  deprecationReason?: string;
};

export type IntrospectionSchema = {
  queryType?: { name: string };
  mutationType?: { name: string };
  subscriptionType?: { name: string };
  types: IntrospectionType[];
};

export type AttackType =
  | "introspection"
  | "depth-limit"
  | "query-complexity"
  | "batch-query"
  | "field-suggestion";

export type AttackResult = {
  id: string;
  attackType: AttackType;
  targetUrl: string;
  payload: string;
  sentAt: Date;
  response?: {
    statusCode: number;
    body: string;
    headers: Record<string, string[]>;
    timing: number;
  };
  rawRequest?: string;
  rawResponse?: string;
  requestId?: string;
  findings: AttackFinding[];
  status: "running" | "completed" | "failed" | "cancelled";
  error?: string;
  requestsExecuted?: number;
  totalRequests?: number;
};

export type AttackFinding = {
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  evidence?: string;
  recommendation?: string;
};

export type AttackConfig = {
  targetUrl: string;
  sessionId?: string;
  attackTypes: AttackType[];
  maxDepth?: number;
  maxComplexity?: number;
  batchSize?: number;
  customHeaders?: Record<string, string>;
  originalHeaders?: Record<string, string>;
  useOriginalHeaders?: boolean;
  targetType?: "session" | "custom" | "request";
  selectedRequestData?: Record<string, unknown>;
  requestId?: string;
};

export type AttackSession = {
  id: string;
  title: string;
  targetUrl: string;
  config: AttackConfig;
  results: AttackResult[];
  createdAt: Date;
  completedAt?: Date;
  status: "running" | "completed" | "failed" | "cancelled" | "pending";
  totalFindings: number;
  criticalFindings: number;
};

export type DashboardActivity = {
  id: string;
  title: string;
  url: string;
  description?: string;
  createdAt: Date;
  status: string;
  type: string;
  attackSessionId?: string;
};

export type ExplorerSession = {
  id: string;
  title: string;
  url: string;
  schema?: GraphQLSchema;
  supportsIntrospection: boolean;
  createdAt: Date;
  status: string;
  requestId?: string;
  sourceType?: string;
};

export type SchemaImportResult = {
  schema: GraphQLSchema;
  format: string;
};

export const INTROSPECTION_QUERY = `
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
  }
`;
