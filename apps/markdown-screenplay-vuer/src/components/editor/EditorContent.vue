<script setup lang="ts">
import { watch, ref, onMounted, onBeforeUnmount } from "vue";
import { useEditorStore } from "@/store/editorStore";
import EditorElement from "./EditorElement.vue";
import EditorHistoryControls from "./EditorHistoryControls.vue";
import { serializeToMdsp, type ScreenplayElementType } from "@transformers";
import { focusElement, getCaretOffsetOfNode } from "./caret";

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

function resolveSelectionPosition(
  node: Node | null,
  offset: number,
  isStart: boolean
): { id: string; offset: number } | null {
  if (!node) return null;

  // Case 1: The node is the elements container itself
  if (
    node.nodeType === Node.ELEMENT_NODE &&
    (node as HTMLElement).classList.contains("editor-content__elements")
  ) {
    const childNodes = node.childNodes;
    let targetChild: Node | null = null;
    if (isStart) {
      if (offset >= 0 && offset < childNodes.length) {
        targetChild = childNodes[offset];
      }
    } else {
      if (offset > 0 && offset <= childNodes.length) {
        targetChild = childNodes[offset - 1];
      }
    }

    if (targetChild && targetChild.nodeType === Node.ELEMENT_NODE) {
      const el = targetChild as HTMLElement;
      const id = el.getAttribute("data-id");
      if (id) {
        const contentEl = el.querySelector(
          ".editor-element__content"
        ) as HTMLElement;
        const textLength = contentEl?.innerText.length ?? 0;
        return {
          id,
          offset: isStart ? 0 : textLength,
        };
      }
    }
  }

  // Case 2: Find the closest .editor-element
  let element: HTMLElement | null = null;
  if (node.nodeType === Node.ELEMENT_NODE) {
    element = (node as HTMLElement).closest(".editor-element");
  } else if (node.parentElement) {
    element = node.parentElement.closest(".editor-element");
  }

  if (!element) return null;
  const id = element.getAttribute("data-id");
  if (!id) return null;

  const contentEl = element.querySelector(
    ".editor-element__content"
  ) as HTMLElement;
  if (!contentEl) return null;

  // Case 2a: Inside the content area
  if (contentEl.contains(node) || contentEl === node) {
    return {
      id,
      offset: getCaretOffsetOfNode(node, offset, contentEl),
    };
  }

  // Case 2b: In tag-col or other parts of .editor-element wrapper
  const textLength = contentEl.innerText.length;
  return {
    id,
    offset: isStart ? 0 : textLength,
  };
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
  const actualShift = payload.isShift || isShiftPressed.value;
  editorStore.selectElement(payload.id, actualShift, payload.isCtrl);
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

  // Handle cross-block text selection edits (Backspace, Delete, or typing)
  const selection = window.getSelection();
  if (selection && !selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    const start = resolveSelectionPosition(range.startContainer, range.startOffset, true);
    const end = resolveSelectionPosition(range.endContainer, range.endOffset, false);

    if (start && end && start.id !== end.id) {
      // If it's Backspace or Delete
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        editorStore.deleteTextRange(start.id, start.offset, end.id, end.offset);
        return;
      }

      // If it's Enter (or Shift+Enter) on cross-block selection
      if (event.key === "Enter") {
        event.preventDefault();
        editorStore.deleteTextRange(start.id, start.offset, end.id, end.offset);
        const activeEl = editorStore.elements.find((e) => e.id === start.id);
        if (activeEl) {
          const text1 = activeEl.text.slice(0, start.offset);
          const text2 = activeEl.text.slice(start.offset);
          const newEl = editorStore.splitElement(start.id, text1, text2);
          if (newEl) {
            focusElement(newEl.id, "start");
          }
        }
        return;
      }

      // If it is a character typing key (printable character, excluding shortcuts like Ctrl+C etc.)
      const isPrintable = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
      if (isPrintable) {
        event.preventDefault();
        editorStore.deleteTextRange(start.id, start.offset, end.id, end.offset);
        editorStore.insertTextAt(start.id, start.offset, event.key);
        return;
      }
    }
  }

  // Handle deletion of selected elements when focus is not in the content div
  if (
    (event.key === "Backspace" || event.key === "Delete") &&
    editorStore.selectedElementIds.length > 0 &&
    (!document.activeElement || !document.activeElement.classList.contains("editor-element__content"))
  ) {
    event.preventDefault();
    const nextFocusId = editorStore.deleteSelectedElements();
    if (nextFocusId) {
      focusElement(nextFocusId, "end");
    }
    return;
  }

  // Handle Enter when focus is not in the content div
  if (
    event.key === "Enter" &&
    editorStore.selectedElementId &&
    (!document.activeElement || !document.activeElement.classList.contains("editor-element__content"))
  ) {
    event.preventDefault();
    const activeId = editorStore.selectedElementId;
    const newEl = editorStore.insertElementAfter(activeId, "action", "");
    if (newEl) {
      focusElement(newEl.id, "start");
    }
    return;
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

  // Safeguard: Prevent default browser Enter/Shift+Enter behavior inside the container
  // to avoid duplication of .editor-element__content divs.
  if (event.key === "Enter") {
    event.preventDefault();
  }
}

function handleFocusIn(event: FocusEvent) {
  const target = event.target as HTMLElement;
  if (
    target &&
    !target.closest(".editor-element__content") &&
    !target.closest(".editor-element__tag-col") &&
    !target.closest(".editor-history-controls")
  ) {
    const activeId = editorStore.selectedElementId;
    if (activeId) {
      focusElement(activeId, "end");
    } else if (editorStore.elements.length > 0) {
      const lastId = editorStore.elements[editorStore.elements.length - 1].id;
      focusElement(lastId, "end");
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

// ── Selection Drag & Modifiers Tracking ─────────────────────────────
const isShiftPressed = ref(false);
const isDragging = ref(false);
const dragStartId = ref<string | null>(null);

function handleGlobalKeydown(e: KeyboardEvent) {
  if (e.key === "Shift") {
    isShiftPressed.value = true;
  }
}

function handleGlobalKeyup(e: KeyboardEvent) {
  if (e.key === "Shift") {
    isShiftPressed.value = false;
  }
}

function handleDragStart(id: string) {
  isDragging.value = true;
  dragStartId.value = id;
  editorStore.selectElement(id);
}

function handleDragEnter(id: string) {
  if (!isDragging.value || !dragStartId.value) return;
  const idx1 = editorStore.elements.findIndex((e) => e.id === dragStartId.value);
  const idx2 = editorStore.elements.findIndex((e) => e.id === id);
  if (idx1 >= 0 && idx2 >= 0) {
    const start = Math.min(idx1, idx2);
    const end = Math.max(idx1, idx2);
    editorStore.selectedElementIds = editorStore.elements.slice(start, end + 1).map((e) => e.id);
  }
}

function handleGlobalMouseup() {
  if (isDragging.value) {
    isDragging.value = false;
    dragStartId.value = null;
  }
}

// ── Global Copy/Cut/Paste Handlers ──────────────────────────────────
function handleGlobalCopy(event: ClipboardEvent) {
  if (editorStore.selectedElementIds.length > 1) {
    event.preventDefault();
    const selectedEls = editorStore.elements.filter((e) =>
      editorStore.selectedElementIds.includes(e.id)
    );
    const text = serializeToMdsp(selectedEls);
    event.clipboardData?.setData("text/plain", text);
  }
}

function handleGlobalCut(event: ClipboardEvent) {
  if (editorStore.selectedElementIds.length > 1) {
    handleGlobalCopy(event);
    const nextFocusId = editorStore.deleteSelectedElements();
    if (nextFocusId) {
      focusElement(nextFocusId, "end");
    }
    return;
  }

  // If cross-block text selection is active
  const selection = window.getSelection();
  if (selection && !selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    const start = resolveSelectionPosition(range.startContainer, range.startOffset, true);
    const end = resolveSelectionPosition(range.endContainer, range.endOffset, false);

    if (start && end && start.id !== end.id) {
      event.preventDefault();
      const text = selection.toString();
      event.clipboardData?.setData("text/plain", text);
      editorStore.deleteTextRange(start.id, start.offset, end.id, end.offset);
    }
  }
}

function handleGlobalPaste(event: ClipboardEvent) {
  event.preventDefault();
  const text = event.clipboardData?.getData("text/plain") || "";

  // If there's a cross-block text selection, delete it first
  const selection = window.getSelection();
  if (selection && !selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    const start = resolveSelectionPosition(range.startContainer, range.startOffset, true);
    const end = resolveSelectionPosition(range.endContainer, range.endOffset, false);

    if (start && end && start.id !== end.id) {
      editorStore.deleteTextRange(start.id, start.offset, end.id, end.offset);
    }
  }

  const focusId = editorStore.handlePaste(text);
  if (focusId) {
    focusElement(focusId, editorStore.caretOffset ?? "end");
  }
}

onMounted(() => {
  window.addEventListener("mouseup", handleGlobalMouseup);
  window.addEventListener("keydown", handleGlobalKeydown);
  window.addEventListener("keyup", handleGlobalKeyup);
});

onBeforeUnmount(() => {
  window.removeEventListener("mouseup", handleGlobalMouseup);
  window.removeEventListener("keydown", handleGlobalKeydown);
  window.removeEventListener("keyup", handleGlobalKeyup);
});

</script>

<template>
  <div
    class="editor-content"
    @keydown="handleContainerKeydown"
    @mousedown="handleCanvasClick"
    @focusin="handleFocusIn"
    @copy="handleGlobalCopy"
    @cut="handleGlobalCut"
    @paste="handleGlobalPaste"
  >
    <!-- Element list -->
    <div
      class="editor-content__elements editor-content__canvas"
      contenteditable="true"
    >
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
        @drag-start="handleDragStart"
        @drag-enter="handleDragEnter"
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

.editor-content__elements:focus {
  outline: none;
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
