<script setup lang="ts">
import { Attacks } from "@/components/attacks";

defineProps<{
  navigateTo?: (
    page: "Dashboard" | "Explorer" | "Voyager" | "Attacks" | "History",
  ) => void;
}>();
</script>

<template>
  <Attacks :navigate-to="navigateTo" />
</template>
