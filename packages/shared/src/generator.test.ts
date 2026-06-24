import { describe, expect, it } from "vitest";

import { generateGraphQLQuery } from "./generator";

import type { IntrospectionType } from "./index";

describe("generateGraphQLQuery", () => {
  it("omits the selection set for a scalar field", () => {
    const allTypes: IntrospectionType[] = [{ kind: "SCALAR", name: "String" }];
    const query = generateGraphQLQuery(
      {
        name: "ping",
        args: [],
        type: "String",
        rawType: { kind: "SCALAR", name: "String" },
      },
      "query",
      allTypes,
    );

    expect(query).toContain("ping");
    expect(query).not.toContain("ping {");
  });

  it("selects scalar subfields of an object field", () => {
    const allTypes: IntrospectionType[] = [
      {
        kind: "OBJECT",
        name: "User",
        fields: [
          { name: "id", args: [], type: { kind: "SCALAR", name: "ID" } },
        ],
      },
      { kind: "SCALAR", name: "ID" },
    ];
    const query = generateGraphQLQuery(
      {
        name: "me",
        args: [],
        type: "User",
        rawType: { kind: "OBJECT", name: "User" },
      },
      "query",
      allTypes,
    );

    expect(query).toContain("me {");
    expect(query).toContain("id");
  });

  it("falls back to __typename when nested objects yield no fields", () => {
    const allTypes: IntrospectionType[] = [
      {
        kind: "OBJECT",
        name: "BillingAdminQuery",
        fields: [
          {
            name: "routerEntitlement",
            args: [],
            type: { kind: "OBJECT", name: "RouterEntitlement" },
          },
        ],
      },
      { kind: "OBJECT", name: "RouterEntitlement", fields: [] },
    ];
    const query = generateGraphQLQuery(
      {
        name: "billingAdmin",
        args: [],
        type: "BillingAdminQuery",
        rawType: { kind: "OBJECT", name: "BillingAdminQuery" },
      },
      "query",
      allTypes,
    );

    expect(query).toContain("billingAdmin {");
    expect(query).toContain("__typename");
    expect(query).not.toMatch(/billingAdmin \{\s*\}/);
  });

  it("falls back to __typename when an object has no selectable fields", () => {
    const allTypes: IntrospectionType[] = [
      { kind: "OBJECT", name: "Empty", fields: [] },
    ];
    const query = generateGraphQLQuery(
      {
        name: "empty",
        args: [],
        type: "Empty",
        rawType: { kind: "OBJECT", name: "Empty" },
      },
      "query",
      allTypes,
    );

    expect(query).toContain("empty {");
    expect(query).toContain("__typename");
  });
});
