<script setup lang="ts">
import { watch } from "vue";
import { useEditorStore } from "@/store/editorStore";
import EditorElement from "./EditorElement.vue";
import EditorHistoryControls from "./EditorHistoryControls.vue";
import type { ScreenplayElementType } from "@transformers";
import { focusElement } from "./caret";

const editorStore = useEditorStore();

// Enforce that the editor always has top and bottom empty action lines as placeholders
watch(
  () => editorStore.elements,
  () => {
    editorStore.ensurePlaceholders();
  },
  { deep: true, immediate: true },
);

// ── Focus/Caret Positioning Helper ──────────────────────────────

function restoreHistoryFocus() {
  const id = editorStore.selectedElementId;
  if (id) {
    focusElement(id, editorStore.caretOffset ?? "end");
  }
}

// ── Click Canvas to Focus ──────────────────────────────────────────

function handleCanvasClick(event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (target.classList.contains("editor-content") || target.classList.contains("editor-content__elements")) {
    event.preventDefault();
    editorStore.selectElement(null);
  }
}

// ── Element Coordination Handlers ────────────────────────────────

function handleSelect(payload: { id: string; isShift: boolean; isCtrl: boolean }) {
  editorStore.selectElement(payload.id, payload.isShift, payload.isCtrl);
}

function handleUpdateText(payload: { id: string; text: string }) {
  editorStore.updateElementText(payload.id, payload.text);
}

function handleUpdateType(payload: { id: string; type: ScreenplayElementType }) {
  editorStore.updateElementType(payload.id, payload.type);
}

function handleSplit(payload: { id: string; text1: string; text2: string }) {
  const newEl = editorStore.splitElement(payload.id, payload.text1, payload.text2);
  if (newEl) {
    focusElement(newEl.id, "start");
  }
}

function handleMergePrevious(id: string) {
  const result = editorStore.mergeWithPrevious(id);
  if (result) {
    focusElement(result.mergedId, result.cursorOffset);
  }
}

function handleNavigate(payload: { id: string; direction: "up" | "down"; isShift: boolean }) {
  const idx = editorStore.elements.findIndex((e) => e.id === payload.id);
  if (idx < 0) return;

  if (payload.direction === "up" && idx > 0) {
    const targetEl = editorStore.elements[idx - 1];
    editorStore.selectElement(targetEl.id, payload.isShift);
    focusElement(targetEl.id, "end");
  } else if (payload.direction === "down" && idx < editorStore.elements.length - 1) {
    const targetEl = editorStore.elements[idx + 1];
    editorStore.selectElement(targetEl.id, payload.isShift);
    focusElement(targetEl.id, "start");
  }
}

// ── Global Actions ───────────────────────────────────────────────

function handleContainerKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    editorStore.selectElement(null);
  }

  // Handle deletion of multiple selected elements
  if (
    (event.key === "Backspace" || event.key === "Delete") &&
    editorStore.selectedElementIds.length > 1
  ) {
    event.preventDefault();
    const nextFocusId = editorStore.deleteSelectedElements();
    if (nextFocusId) {
      focusElement(nextFocusId, "end");
    }
    return;
  }

  // Handle undo / redo keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y)
  const isCtrlOrMeta = event.ctrlKey || event.metaKey;
  if (isCtrlOrMeta) {
    const key = event.key?.toLowerCase();
    if (key === "z") {
      event.preventDefault();
      if (event.shiftKey) {
        editorStore.redo();
      } else {
        editorStore.undo();
      }
      restoreHistoryFocus();
    } else if (key === "y") {
      event.preventDefault();
      editorStore.redo();
      restoreHistoryFocus();
    }
  }
}

function handleDelete(id: string) {
  const idx = editorStore.elements.findIndex((e) => e.id === id);
  editorStore.removeElement(id);
  
  if (editorStore.elements.length > 0) {
    const nextFocusIdx = Math.max(0, Math.min(idx - 1, editorStore.elements.length - 1));
    const targetId = editorStore.elements[nextFocusIdx].id;
    focusElement(targetId, "end");
  }
}

function handleInsertAbove(id: string) {
  const newEl = editorStore.insertElementBefore(id, "action", "");
  if (newEl) {
    focusElement(newEl.id, "start");
  }
}

function handleUndo() {
  editorStore.undo();
  restoreHistoryFocus();
}

function handleRedo() {
  editorStore.redo();
  restoreHistoryFocus();
}
</script>

<template>
  <div
    class="editor-content"
    @keydown="handleContainerKeydown"
    @mousedown="handleCanvasClick"
  >
    <!-- Element list -->
    <div class="editor-content__elements editor-content__canvas">
      <EditorElement
        v-for="(element, index) in editorStore.elements"
        :key="element.id"
        :element="element"
        :is-selected="editorStore.selectedElementIds.includes(element.id)"
        :is-placeholder="index === editorStore.elements.length - 1"
        @select="handleSelect"
        @update:text="handleUpdateText"
        @update:type="handleUpdateType"
        @split="handleSplit"
        @merge-previous="handleMergePrevious"
        @navigate="handleNavigate"
        @delete="handleDelete"
        @insert-above="handleInsertAbove"
      />
    </div>

    <!-- Floating screen-pinned Undo/Redo controls component -->
    <EditorHistoryControls
      @undo="handleUndo"
      @redo="handleRedo"
    />
  </div>
</template>

<style scoped>
.editor-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 0;
  cursor: text;
  background: transparent;
}

.editor-content__elements {
  flex: 1;
  padding-bottom: 120px; /* Comfortable bottom scrolling margin */
  margin: 0 auto;
  max-width: 800px;
  width: 100%;
}

.editor-content__canvas {
  font-family: Courier, "Courier New", monospace;
  font-size: var(--sd-font-size, 18px);
  padding: 16px;
  box-sizing: border-box;
}

@media (max-width: 600px) {
  .editor-content__canvas {
    padding: 4px;
  }
  .editor-content__elements {
    padding-bottom: 60px;
  }
}
</style>
