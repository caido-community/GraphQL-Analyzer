<script setup lang="ts">
import { Dashboard } from "@/components/dashboard";

defineProps<{
  navigateTo?: (
    page: "Dashboard" | "Explorer" | "Voyager" | "Attacks" | "History",
  ) => void;
}>();
</script>

<template>
  <Dashboard :navigate-to="navigateTo" />
</template>
