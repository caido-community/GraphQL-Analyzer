import { describe, expect, it } from "vitest";

import { parseJsonContent } from "./jsonParser";

describe("parseJsonContent", () => {
  it("parses valid JSON", () => {
    const result = parseJsonContent('{"key": "value"}');
    expect(result.kind).toBe("Ok");
    if (result.kind === "Ok") {
      expect(result.value).toEqual({ key: "value" });
    }
  });

  it("returns error for empty string", () => {
    const result = parseJsonContent("");
    expect(result.kind).toBe("Error");
    if (result.kind === "Error") {
      expect(result.error).toBe("File is empty");
    }
  });

  it("returns error for whitespace-only string", () => {
    const result = parseJsonContent("   \n\t  ");
    expect(result.kind).toBe("Error");
    if (result.kind === "Error") {
      expect(result.error).toBe("File is empty");
    }
  });

  it("returns error for invalid JSON", () => {
    const result = parseJsonContent("{ broken json }");
    expect(result.kind).toBe("Error");
    if (result.kind === "Error") {
      expect(result.error).toContain("Invalid JSON");
    }
  });
});
