<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

import { Attacks } from "@/components/attacks";
import { Navigation } from "@/components/common";
import { Dashboard } from "@/components/dashboard";
import { Docs } from "@/components/Docs";
import { Explorer } from "@/components/Explorer";
import { Voyager } from "@/components/Voyager";
import { useSDK } from "@/plugins/sdk";

type PageType = "Dashboard" | "Explorer" | "Voyager" | "Attacks" | "Docs";

const sdk = useSDK();
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

const checkPendingNavigation = async () => {
  try {
    const storage = sdk.storage.get() as
      | {
          "graphql-analyzer-navigate-to"?: string;
          "graphql-analyzer-navigate-timestamp"?: string;
        }
      | undefined;

    if (
      storage?.["graphql-analyzer-navigate-to"] !== undefined &&
      storage["graphql-analyzer-navigate-timestamp"] !== undefined
    ) {
      const now = Date.now();
      const parsedTimestamp = parseInt(
        storage["graphql-analyzer-navigate-timestamp"],
      );
      const shouldNavigate =
        !Number.isNaN(parsedTimestamp) && now - parsedTimestamp < 5000;

      if (shouldNavigate) {
        currentPage.value = storage["graphql-analyzer-navigate-to"] as PageType;
      }

      const updatedStorage = { ...storage };
      delete updatedStorage["graphql-analyzer-navigate-to"];
      delete updatedStorage["graphql-analyzer-navigate-timestamp"];
      await sdk.storage.set(updatedStorage as unknown as Record<string, never>);
    }
  } catch {
    // Ignore navigation errors
  }
};

const handleContextScan = (event: CustomEvent) => {
  const requestId = event.detail?.requestId;
  if (requestId !== undefined && requestId !== null) {
    if (currentPage.value !== "Dashboard") {
      currentPage.value = "Dashboard";
    }
    window.dispatchEvent(
      new CustomEvent("graphql-analyzer-context-scan-request", {
        detail: { requestId },
      }),
    );
  }
};

onMounted(async () => {
  await checkPendingNavigation();

  window.addEventListener(
    "graphql-analyzer-navigate",
    handleNavigationEvent as EventListener,
  );
  window.addEventListener(
    "graphql-analyzer-context-scan",
    handleContextScan as EventListener,
  );
  window.addEventListener("focus", checkPendingNavigation);
});

onUnmounted(() => {
  window.removeEventListener(
    "graphql-analyzer-navigate",
    handleNavigationEvent as EventListener,
  );
  window.removeEventListener(
    "graphql-analyzer-context-scan",
    handleContextScan as EventListener,
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
