// Result type for consistent error handling
export type Result<T> =
  | { kind: "Error"; error: string }
  | { kind: "Ok"; value: T };

// GraphQL Schema Types
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
  type: 'query' | 'mutation' | 'subscription' | 'type' | 'field';
  description?: string;
  reason: string;
  severity: 'high' | 'medium' | 'low';
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

// Attack Types
export type AttackType = "introspection" | "depth-limit" | "query-complexity" | "batch-query" | "field-suggestion";

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
  targetType?: 'session' | 'custom' | 'request';
  selectedRequestData?: any;
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