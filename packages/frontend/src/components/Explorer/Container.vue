<script setup lang="ts">
import Card from "primevue/card";
import Splitter from "primevue/splitter";
import SplitterPanel from "primevue/splitterpanel";
import { onMounted, ref } from "vue";

import CodePanel from "./CodePanel.vue";
import Header from "./Header.vue";
import TreePanel from "./TreePanel.vue";
import { useCodeFormatter } from "./useCodeFormatter";
import { useSessions } from "./useSessions";
import { useTreeData } from "./useTreeData";

import { SessionTab } from "@/components/dashboard";

const props = defineProps<{
  navigateTo?: (
    page: "Dashboard" | "Explorer" | "Voyager" | "Attacks" | "History",
  ) => void;
}>();

const {
  sessions,
  selectedSessionId,
  selectedSession,
  loadSessions,
  selectSession,
  deleteSession,
  renameSession,
  clearAllData,
} = useSessions();
const { getTreeData } = useTreeData(selectedSession);
const {
  selectedCode,
  selectedType,
  selectedLanguage,
  handleNodeSelect,
  clearCode,
} = useCodeFormatter(selectedSession);

type TreeNode = {
  key: string;
  label: string;
  icon?: string;
  data?: {
    type: string;
    content: unknown;
  };
  children?: TreeNode[];
};

const selectedNode = ref<TreeNode | undefined>(undefined);
const expandedKeys = ref<Record<string, boolean>>({});

const onNodeSelect = async (node: TreeNode) => {
  selectedNode.value = node;
  await handleNodeSelect(node);
};

const onNodeExpand = (node: TreeNode) => {
  if (node.key !== undefined) {
    expandedKeys.value[node.key] = true;
  }
};

const onNodeCollapse = (node: TreeNode) => {
  if (node.key !== undefined) {
    expandedKeys.value[node.key] = false;
  }
};

const handleSelectSession = async (sessionId: string) => {
  clearCode();
  selectedNode.value = undefined;
  expandedKeys.value = {};
  await selectSession(sessionId);
};

const handleClearAll = async () => {
  clearCode();
  selectedNode.value = undefined;
  expandedKeys.value = {};
  await clearAllData();
};

const handleOpenInVoyager = () => {
  if (props.navigateTo) {
    props.navigateTo("Voyager");
  }
};

const handleSendToAttacker = () => {
  if (props.navigateTo) {
    props.navigateTo("Attacks");
  }
};

const handleRenameSession = (sessionId: string, newName: string) => {
  renameSession(sessionId, newName);
};

onMounted(() => {
  loadSessions();
});
</script>

<template>
  <div class="flex flex-col h-full gap-1 overflow-hidden">
    <Header :on-clear-all="handleClearAll" />

    <Card
      v-if="sessions.length > 0"
      class="h-fit"
      :pt="{
        body: { class: 'h-fit p-0' },
        content: { class: 'h-fit flex flex-col' },
      }"
    >
      <template #content>
        <div class="flex gap-2 p-4 flex-wrap">
          <SessionTab
            v-for="session in sessions"
            :key="session.id"
            :is-selected="selectedSessionId === session.id"
            :label="session.title"
            :status="session.status"
            @select="handleSelectSession(session.id)"
            @rename="(newName) => handleRenameSession(session.id, newName)"
            @delete="deleteSession(session.id)"
          />
        </div>
      </template>
    </Card>

    <div v-if="selectedSession" class="flex-1 min-h-0">
      <Card
        class="h-full"
        :pt="{
          body: { class: 'h-full p-0' },
          content: { class: 'h-full flex flex-col' },
        }"
      >
        <template #content>
          <div class="h-full p-2">
            <Splitter class="h-full">
              <SplitterPanel :size="40" :min-size="20">
                <TreePanel
                  :tree-data="
                    selectedSession !== undefined &&
                    selectedSession.supportsIntrospection === true &&
                    selectedSession.schema !== undefined
                      ? getTreeData()
                      : []
                  "
                  :selected-node="selectedNode"
                  :expanded-keys="expandedKeys"
                  @node-select="onNodeSelect"
                  @node-expand="onNodeExpand"
                  @node-collapse="onNodeCollapse"
                />
              </SplitterPanel>

              <SplitterPanel :size="60" :min-size="30">
                <CodePanel
                  :selected-code="selectedCode"
                  :selected-type="selectedType"
                  :selected-language="selectedLanguage"
                  :selected-session="selectedSession"
                  @open-in-voyager="handleOpenInVoyager"
                  @send-to-attacker="handleSendToAttacker"
                />
              </SplitterPanel>
            </Splitter>
          </div>
        </template>
      </Card>
    </div>

    <div v-else class="flex-1 flex items-center justify-center">
      <div class="text-center text-surface-500">
        <i class="fas fa-search text-4xl mb-4"></i>
        <div class="text-lg mb-2">No GraphQL sessions found</div>
        <div>
          Go to the <strong>Dashboard</strong> tab to scan a GraphQL endpoint
        </div>
      </div>
    </div>
  </div>
</template>
