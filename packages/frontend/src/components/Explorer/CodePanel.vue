<script setup lang="ts">
import Button from "primevue/button";

import type { ExplorerSession } from "./useSessions";

import { CodeEditor } from "@/components/common";
import { useSDK } from "@/plugins/sdk";

const sdk = useSDK();

const props = defineProps<{
  selectedCode: string;
  selectedType: string;
  selectedLanguage: "json" | "javascript" | "graphql";
  selectedSession: ExplorerSession | undefined;
}>();

const emit = defineEmits<{
  copy: [];
  openInVoyager: [];
  sendToAttacker: [];
}>();

const copyToClipboard = async () => {
  if (props.selectedCode !== "") {
    try {
      await navigator.clipboard.writeText(props.selectedCode);
      sdk.window.showToast("Code copied to clipboard!", { variant: "success" });
      emit("copy");
    } catch (error) {
      sdk.window.showToast("Failed to copy to clipboard", { variant: "error" });
    }
  }
};

const openInVoyager = async () => {
  if (props.selectedSession !== undefined) {
    const currentStorage = (sdk.storage.get() as Record<string, unknown>) ?? {};
    currentStorage["voyager-auto-select-session"] = props.selectedSession.id;
    await sdk.storage.set(currentStorage as unknown as Record<string, never>);
    emit("openInVoyager");
  }
};

const sendToAttacker = async () => {
  if (props.selectedSession === undefined) return;

  const requestId =
    props.selectedSession?.requestId ??
    props.selectedSession?.url?.replace("request:", "");
  if (requestId === undefined || requestId === null || requestId === "") {
    sdk.window.showToast("No request ID available", { variant: "error" });
    return;
  }

  const currentStorage = (sdk.storage.get() as Record<string, unknown>) ?? {};
  currentStorage["graphql-analyzer-navigate-to"] = "Attacks";
  currentStorage["graphql-analyzer-navigate-timestamp"] = Date.now().toString();
  currentStorage["graphql-analyzer-context-attack-request-id"] = requestId;
  await sdk.storage.set(currentStorage as unknown as Record<string, never>);

  window.dispatchEvent(
    new CustomEvent("graphql-analyzer-navigate", {
      detail: { page: "Attacks" },
    }),
  );

  window.dispatchEvent(
    new CustomEvent("graphql-analyzer-context-attack", {
      detail: { requestId },
    }),
  );

  emit("sendToAttacker");
};
</script>

<template>
  <div class="h-full overflow-hidden pl-2 flex flex-col">
    <div v-if="selectedCode" class="h-full flex flex-col">
      <div class="flex justify-between items-center mb-3 pt-2">
        <div class="text-sm font-medium capitalize text-surface-200">
          {{ selectedType.replace("-", " ") }}
        </div>
        <div class="flex gap-2">
          <Button
            v-tooltip="'Send to Attacker'"
            icon="fas fa-shield-alt"
            size="small"
            text
            severity="danger"
            class="text-xs"
            @click="sendToAttacker"
          />
          <Button
            v-tooltip="'View in Voyager'"
            icon="fas fa-project-diagram"
            size="small"
            text
            severity="secondary"
            class="text-xs"
            @click="openInVoyager"
          />
          <Button
            v-tooltip="'Copy to clipboard'"
            icon="fas fa-copy"
            size="small"
            text
            severity="secondary"
            class="text-xs"
            @click="copyToClipboard"
          />
        </div>
      </div>
      <div class="flex-1 min-h-0">
        <CodeEditor
          :content="selectedCode"
          :language="selectedLanguage"
          :read-only="true"
        />
      </div>
    </div>
    <div v-else class="text-center text-surface-500 py-8">
      <i class="fas fa-mouse-pointer text-3xl mb-3"></i>
      <div>Select an item from the tree to view details</div>
    </div>
  </div>
</template>
