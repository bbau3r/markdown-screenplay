<script setup lang="ts">
import { useEditorStore } from "@/store/editorStore";

const editorStore = useEditorStore();

const emit = defineEmits<{
  (e: "undo"): void;
  (e: "redo"): void;
}>();
</script>

<template>
  <div class="editor-history-controls">
    <v-btn
      icon
      variant="text"
      size="small"
      class="editor-history-controls__btn"
      :disabled="editorStore.undoStack.length === 0"
      @click="emit('undo')"
      title="Undo (Ctrl+Z)"
    >
      <v-icon size="20">mdi-undo</v-icon>
    </v-btn>
    <v-btn
      icon
      variant="text"
      size="small"
      class="editor-history-controls__btn"
      :disabled="editorStore.redoStack.length === 0"
      @click="emit('redo')"
      title="Redo (Ctrl+Y)"
    >
      <v-icon size="20">mdi-redo</v-icon>
    </v-btn>
  </div>
</template>

<style scoped>
.editor-history-controls {
  position: fixed;
  bottom: 16px;
  right: 16px;
  display: flex;
  gap: 8px;
  z-index: 2000;
  pointer-events: none;
  padding: 0;
}

@media (max-width: 600px) {
  .editor-history-controls {
    bottom: 4px;
    right: 4px;
    gap: 4px;
  }
}

.editor-history-controls__btn {
  pointer-events: auto;
  color: rgba(var(--v-theme-on-surface), 0.6);
  transition: transform 0.15s ease, color 0.15s ease;
  background: transparent !important;
  box-shadow: none !important;
}

.editor-history-controls__btn :deep(.v-icon) {
  filter: drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.25));
}

.editor-history-controls__btn:hover:not(:disabled) {
  color: rgb(var(--v-theme-primary)) !important;
  transform: translateY(-1px);
}

.editor-history-controls__btn:active:not(:disabled) {
  transform: translateY(0);
}

.editor-history-controls__btn:disabled {
  opacity: 0.3;
}
</style>
