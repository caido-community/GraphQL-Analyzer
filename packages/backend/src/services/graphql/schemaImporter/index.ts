import type { Result, SchemaImportResult } from "shared";

import { parseIntrospectionResult } from "../parser";

import { detectSchemaFormat } from "./detection";
import { parseJsonContent } from "./jsonParser";

export function parseSchemaFromFileContent(
  content: string,
): Result<SchemaImportResult> {
  const jsonResult = parseJsonContent(content);
  if (jsonResult.kind === "Error") {
    return jsonResult;
  }

  const detection = detectSchemaFormat(jsonResult.value);

  if (detection.schema === undefined) {
    return {
      kind: "Error",
      error: detection.error ?? "Failed to detect schema format",
    };
  }

  try {
    const schema = parseIntrospectionResult(detection.schema);
    return {
      kind: "Ok",
      value: {
        schema,
        format: detection.format,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      kind: "Error",
      error: `Failed to parse introspection schema: ${message}`,
    };
  }
}
