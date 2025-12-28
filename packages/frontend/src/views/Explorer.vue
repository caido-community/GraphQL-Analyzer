<script setup lang="ts">
import { Explorer } from "@/components/Explorer";

defineProps<{
  navigateTo?: (
    page: "Dashboard" | "Explorer" | "Voyager" | "Attacks" | "History",
  ) => void;
}>();
</script>

<template>
  <Explorer :navigate-to="navigateTo" />
</template>
