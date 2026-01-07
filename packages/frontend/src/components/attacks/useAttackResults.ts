import type { AttackResult } from "shared";
import { computed, ref } from "vue";

export function useAttackResults() {
  const attackResults = ref<AttackResult[]>([]);
  const selectedResult = ref<AttackResult | undefined>(undefined);

  const attackResultsTableData = computed(() => {
    const deduplicatedResults: AttackResult[] = [];
    const seen = new Set<string>();

    for (const result of attackResults.value) {
      const dedupeKey = `${result.attackType}-${result.targetUrl}`;

      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        deduplicatedResults.push(result);
      } else {
        const existingResult = deduplicatedResults.find(
          (r) =>
            r.attackType === result.attackType &&
            r.targetUrl === result.targetUrl,
        );

        if (existingResult) {
          const findingsSet = new Set<string>();
          const mergedFindings = [...existingResult.findings];

          existingResult.findings.forEach((finding) => {
            findingsSet.add(`${finding.title}-${finding.severity}`);
          });

          result.findings.forEach((finding) => {
            const findingKey = `${finding.title}-${finding.severity}`;
            if (!findingsSet.has(findingKey)) {
              findingsSet.add(findingKey);
              mergedFindings.push(finding);
            }
          });

          existingResult.findings = mergedFindings;
          if (
            result.response?.timing !== undefined &&
            existingResult.response !== undefined
          ) {
            existingResult.response.timing = result.response.timing;
          }
        }
      }
    }

    return deduplicatedResults.map((result, index) => ({
      id: index + 1,
      attackType: result.attackType,
      status: result.status,
      statusCode: result.response?.statusCode ?? 0,
      contentLength: result.response?.body?.length ?? 0,
      timing: result.response?.timing ?? 0,
      findingsCount: result.findings.length,
      highSeverityCount: result.findings.filter(
        (f) => f.severity === "critical" || f.severity === "high",
      ).length,
      statusIcon: getStatusIcon(result.status),
      severityLevel: getMaxSeverity(result.findings),
      rawResult: result,
    }));
  });

  const selectResult = (result: AttackResult) => {
    selectedResult.value = result;
  };

  const clearResults = () => {
    attackResults.value = [];
    selectedResult.value = undefined;
  };

  const setResults = (results: AttackResult[]) => {
    attackResults.value = results;
  };

  return {
    attackResults,
    selectedResult,
    attackResultsTableData,
    selectResult,
    clearResults,
    setResults,
  };
}

function getStatusIcon(status: string): string {
  switch (status) {
    case "completed":
      return "fas fa-check-circle";
    case "failed":
      return "fas fa-times-circle";
    case "running":
      return "fas fa-spinner fa-spin";
    case "cancelled":
      return "fas fa-ban";
    default:
      return "fas fa-question-circle";
  }
}

function getMaxSeverity(
  findings: Array<{ severity: string }>,
): "critical" | "high" | "medium" | "low" | "info" {
  if (findings.some((f) => f.severity === "critical")) return "critical";
  if (findings.some((f) => f.severity === "high")) return "high";
  if (findings.some((f) => f.severity === "medium")) return "medium";
  if (findings.some((f) => f.severity === "low")) return "low";
  return "info";
}
