<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from "vue";
import type { ScreenplayElement, ScreenplayElementType } from "@transformers";

const props = defineProps<{
  element: ScreenplayElement;
  isSelected: boolean;
  isPlaceholder?: boolean;
}>();

const emit = defineEmits<{
  (
    e: "select",
    payload: { id: string; isShift: boolean; isCtrl: boolean },
  ): void;
  (e: "update:text", payload: { id: string; text: string }): void;
  (e: "update:type", payload: { id: string; type: ScreenplayElementType }): void;
  (e: "split", payload: { id: string; text1: string; text2: string }): void;
  (e: "merge-previous", id: string): void;
  (
    e: "navigate",
    payload: { id: string; direction: "up" | "down"; isShift: boolean },
  ): void;
}>();

const editorRef = ref<HTMLDivElement | null>(null);

// Keep editor content in sync with store changes when not focused
watch(
  () => props.element.text,
  (newText) => {
    if (editorRef.value && document.activeElement !== editorRef.value) {
      editorRef.value.innerText = newText;
    }
  },
);

onMounted(() => {
  if (editorRef.value) {
    editorRef.value.innerText = props.element.text;
  }
});

const elementClass = computed(() => {
  const classMap: Record<ScreenplayElementType, string> = {
    "scene-heading": "scene-heading",
    "scene-heading-sub": "scene-heading",
    "scene-transition": "scene-transition",
    "dialog-character": "dialog-heading",
    dialog: "dialog",
    "dialog-parenthetical": "dialog-parenthetical",
    action: "section",
  };
  return classMap[props.element.type] ?? "section";
});

const typeLabel = computed(() => {
  if (props.isPlaceholder) return "";
  const labelMap: Record<ScreenplayElementType, string> = {
    "scene-heading": "#",
    "scene-heading-sub": "##",
    "scene-transition": ":",
    "dialog-character": ">",
    dialog: ">>",
    "dialog-parenthetical": ">>",
    action: "",
  };
  return labelMap[props.element.type] ?? "";
});

const shouldShowBadge = computed(() => {
  return typeLabel.value !== "";
});

const typeColor = computed(() => {
  const colorMap: Record<ScreenplayElementType, string> = {
    "scene-heading": "blue-lighten-1",
    "scene-heading-sub": "blue-lighten-3",
    "scene-transition": "orange",
    "dialog-character": "purple-lighten-1",
    dialog: "teal",
    "dialog-parenthetical": "teal-lighten-2",
    action: "grey",
  };
  return colorMap[props.element.type] ?? "grey";
});

// Selection helpers for caret tracking
function getCaretOffset(element: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return 0;
  const range = selection.getRangeAt(0);
  
  let offset = 0;
  const node = range.startContainer;
  const targetOffset = range.startOffset;

  if (!element.contains(node) && element !== node) {
    return 0;
  }

  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null
  );

  while (walker.nextNode()) {
    const currentNode = walker.currentNode;
    if (currentNode === node) {
      offset += targetOffset;
      return offset;
    }
    offset += currentNode.textContent?.length || 0;
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    let childOffset = 0;
    for (let i = 0; i < targetOffset && i < node.childNodes.length; i++) {
      const child = node.childNodes[i];
      if (element.contains(child)) {
        childOffset += child.textContent?.length || 0;
      }
    }
    return childOffset;
  }

  return offset;
}

function isCaretAtStart(): boolean {
  if (!editorRef.value) return false;
  return getCaretOffset(editorRef.value) === 0;
}

function setCursorOffset(element: HTMLElement, offset: number) {
  const range = document.createRange();
  const selection = window.getSelection();
  if (!selection) return;

  let currentOffset = 0;
  let targetNode: Node | null = null;
  let relativeOffset = 0;

  function traverse(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length || 0;
      if (currentOffset + len >= offset) {
        targetNode = node;
        relativeOffset = offset - currentOffset;
        return true;
      }
      currentOffset += len;
    } else {
      for (let i = 0; i < node.childNodes.length; i++) {
        if (traverse(node.childNodes[i])) return true;
      }
    }
    return false;
  }

  traverse(element);

  if (targetNode) {
    range.setStart(targetNode, relativeOffset);
  } else {
    range.selectNodeContents(element);
  }
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function handleInput(e: Event) {
  const target = e.target as HTMLDivElement;
  let text = target.innerText;

  // Smart dialogue typing auto-convert to parenthetical if typing opens with a parenthesis
  if (props.element.type === "dialog" && text.startsWith("(")) {
    emit("update:type", { id: props.element.id, type: "dialog-parenthetical" });
  } else if (props.element.type === "dialog-parenthetical" && !text.startsWith("(")) {
    emit("update:type", { id: props.element.id, type: "dialog" });
  }

  emit("update:text", { id: props.element.id, text });
}

function handleKeydown(event: KeyboardEvent) {
  // 1. Enter key: split element
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    if (editorRef.value) {
      const offset = getCaretOffset(editorRef.value);
      
      const text = editorRef.value.innerText;
      const text1 = text.slice(0, offset);
      const text2 = text.slice(offset);
      
      // Update DOM and store immediately to prevent text retention in current element
      editorRef.value.innerText = text1;
      
      emit("split", { id: props.element.id, text1, text2 });
    }
  }

  // 2. Space key: check markdown prefix shortcuts
  if (event.key === " ") {
    if (editorRef.value) {
      const offset = getCaretOffset(editorRef.value);
      const text = editorRef.value.innerText;
      const prefix = text.slice(0, offset);
      const prefixes = ["##", "#", ">>", ">", ":"];
      
      if (prefixes.includes(prefix)) {
        event.preventDefault();
        const typeMap: Record<string, ScreenplayElementType> = {
          "##": "scene-heading-sub",
          "#": "scene-heading",
          ">>": "dialog",
          ">": "dialog-character",
          ":": "scene-transition",
        };
        const newType = typeMap[prefix];
        const remainingText = text.slice(offset);
        
        emit("update:type", { id: props.element.id, type: newType });
        
        editorRef.value.innerText = remainingText;
        emit("update:text", { id: props.element.id, text: remainingText });
        
        nextTick(() => {
          if (editorRef.value) {
            setCursorOffset(editorRef.value, 0);
          }
        });
        return;
      }
    }
  }

  // 3. Backspace/Delete key: remove type, delete, or merge with previous
  if (event.key === "Backspace" || event.key === "Delete") {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (!range.collapsed) {
        const selectedTextLength = range.toString().length;
        const elementTextLength = editorRef.value?.innerText.length || 0;
        if (selectedTextLength === elementTextLength) {
          // 1. Entire element is selected -> Delete element without merging text
          event.preventDefault();
          if (editorRef.value) {
            editorRef.value.innerText = "";
          }
          emit("update:text", { id: props.element.id, text: "" });
          emit("merge-previous", props.element.id);
          return;
        } else if (event.key === "Backspace" && isCaretAtStart()) {
          // 2. Part of the element is selected and Backspace pressed -> Delete selected text but don't merge
          return;
        }
      } else if (event.key === "Backspace" && isCaretAtStart()) {
        // 3. Only merge if no text is selected (caret is collapsed) on Backspace
        if (props.element.text === "" || props.element.type === "action") {
          event.preventDefault();
          emit("merge-previous", props.element.id);
        } else {
          event.preventDefault();
          emit("update:type", { id: props.element.id, type: "action" });
          nextTick(() => {
            if (editorRef.value) {
              setCursorOffset(editorRef.value, 0);
            }
          });
        }
      }
    }
  }

  // 4. Arrow keys: move focus between elements
  if (event.key === "ArrowUp") {
    if (isCaretAtStart()) {
      event.preventDefault();
      emit("navigate", {
        id: props.element.id,
        direction: "up",
        isShift: event.shiftKey,
      });
    }
  }
  if (event.key === "ArrowDown") {
    if (editorRef.value) {
      const offset = getCaretOffset(editorRef.value);
      const textLen = editorRef.value.innerText.length;
      if (offset === textLen) {
        event.preventDefault();
        emit("navigate", {
          id: props.element.id,
          direction: "down",
          isShift: event.shiftKey,
        });
      }
    }
  }
}

function handleClick(event: MouseEvent) {
  emit("select", {
    id: props.element.id,
    isShift: event.shiftKey,
    isCtrl: event.ctrlKey || event.metaKey,
  });
}

function handleFocus() {
  emit("select", {
    id: props.element.id,
    isShift: false,
    isCtrl: false,
  });
}
</script>

<template>
  <div
    :class="[
      'editor-element',
      { 'editor-element--selected': isSelected },
      { 'editor-element--placeholder': isPlaceholder },
    ]"
    :data-id="element.id"
    @click="handleClick"
  >
    <!-- Type badge (subtle indicator, only visible on hover or focus) -->
    <v-chip
      v-if="shouldShowBadge"
      :color="isPlaceholder ? 'grey-darken-1' : typeColor"
      size="x-small"
      variant="tonal"
      class="editor-element__badge"
      label
    >
      {{ typeLabel }}
    </v-chip>

    <!-- Content area: Always editable -->
    <div
      ref="editorRef"
      contenteditable="true"
      :class="['editor-element__content', elementClass]"
      @input="handleInput"
      @keydown="handleKeydown"
      @focus="handleFocus"
      spellcheck="true"
    ></div>
  </div>
</template>

<style scoped>
.editor-element {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 6px 12px;
  margin: 1px 0;
  border-radius: 6px;
  border: 1.5px solid transparent;
  cursor: text;
  transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
  position: relative;
}

.editor-element:hover {
  background: rgba(var(--v-theme-on-surface), 0.02);
}

.editor-element--placeholder {
  opacity: 0.35;
}

.editor-element--placeholder .editor-element__content,
.editor-element__content.scene-heading,
.editor-element__content.scene-transition,
.editor-element__content.dialog-heading {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
}

.editor-element--placeholder:hover,
.editor-element--placeholder:focus-within {
  opacity: 0.85;
}

.editor-element--selected {
  background: rgba(var(--v-theme-primary), 0.04) !important;
  border-color: rgba(var(--v-theme-primary), 0.15);
}

/* Badge starts transparent and animates in on hover or when element is focused within */
.editor-element__badge {
  flex-shrink: 0;
  margin-top: 4px;
  font-family: "Fira Code", monospace;
  font-size: 10px !important;
  letter-spacing: 0.2px;
  min-width: 28px;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s ease;
  user-select: none;
}

.editor-element:hover .editor-element__badge,
.editor-element:focus-within .editor-element__badge {
  opacity: 0.75;
}

.editor-element__content {
  flex: 1;
  font-family: Courier, "Courier New", monospace;
  font-size: var(--sd-font-size, 16px);
  line-height: 1.6;
  min-height: 1.6em;
  outline: none;
  border: none;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Screenplay-style alignment and transforms auto-baked in */
.editor-element__content.scene-heading {
  font-weight: 800;
  text-transform: uppercase;
}

.editor-element__content.scene-transition {
  text-align: right;
  text-transform: uppercase;
  font-weight: 800;
}

.editor-element__content.dialog {
  margin-left: var(--sd-dialog-padding, 5rem);
  margin-right: var(--sd-dialog-padding, 5rem);
}

.editor-element__content.dialog-parenthetical {
  margin-left: var(--sd-dialog-parenthetical-padding, 8rem);
  margin-right: var(--sd-dialog-parenthetical-padding, 8rem);
  font-style: italic;
}

.editor-element__content.dialog-heading {
  margin-left: var(--sd-dialog-heading-padding, 10rem);
  margin-right: var(--sd-dialog-heading-padding, 10rem);
  text-transform: uppercase;
  font-weight: 800;
}

/* Responsive padding and margin adjustments for smaller/mobile screens */
@media (max-width: 600px) {
  .editor-element {
    gap: 8px;
    padding: 2px 4px;
  }
  
  .editor-element__badge {
    margin-top: 2px;
  }

  .editor-element__content {
    font-size: 14px;
    margin-top: 2px !important;
    margin-bottom: 2px !important;
  }

  .editor-element__content.dialog {
    margin-left: 1.5rem;
    margin-right: 1.5rem;
  }

  .editor-element__content.dialog-parenthetical {
    margin-left: 2.2rem;
    margin-right: 2.2rem;
  }

  .editor-element__content.dialog-heading {
    margin-left: 2.8rem;
    margin-right: 2.8rem;
  }
}
</style>
