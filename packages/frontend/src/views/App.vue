<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";

import { Navigation } from "../components/common";

import Attacks from "./Attacks.vue";
import Dashboard from "./Dashboard.vue";
import Explorer from "./Explorer.vue";
import Docs from "./Docs.vue";
import Voyager from "./Voyager.vue";

type PageType = "Dashboard" | "Explorer" | "Voyager" | "Attacks" | "Docs";

const currentPage = ref<PageType>("Dashboard");

const component = computed(() => {
  switch (currentPage.value) {
    case "Dashboard":
      return Dashboard;
    case "Explorer":
      return Explorer;
    case "Voyager":
      return Voyager;
    case "Attacks":
      return Attacks;
    case "Docs":
      return Docs;
    default:
      return Dashboard;
  }
});

const handlePageChange = (page: PageType) => {
  currentPage.value = page;
};

const handleNavigationEvent = (event: CustomEvent) => {
  const targetPage = event.detail?.page;
  if (targetPage) {
    currentPage.value = targetPage as PageType;
  }
};

// Handle navigation events from context menus
const checkPendingNavigation = () => {
  const pendingNav = localStorage.getItem('graphql-analyzer-navigate-to');
  const navTimestamp = localStorage.getItem('graphql-analyzer-navigate-timestamp');
  
  if (pendingNav && navTimestamp) {
    const now = Date.now();
    const shouldNavigate = (now - parseInt(navTimestamp)) < 2000;
    
    if (shouldNavigate) {
      currentPage.value = pendingNav as PageType;
    }
    
    localStorage.removeItem('graphql-analyzer-navigate-to');
    localStorage.removeItem('graphql-analyzer-navigate-timestamp');
  }
};

onMounted(() => {
  checkPendingNavigation();
  
  window.addEventListener('graphql-analyzer-navigate', handleNavigationEvent as any);
  window.addEventListener('focus', checkPendingNavigation);
});

onUnmounted(() => {
  window.removeEventListener('graphql-analyzer-navigate', handleNavigationEvent as any);
  window.removeEventListener('focus', checkPendingNavigation);
});
</script>

<template>
  <div class="h-full flex flex-col gap-1">
    <Navigation :current-page="currentPage" @page-change="handlePageChange" />

    <div class="flex-1 min-h-0">
      <component :is="component" :navigate-to="handlePageChange" />
    </div>
  </div>
</template>

<style scoped>
#plugin--graphql-analyzer {
  height: 100%;
}
</style>
