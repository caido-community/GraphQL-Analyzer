<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

import { Attacks } from "@/components/attacks";
import { Navigation } from "@/components/common";
import { Dashboard } from "@/components/dashboard";
import { Docs } from "@/components/Docs";
import { Explorer } from "@/components/Explorer";
import { Voyager } from "@/components/Voyager";

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
  if (targetPage !== undefined && targetPage !== null) {
    currentPage.value = targetPage as PageType;
  }
};

// Handle navigation events from context menus
const checkPendingNavigation = () => {
  const pendingNav = localStorage.getItem("graphql-analyzer-navigate-to");
  const navTimestamp = localStorage.getItem(
    "graphql-analyzer-navigate-timestamp",
  );

  if (pendingNav !== null && navTimestamp !== null) {
    const now = Date.now();
    const parsedTimestamp = parseInt(navTimestamp);
    const shouldNavigate =
      !Number.isNaN(parsedTimestamp) && now - parsedTimestamp < 2000;

    if (shouldNavigate) {
      currentPage.value = pendingNav as PageType;
    }

    localStorage.removeItem("graphql-analyzer-navigate-to");
    localStorage.removeItem("graphql-analyzer-navigate-timestamp");
  }
};

onMounted(() => {
  checkPendingNavigation();

  window.addEventListener(
    "graphql-analyzer-navigate",
    handleNavigationEvent as EventListener,
  );
  window.addEventListener("focus", checkPendingNavigation);
});

onUnmounted(() => {
  window.removeEventListener(
    "graphql-analyzer-navigate",
    handleNavigationEvent as EventListener,
  );
  window.removeEventListener("focus", checkPendingNavigation);
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
