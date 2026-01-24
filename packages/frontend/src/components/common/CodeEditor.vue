<script setup lang="ts">
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { lineNumbers } from "@codemirror/view";
import { EditorView } from "codemirror";
import { onMounted, onUnmounted, ref, watch } from "vue";

const props = defineProps<{
  content: string;
  language?: "json" | "javascript" | "graphql";
  readOnly?: boolean;
  fontSize?: number;
}>();

const emit = defineEmits<{
  "update:content": [content: string];
}>();

const editorRef = ref<HTMLDivElement>();
const editorView = ref<EditorView>();
const isInternalUpdate = ref(false);

const getLanguageExtension = () => {
  switch (props.language) {
    case "json":
      return json();
    case "javascript":
    case "graphql":
      return javascript();
    default:
      return javascript();
  }
};

const createEditor = () => {
  if (editorRef.value === undefined) return;

  if (editorView.value !== undefined) {
    editorView.value.destroy();
  }

  const extensions = [
    getLanguageExtension(),
    oneDark,
    lineNumbers(),
    EditorView.theme({
      "&": {
        fontSize: `${props.fontSize ?? 14}px`,
        height: "100%",
        fontFamily:
          "'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, 'Liberation Mono', Menlo, Courier, monospace",
      },
      ".cm-content": {
        padding: "16px",
        minHeight: "100%",
        lineHeight: "1.5",
      },
      ".cm-focused": {
        outline: "none",
      },
      ".cm-editor": {
        height: "100%",
      },
      ".cm-scroller": {
        scrollbarWidth: "thin",
      },
      ".cm-scrollbar-hidden": {
        display: "none",
      },
      ".cm-lineNumbers": {
        color: "#6b7280",
        fontSize: "12px",
      },
      ".cm-gutters": {
        backgroundColor: "transparent",
        borderRight: "1px solid #374151",
      },
      ".cm-search": {
        backgroundColor: "#1f2937",
        border: "1px solid #374151",
        borderRadius: "6px",
        padding: "8px",
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
      },
      ".cm-search input": {
        backgroundColor: "#111827",
        border: "1px solid #374151",
        borderRadius: "4px",
        color: "#f9fafb",
        padding: "4px 8px",
        fontSize: "14px",
      },
      ".cm-search input:focus": {
        outline: "none",
        borderColor: "#6366f1",
        boxShadow: "0 0 0 2px rgba(99, 102, 241, 0.2)",
      },
      ".cm-search button": {
        backgroundColor: "#374151",
        border: "1px solid #4b5563",
        borderRadius: "4px",
        color: "#f9fafb",
        padding: "4px 8px",
        fontSize: "12px",
        marginLeft: "4px",
      },
      ".cm-search button:hover": {
        backgroundColor: "#4b5563",
      },
      ".cm-search label": {
        color: "#d1d5db",
        fontSize: "12px",
      },
    }),
    EditorView.editable.of(!props.readOnly),
    EditorView.lineWrapping,
  ];

  if (!props.readOnly) {
    extensions.push(
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !isInternalUpdate.value) {
          emit("update:content", update.state.doc.toString());
        }
      }),
    );
  }

  const state = EditorState.create({
    doc: props.content,
    extensions,
  });

  editorView.value = new EditorView({
    state,
    parent: editorRef.value,
  });
};

watch(
  () => props.language,
  () => {
    createEditor();
  },
);

watch(
  () => props.content,
  (newContent) => {
    if (editorView.value === undefined) return;

    const currentContent = editorView.value.state.doc.toString();
    if (currentContent !== newContent) {
      isInternalUpdate.value = true;
      try {
        editorView.value.dispatch({
          changes: {
            from: 0,
            to: editorView.value.state.doc.length,
            insert: newContent,
          },
        });
      } catch (error) {
        console.error("CodeEditor update error:", error);

        createEditor();
      }
      isInternalUpdate.value = false;
    }
  },
);

onMounted(() => {
  createEditor();
});

onUnmounted(() => {
  if (editorView.value !== undefined) {
    editorView.value.destroy();
  }
});
</script>

<template>
  <div
    ref="editorRef"
    class="w-full h-full overflow-hidden border border-surface-600 rounded"
  />
</template>
