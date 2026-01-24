# Backend Architecture

## Overview

The GraphQL Analyzer backend follows a layered architecture with clear separation of concerns:

```
┌──────────────────────────────────────┐
│             API Layer                │  ← External interface
├──────────────────────────────────────┤
│          Services Layer              │  ← Business logic
├──────────────────────────────────────┤
│     Models   │    Validation         │  ← Domain objects & schemas
└──────────────────────────────────────┘
```

## Directory Structure

```
packages/backend/src/
├── api/              # API handlers (thin layer)
│   ├── attacks.ts    # Attack execution APIs
│   └── graphql.ts    # GraphQL endpoint APIs
├── models/           # Domain models
│   └── AttackSession.ts  # Discriminated union state types
├── services/         # Business logic
│   ├── attacks/      # Attack modules
│   │   ├── AttackService.ts        # Main orchestrator
│   │   ├── IntrospectionAttack.ts  # Schema introspection
│   │   ├── DepthAttack.ts          # Query depth limits
│   │   ├── ComplexityAttack.ts     # Query complexity
│   │   ├── BatchAttack.ts          # Batch queries
│   │   ├── FieldSuggestionAttack.ts # Field suggestion disclosure
│   │   ├── headerUtils.ts          # Header utilities (SDK getHeaders)
│   │   ├── sessionManager.ts       # Attack session state
│   │   └── types.ts                # Shared attack types
│   └── graphql/
│       └── GraphQLService.ts       # GraphQL introspection service
├── validation/       # Zod schemas
│   └── schemas.ts    # JSON response validation
├── index.ts          # Main entry point
├── sdk.ts            # SDK singleton
└── types.ts          # Backend event types
```

## Key Design Patterns

### Discriminated Unions

Attack session states use discriminated unions for type safety:

```typescript
type AttackSessionState =
  | AttackSessionRunning // status: "running"
  | AttackSessionCompleted // status: "completed"
  | AttackSessionFailed // status: "failed"
  | AttackSessionCancelled; // status: "cancelled"
```

Benefits:

- No optional fields
- Type narrowing on status
- Cleaner state transitions

### Zod Validation

JSON responses are validated using Zod schemas instead of type casting:

```typescript
const parsed = parseGraphQLResponse(responseBody);
if (parsed.kind === "Ok" && parsed.value.data) {
  // Type-safe access to validated data
}
```

### SDK Headers API

Uses the SDK's `getHeaders()` method instead of manually parsing raw requests:

```typescript
const rawHeaders = result.request.getHeaders();
for (const [name, values] of Object.entries(rawHeaders)) {
  headers[name] = values[0] ?? "";
}
```

## Data Flow

```
1. API Request (index.ts)
   ↓
2. API Handler (api/attacks.ts)
   ↓
3. Attack Service (services/attacks/AttackService.ts)
   ↓
4. Individual Attack Module (e.g., IntrospectionAttack.ts)
   ↓
5. Response Validation (validation/schemas.ts)
   ↓
6. Result returned
```
