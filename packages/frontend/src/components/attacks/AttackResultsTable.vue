<script setup lang="ts">
import Button from "primevue/button";
import Card from "primevue/card";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import type { AttackResult } from "shared";

type TableRow = {
  id: number;
  attackType: string;
  status: string;
  statusCode: number;
  contentLength: number;
  timing: number;
  findingsCount: number;
  highSeverityCount: number;
  statusIcon: string;
  severityLevel: string;
  rawResult: AttackResult;
};

defineProps<{
  tableData: TableRow[];
  selectedResult: AttackResult | undefined;
}>();

const emit = defineEmits<{
  "select-result": [result: AttackResult];
  "create-finding": [result: AttackResult];
  "send-to-replay": [result: AttackResult];
}>();

const getAttackTypeLabel = (attackType: string): string => {
  const labels: Record<string, string> = {
    introspection: "Schema Introspection",
    "depth-limit": "Query Depth Limit",
    "query-complexity": "Query Complexity",
    "batch-query": "Batch Query Limit",
    "field-suggestion": "Field Suggestion",
  };
  return labels[attackType] ?? attackType;
};

const getFindingSeverityClass = (findings: Array<{ severity: string }>) => {
  if (findings.some((f) => f.severity === "critical")) {
    return "bg-red-900 text-red-400";
  }
  if (findings.some((f) => f.severity === "high")) {
    return "bg-red-900 text-red-400";
  }
  if (findings.some((f) => f.severity === "medium")) {
    return "bg-yellow-900 text-yellow-400";
  }
  if (findings.some((f) => f.severity === "low")) {
    return "bg-blue-900 text-blue-400";
  }
  return "bg-gray-900 text-gray-400";
};
</script>

<template>
  <Card
    class="h-full"
    :pt="{
      body: { class: 'h-full p-0' },
      content: { class: 'h-full flex flex-col' },
    }"
  >
    <template #content>
      <div class="h-full flex flex-col">
        <div class="p-4 border-b border-surface-600">
          <h4 class="text-base font-semibold">Attack Results</h4>
        </div>

        <div class="flex-1 overflow-auto">
          <DataTable
            :value="tableData"
            selection-mode="single"
            :selection="selectedResult"
            class="w-full"
            :pt="{
              table: { class: 'text-sm w-full' },
              bodyRow: {
                class: 'cursor-pointer hover:bg-surface-700',
              },
            }"
            @row-select="emit('select-result', $event.data.rawResult)"
          >
            <Column field="id" header="ID" class="w-16 text-center">
              <template #body="{ data }">
                <span class="font-mono text-surface-200">{{ data.id }}</span>
              </template>
            </Column>

            <Column
              field="statusCode"
              header="Status Code"
              class="w-32 text-center"
            >
              <template #body="{ data }">
                <span
                  class="px-2 py-1 rounded text-xs font-medium"
                  :class="{
                    'bg-green-900 text-green-400': data.statusCode === 200,
                    'bg-red-900 text-red-400': data.statusCode >= 400,
                    'bg-yellow-900 text-yellow-400':
                      data.statusCode >= 300 && data.statusCode < 400,
                    'bg-gray-900 text-gray-400': data.statusCode === 0,
                  }"
                >
                  {{ data.statusCode || "-" }}
                </span>
              </template>
            </Column>

            <Column
              field="contentLength"
              header="Content Length"
              class="w-32 text-center"
            >
              <template #body="{ data }">
                <span class="font-mono text-surface-200">{{
                  data.contentLength || 0
                }}</span>
              </template>
            </Column>

            <Column field="attackType" header="Attack Type" class="flex-1">
              <template #body="{ data }">
                <span class="font-medium text-surface-100">{{
                  getAttackTypeLabel(data.attackType)
                }}</span>
              </template>
            </Column>

            <Column field="timing" header="Time (ms)" class="w-24 text-center">
              <template #body="{ data }">
                <span class="font-mono text-surface-200">{{
                  data.timing || 0
                }}</span>
              </template>
            </Column>

            <Column field="findings" header="Findings" class="w-20 text-center">
              <template #body="{ data }">
                <div class="flex items-center justify-center">
                  <span
                    v-if="data.rawResult.findings.length > 0"
                    class="px-2 py-1 rounded text-xs font-medium"
                    :class="getFindingSeverityClass(data.rawResult.findings)"
                  >
                    {{ data.rawResult.findings.length }}
                  </span>
                  <span v-else class="text-surface-500 text-xs">-</span>
                </div>
              </template>
            </Column>

            <Column field="status" header="State" class="w-24 text-center">
              <template #body="{ data }">
                <div class="flex items-center justify-center">
                  <span
                    class="px-2 py-1 rounded text-xs font-medium capitalize"
                    :class="{
                      'bg-green-900 text-green-400':
                        data.status === 'completed',
                      'bg-red-900 text-red-400': data.status === 'failed',
                      'bg-blue-900 text-blue-400': data.status === 'running',
                      'bg-gray-900 text-gray-400': data.status === 'cancelled',
                    }"
                  >
                    {{ data.status }}
                  </span>
                </div>
              </template>
            </Column>

            <Column header="Actions" class="w-24 text-center">
              <template #body="{ data }">
                <div class="flex items-center justify-center gap-1">
                  <Button
                    v-tooltip="
                      data.rawResult.findings.length > 0
                        ? 'Create Caido Finding'
                        : 'No findings to create'
                    "
                    :disabled="data.rawResult.findings.length === 0"
                    :severity="
                      data.rawResult.findings.length > 0
                        ? 'success'
                        : 'secondary'
                    "
                    icon="fas fa-plus"
                    size="small"
                    text
                    @click="emit('create-finding', data.rawResult)"
                  />

                  <Button
                    v-tooltip="'Send to Replay'"
                    severity="info"
                    icon="fas fa-sync"
                    size="small"
                    text
                    @click="emit('send-to-replay', data.rawResult)"
                  />
                </div>
              </template>
            </Column>
          </DataTable>
        </div>
      </div>
    </template>
  </Card>
</template>
