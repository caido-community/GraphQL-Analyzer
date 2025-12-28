import type { AttackType } from "shared";
import { ref } from "vue";

export function useAttackConfig() {
  const selectedAttacks = ref<AttackType[]>(["introspection"]);
  const maxDepth = ref(10);
  const batchSize = ref(5);
  const customHeaders = ref<Array<{ name: string; value: string }>>([]);
  const selectedRequestId = ref<string | undefined>(undefined);
  const useCustomUrl = ref(false);
  const customUrl = ref("");

  const availableAttacks = [
    {
      value: "introspection" as AttackType,
      label: "Schema Introspection",
      description: "Tests if schema introspection is enabled",
      severity: "Medium",
    },
    {
      value: "depth-limit" as AttackType,
      label: "Query Depth Limit",
      description: "Tests for query depth restrictions",
      severity: "High",
    },
    {
      value: "query-complexity" as AttackType,
      label: "Query Complexity",
      description: "Tests for query complexity analysis",
      severity: "High",
    },
    {
      value: "batch-query" as AttackType,
      label: "Batch Query Limit",
      description: "Tests batch query processing limits",
      severity: "Medium",
    },
    {
      value: "field-suggestion" as AttackType,
      label: "Field Suggestion",
      description: "Tests for information disclosure in errors",
      severity: "Low",
    },
  ];

  const addCustomHeader = () => {
    if (customHeaders.value.length < 10) {
      customHeaders.value.push({ name: "", value: "" });
    }
  };

  const removeCustomHeader = (index: number) => {
    customHeaders.value.splice(index, 1);
  };

  const toggleSelectAllAttacks = () => {
    if (selectedAttacks.value.length === availableAttacks.length) {
      selectedAttacks.value = [];
    } else {
      selectedAttacks.value = availableAttacks.map((a) => a.value);
    }
  };

  return {
    selectedAttacks,
    maxDepth,
    batchSize,
    customHeaders,
    selectedRequestId,
    useCustomUrl,
    customUrl,
    availableAttacks,
    addCustomHeader,
    removeCustomHeader,
    toggleSelectAllAttacks,
  };
}

