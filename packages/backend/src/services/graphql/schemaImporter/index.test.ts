import { describe, expect, it } from "vitest";

import { minimalIntrospectionSchema } from "./fixtures/minimalSchema";

import { parseSchemaFromFileContent } from "./index";

describe("parseSchemaFromFileContent", () => {
  it("parses wrapped introspection JSON", () => {
    const content = JSON.stringify({
      data: { __schema: minimalIntrospectionSchema },
    });
    const result = parseSchemaFromFileContent(content);
    expect(result.kind).toBe("Ok");
    if (result.kind === "Ok") {
      expect(result.value.format).toBe("introspection-wrapped");
      expect(result.value.schema.queries).toHaveLength(2);
      expect(result.value.schema.mutations).toHaveLength(1);
    }
  });

  it("parses unwrapped introspection JSON", () => {
    const content = JSON.stringify({
      __schema: minimalIntrospectionSchema,
    });
    const result = parseSchemaFromFileContent(content);
    expect(result.kind).toBe("Ok");
    if (result.kind === "Ok") {
      expect(result.value.format).toBe("introspection-unwrapped");
      expect(result.value.schema.queries).toHaveLength(2);
    }
  });

  it("parses direct schema object JSON", () => {
    const content = JSON.stringify(minimalIntrospectionSchema);
    const result = parseSchemaFromFileContent(content);
    expect(result.kind).toBe("Ok");
    if (result.kind === "Ok") {
      expect(result.value.format).toBe("introspection-direct");
      expect(result.value.schema.queries).toHaveLength(2);
    }
  });

  it("returns error for empty content", () => {
    const result = parseSchemaFromFileContent("");
    expect(result.kind).toBe("Error");
  });

  it("returns error for invalid JSON", () => {
    const result = parseSchemaFromFileContent("not json at all");
    expect(result.kind).toBe("Error");
    if (result.kind === "Error") {
      expect(result.error).toContain("Invalid JSON");
    }
  });

  it("returns error for valid JSON that is not a schema", () => {
    const result = parseSchemaFromFileContent('{"users": [1, 2, 3]}');
    expect(result.kind).toBe("Error");
  });

  it("correctly populates schema types", () => {
    const content = JSON.stringify({
      data: { __schema: minimalIntrospectionSchema },
    });
    const result = parseSchemaFromFileContent(content);
    expect(result.kind).toBe("Ok");
    if (result.kind === "Ok") {
      const schema = result.value.schema;

      // Queries
      expect(schema.queries.map((q) => q.name)).toEqual(["user", "users"]);

      // Mutations
      expect(schema.mutations.map((m) => m.name)).toEqual(["createUser"]);

      // Subscriptions (none in fixture)
      expect(schema.subscriptions).toHaveLength(0);

      // Custom types (User only, not Query/Mutation/internal)
      expect(schema.types.map((t) => t.name)).toContain("User");
      expect(schema.types.map((t) => t.name)).not.toContain("Query");
      expect(schema.types.map((t) => t.name)).not.toContain("__Schema");

      // Enums
      expect(schema.enums.map((e) => e.name)).toContain("Role");
      expect(
        schema.enums.find((e) => e.name === "Role")?.values.map((v) => v.name),
      ).toEqual(["ADMIN", "USER"]);

      // Interfaces
      expect(schema.interfaces.map((i) => i.name)).toContain("Node");
    }
  });

  it("generates points of interest for sensitive fields", () => {
    const content = JSON.stringify({
      data: { __schema: minimalIntrospectionSchema },
    });
    const result = parseSchemaFromFileContent(content);
    expect(result.kind).toBe("Ok");
    if (result.kind === "Ok") {
      expect(result.value.schema.pointsOfInterest).toBeDefined();
      expect(Array.isArray(result.value.schema.pointsOfInterest)).toBe(true);
    }
  });

  it("parses field arguments correctly", () => {
    const content = JSON.stringify({
      data: { __schema: minimalIntrospectionSchema },
    });
    const result = parseSchemaFromFileContent(content);
    expect(result.kind).toBe("Ok");
    if (result.kind === "Ok") {
      const userQuery = result.value.schema.queries.find(
        (q) => q.name === "user",
      );
      expect(userQuery).toBeDefined();
      expect(userQuery?.args).toHaveLength(1);
      expect(userQuery?.args[0]?.name).toBe("id");
      expect(userQuery?.args[0]?.type).toBe("ID!");
    }
  });

  it("formats type references correctly", () => {
    const content = JSON.stringify({
      data: { __schema: minimalIntrospectionSchema },
    });
    const result = parseSchemaFromFileContent(content);
    expect(result.kind).toBe("Ok");
    if (result.kind === "Ok") {
      const usersQuery = result.value.schema.queries.find(
        (q) => q.name === "users",
      );
      expect(usersQuery?.type).toBe("[User]");

      const userQuery = result.value.schema.queries.find(
        (q) => q.name === "user",
      );
      expect(userQuery?.type).toBe("User");
    }
  });
});
