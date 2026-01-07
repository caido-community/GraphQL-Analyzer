<script setup lang="ts">
import * as d3 from "d3";
import Card from "primevue/card";
import type { GraphQLSchema } from "shared";
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";

import Header from "./Header.vue";
import Minimap from "./Minimap.vue";
import NavigationSidebar from "./NavigationSidebar.vue";
import SessionSelector from "./SessionSelector.vue";
import ZoomControls from "./ZoomControls.vue";
import type { D3Link, D3Node, ExplorerSession } from "./types";
import { useVoyagerHighlight } from "./useVoyagerHighlight";
import { useVoyagerMinimap } from "./useVoyagerMinimap";
import { useVoyagerNavigation } from "./useVoyagerNavigation";
import { useVoyagerSessions } from "./useSessions";
import { useVoyagerVisualization } from "./useVoyagerVisualization";
import { useVoyagerZoom } from "./useVoyagerZoom";

defineProps<{
  navigateTo?: (
    page: "Dashboard" | "Explorer" | "Voyager" | "Attacks" | "History",
  ) => void;
}>();

const voyagerContainer = ref<HTMLDivElement | undefined>(undefined);
const minimapSvg = ref<SVGSVGElement | undefined>(undefined);
const currentZoom = ref<d3.ZoomBehavior<SVGSVGElement, unknown> | undefined>(
  undefined,
);
const currentTransform = ref<d3.ZoomTransform>(d3.zoomIdentity);
const cachedD3Data = ref<{ nodes: D3Node[]; links: D3Link[] } | undefined>(
  undefined,
);
const currentSchema = ref<GraphQLSchema | undefined>(undefined);
const searchTerm = ref("");
const debouncedSearchTerm = ref("");
const searchDebounceTimer = ref<number | undefined>(undefined);
const isNavExpanded = ref(true);

const {
  sessions,
  selectedSessionId,
  selectedSession,
  introspectionSessions,
  loadSessions,
  selectSession,
  handleStorageChange,
} = useVoyagerSessions();

const {
  highlightedNodeId,
  updateNodeStyles,
  toggleNodeHighlight,
} = useVoyagerHighlight(voyagerContainer, cachedD3Data);

const { minimapViewBox, setupMinimapDrag } = useVoyagerMinimap(
  minimapSvg,
  voyagerContainer,
  currentZoom,
  currentTransform,
  cachedD3Data,
);

const { focusOnNode, zoomIn, zoomOut, resetZoom, fitToView } = useVoyagerZoom(
  voyagerContainer,
  currentZoom,
  currentTransform,
  cachedD3Data,
);

const {
  expandedSections,
  filteredItems,
  toggleSection,
  onNavItemClick,
} = useVoyagerNavigation(
  currentSchema,
  debouncedSearchTerm,
  cachedD3Data,
  focusOnNode,
);

const { parseSchemaToD3, loadVoyagerVisualization } = useVoyagerVisualization(
  voyagerContainer,
  currentZoom,
  currentTransform,
  highlightedNodeId,
  cachedD3Data,
  debouncedSearchTerm,
  updateNodeStyles,
  toggleNodeHighlight,
);

watch(searchTerm, (newValue: string) => {
  if (searchDebounceTimer.value !== undefined) {
    clearTimeout(searchDebounceTimer.value);
  }
  searchDebounceTimer.value = window.setTimeout(() => {
    debouncedSearchTerm.value = newValue;
  }, 300);
});

watch(debouncedSearchTerm, () => {
  if (selectedSession.value !== undefined && cachedD3Data.value !== undefined) {
    loadVoyagerVisualization();
  }
});

watch(
  [selectedSession, cachedD3Data, currentTransform],
  () => {
    nextTick(() => {
      setupMinimapDrag();
    });
  },
  { deep: true },
);

const handleSelectSession = async (sessionId: string) => {
  await selectSession(sessionId);

  const session = sessions.value.find(
    (s: ExplorerSession) => s.id === sessionId,
  );
  if (session?.schema !== undefined) {
    currentSchema.value = session.schema;
    cachedD3Data.value = parseSchemaToD3(session.schema);
    highlightedNodeId.value = undefined;
    await nextTick();
    loadVoyagerVisualization();
  }
};


const handleMinimapSvgReady = (svg: SVGSVGElement) => {
  minimapSvg.value = svg;
  nextTick(() => {
    setTimeout(() => {
      setupMinimapDrag();
    }, 50);
  });
};

onMounted(async () => {
  await loadSessions();

  window.addEventListener("storage", handleStorageChange);
  window.addEventListener(
    "graphql-analyzer-sessions-updated",
    handleStorageChange,
  );
});

onUnmounted(() => {
  window.removeEventListener("storage", handleStorageChange);
  window.removeEventListener(
    "graphql-analyzer-sessions-updated",
    handleStorageChange,
  );
});
</script>

<template>
  <div class="flex flex-col h-full gap-1 overflow-hidden">
    <Header :navigate-to="navigateTo" />

    <SessionSelector
      :sessions="introspectionSessions"
      :selected-session-id="selectedSessionId"
      @select="handleSelectSession"
    />

    <div class="flex-1 min-h-0">
      <Card
        class="h-full"
        :pt="{
          body: { class: 'h-full p-0' },
          content: { class: 'h-full flex flex-col' },
        }"
      >
        <template #content>
          <div
            v-if="introspectionSessions.length === 0"
            class="h-full flex items-center justify-center"
          >
            <div class="text-center text-surface-500">
              <i class="fas fa-project-diagram text-4xl mb-4"></i>
              <div class="text-lg mb-2">No Sessions Available</div>
              <div class="text-sm">
                <span v-if="sessions.length === 0"
                  >No sessions found. Go to Dashboard to scan a GraphQL
                  endpoint.</span
                >
                <span v-else
                  >No sessions with introspection support available for
                  viewing.</span
                >
              </div>
            </div>
          </div>
          <div
            v-else-if="selectedSession === undefined"
            class="h-full flex items-center justify-center"
          >
            <div class="text-center text-surface-500">
              <i class="fas fa-project-diagram text-4xl mb-4"></i>
              <div class="text-lg mb-2">Select a Session</div>
              <div class="text-sm">
                Choose a session above to view its interactive GraphQL schema
                graph.
              </div>
            </div>
          </div>

          <div v-else class="h-full flex">
            <NavigationSidebar
              :is-expanded="isNavExpanded"
              :search-term="searchTerm"
              :filtered-items="filteredItems"
              :expanded-sections="expandedSections"
              @update:search-term="searchTerm = $event"
              @update:is-expanded="isNavExpanded = $event"
              @item-click="onNavItemClick"
              @toggle-section="toggleSection"
            />

            <div class="flex-1 relative">
              <div
                ref="voyagerContainer"
                class="h-full w-full"
                style="background: hsl(var(--c-surface-800))"
              />

              <ZoomControls
                v-if="selectedSession !== undefined"
                @zoom-in="zoomIn"
                @zoom-out="zoomOut"
                @fit-to-view="fitToView"
                @reset-zoom="resetZoom"
              />

              <Minimap
                v-if="
                  selectedSession !== undefined && cachedD3Data !== undefined
                "
                :minimap-view-box="minimapViewBox"
                :current-transform="currentTransform"
                :cached-d3-data="cachedD3Data"
                @minimap-svg-ready="handleMinimapSvgReady"
              />
            </div>
          </div>
        </template>
      </Card>
    </div>
  </div>
</template>

<style scoped>
:deep(svg) {
  cursor: grab;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

:deep(svg:active) {
  cursor: grabbing;
}

:deep(.node) {
  transition: all 0.2s ease;
}

:deep(.link) {
  transition: opacity 0.2s ease;
}
</style>
