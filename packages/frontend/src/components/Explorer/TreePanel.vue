<script setup lang="ts">
import Tree from "primevue/tree";

defineProps<{
  treeData: any[];
  selectedNode: any;
  expandedKeys: Record<string, boolean>;
}>();

const emit = defineEmits<{
  nodeSelect: [node: any];
  nodeExpand: [node: any];
  nodeCollapse: [node: any];
}>();

const onNodeSelect = (node: any) => {
  emit("nodeSelect", node);
};

const onNodeExpand = (node: any) => {
  emit("nodeExpand", node);
};

const onNodeCollapse = (node: any) => {
  emit("nodeCollapse", node);
};
</script>

<template>
  <div class="h-full overflow-auto pr-2">
    <Tree
      v-if="treeData && treeData.length > 0"
      :value="treeData"
      selection-mode="single"
      :selection-keys="selectedNode ? { [selectedNode.key]: true } : {}"
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
