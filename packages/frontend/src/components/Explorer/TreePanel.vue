<script setup lang="ts">
import Tree from "primevue/tree";

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

defineProps<{
  treeData: TreeNode[];
  selectedNode: TreeNode | undefined;
  expandedKeys: Record<string, boolean>;
}>();

const emit = defineEmits<{
  nodeSelect: [node: TreeNode];
  nodeExpand: [node: TreeNode];
  nodeCollapse: [node: TreeNode];
}>();

const onNodeSelect = (node: TreeNode) => {
  emit("nodeSelect", node);
};

const onNodeExpand = (node: TreeNode) => {
  emit("nodeExpand", node);
};

const onNodeCollapse = (node: TreeNode) => {
  emit("nodeCollapse", node);
};
</script>

<template>
  <div class="h-full overflow-auto pr-2">
    <Tree
      v-if="treeData && treeData.length > 0"
      :value="treeData"
      selection-mode="single"
      :selection-keys="
        selectedNode !== undefined && selectedNode.key !== undefined
          ? { [selectedNode.key]: true }
          : {}
      "
      :expanded-keys="expandedKeys"
      class="w-full"
      @node-select="onNodeSelect"
      @node-expand="onNodeExpand"
      @node-collapse="onNodeCollapse"
    />
    <div v-else class="text-center text-surface-500 py-8">
      <i class="fas fa-exclamation-triangle text-3xl mb-3"></i>
      <div>No introspection support</div>
    </div>
  </div>
</template>
