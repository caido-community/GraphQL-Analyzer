import type { Result } from "shared";

export function parseJsonContent(content: string): Result<unknown> {
  const trimmed = content.trim();

  if (trimmed === "") {
    return { kind: "Error", error: "File is empty" };
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    return { kind: "Ok", value: parsed };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      kind: "Error",
      error: `Invalid JSON: ${message}`,
    };
  }
}
