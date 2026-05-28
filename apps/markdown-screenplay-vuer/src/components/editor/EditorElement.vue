<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
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
  (
    e: "update:type",
    payload: { id: string; type: ScreenplayElementType },
  ): void;
  (e: "split", payload: { id: string; text1: string; text2: string }): void;
  (e: "merge-previous", id: string): void;
  (
    e: "navigate",
    payload: { id: string; direction: "up" | "down"; isShift: boolean },
  ): void;
  (e: "delete", id: string): void;
}>();

const editorRef = ref<HTMLDivElement | null>(null);

let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
let lastEmittedText = props.element.text;

function flushDebounce() {
  if (debounceTimeout) {
    clearTimeout(debounceTimeout);
    debounceTimeout = null;
    const text = editorRef.value?.innerText || "";
    lastEmittedText = text;
    emit("update:text", { id: props.element.id, text });
  }
}

onBeforeUnmount(() => {
  flushDebounce();
});

// Keep editor content in sync with store changes when not focused
watch(
  () => props.element.text,
  (newText) => {
    if (editorRef.value) {
      if (newText === lastEmittedText) return;
      lastEmittedText = newText;

      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
        debounceTimeout = null;
      }
      if (document.activeElement !== editorRef.value) {
        editorRef.value.innerText = newText;
      } else if (editorRef.value.innerText !== newText) {
        const caret = getCaretOffset(editorRef.value);
        editorRef.value.innerText = newText;
        setCursorOffset(editorRef.value, Math.min(caret, newText.length));
      }
    }
  },
);

watch(
  () => props.element.type,
  (newType, oldType) => {
    if (editorRef.value) {
      const isFocused = document.activeElement === editorRef.value;
      const oldText = editorRef.value.innerText;
      const newText = props.element.text;

      if (isFocused) {
        const oldOffset = getCaretOffset(editorRef.value);
        const isInto = newType === "dialog-parenthetical" && oldType !== "dialog-parenthetical";
        const isOut = oldType === "dialog-parenthetical" && newType !== "dialog-parenthetical";

        let newOffset = oldOffset;
        if (isInto) {
          if (!oldText.startsWith("(")) {
            newOffset += 1;
          }
        } else if (isOut) {
          if (oldText.startsWith("(")) {
            if (oldOffset > 0) {
              newOffset -= 1;
            }
          }
        }

        editorRef.value.innerText = newText;
        const clampedOffset = Math.max(0, Math.min(newOffset, newText.length));

        nextTick(() => {
          if (editorRef.value) {
            setCursorOffset(editorRef.value, clampedOffset);
          }
        });
      } else {
        editorRef.value.innerText = newText;
      }
    }
  },
);

onMounted(() => {
  if (editorRef.value) {
    editorRef.value.innerText = props.element.text;
  }
  lastEmittedText = props.element.text;
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

const typeOptions = [
  {
    value: "scene-heading" as ScreenplayElementType,
    label: "#",
    title: "Scene Heading",
    description: "Starts a new scene",
    color: "blue",
  },
  {
    value: "scene-heading-sub" as ScreenplayElementType,
    label: "##",
    title: "Secondary Heading",
    description: "Sub-heading or continuation",
    color: "blue-lighten-2",
  },
  {
    value: "action" as ScreenplayElementType,
    label: "ACT",
    title: "Action",
    description: "Narrative description of action or character movements",
    color: "grey",
  },
  {
    value: "dialog-character" as ScreenplayElementType,
    label: ">",
    title: "Character",
    description: "Name of the character speaking",
    color: "purple",
  },
  {
    value: "dialog-parenthetical" as ScreenplayElementType,
    label: "()",
    title: "Parenthetical",
    description: "Indicates delivery, attitude, or action",
    color: "teal-lighten-1",
  },
  {
    value: "dialog" as ScreenplayElementType,
    label: ">>",
    title: "Dialogue",
    description: "Lines of dialogue spoken by a character",
    color: "teal",
  },
  {
    value: "scene-transition" as ScreenplayElementType,
    label: ":",
    title: "Transition",
    description: "Scene transitions on the right",
    color: "orange",
  },
];

const displayTagLabel = computed(() => {
  if (props.isPlaceholder) return "new";
  const opt = typeOptions.find((o) => o.value === props.element.type);
  return opt ? opt.label : "ACT";
});

function selectType(type: ScreenplayElementType) {
  emit("update:type", { id: props.element.id, type });
  nextTick(() => {
    if (editorRef.value) {
      editorRef.value.focus();
    }
  });
}

function handleSelectTypeMenu(type: ScreenplayElementType) {
  if (props.isPlaceholder) {
    emit("update:type", { id: props.element.id, type });
    const isParenthetical = type === "dialog-parenthetical";
    const initialText = isParenthetical ? "()" : " ";
    lastEmittedText = initialText;
    emit("update:text", { id: props.element.id, text: initialText });
    emit("select", { id: props.element.id, isShift: false, isCtrl: false });
    nextTick(() => {
      if (editorRef.value) {
        editorRef.value.focus();
        setCursorOffset(editorRef.value, 1);
      }
    });
  } else {
    selectType(type);
  }
}

function handleRemoveElement() {
  emit("delete", props.element.id);
}

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

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);

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
  const text = target.innerText;
  
  let typeChanged = false;
  // Smart dialogue typing auto-convert to parenthetical if typing opens with a parenthesis
  if (props.element.type === "dialog" && text.startsWith("(")) {
    flushDebounce();
    emit("update:type", { id: props.element.id, type: "dialog-parenthetical" });
    typeChanged = true;
  } else if (
    props.element.type === "dialog-parenthetical" &&
    !text.startsWith("(")
  ) {
    flushDebounce();
    emit("update:type", { id: props.element.id, type: "dialog" });
    typeChanged = true;
  }

  if (!typeChanged) {
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }
    debounceTimeout = setTimeout(() => {
      debounceTimeout = null;
      lastEmittedText = text;
      emit("update:text", { id: props.element.id, text });
    }, 500);
  }
}

function handleKeydown(event: KeyboardEvent) {
  // Flush debounce on actions that change focus, modify structure, or trigger history
  const isCtrlOrMeta = event.ctrlKey || event.metaKey;
  const key = event.key?.toLowerCase();
  if (
    event.key === "Enter" ||
    event.key === "ArrowUp" ||
    event.key === "ArrowDown" ||
    event.key === "Backspace" ||
    event.key === "Delete" ||
    (isCtrlOrMeta && (key === "z" || key === "y"))
  ) {
    flushDebounce();
  }

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
        lastEmittedText = remainingText;
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
          lastEmittedText = "";
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
          const demotionMap: Record<
            ScreenplayElementType,
            ScreenplayElementType
          > = {
            "dialog-character": "action",
            "dialog-parenthetical": "dialog",
            dialog: "dialog-character",
            "scene-heading-sub": "scene-heading",
            "scene-heading": "action",
            "scene-transition": "action",
            action: "action",
          };
          const nextType = demotionMap[props.element.type] || "action";
          emit("update:type", { id: props.element.id, type: nextType });
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

function handleBlur() {
  flushDebounce();
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
    <!-- Tag Column -->
    <div class="editor-element__tag-col">
      <v-menu location="bottom start" transition="scale-transition">
        <template v-slot:activator="{ props: menuProps }">
          <button
            v-bind="menuProps"
            type="button"
            :class="[
              'editor-element__tag-btn',
              isPlaceholder
                ? 'editor-element__tag-btn--new'
                : `editor-element__tag-btn--${element.type}`,
            ]"
            @click.stop
          >
            {{ displayTagLabel }}
          </button>
        </template>
        <v-list class="editor-element__menu-list" elevation="8" rounded="lg">
          <!-- Element Type Options -->
          <v-list-item
            v-for="opt in typeOptions"
            :key="opt.value"
            @click="handleSelectTypeMenu(opt.value)"
            :active="!isPlaceholder && element.type === opt.value"
            color="primary"
            class="py-2"
          >
            <template v-slot:prepend>
              <v-chip
                size="x-small"
                :color="opt.color"
                label
                class="font-weight-bold mr-2"
              >
                {{ opt.label }}
              </v-chip>
            </template>
            <div class="d-flex flex-column">
              <span class="font-weight-bold text-body-2">{{ opt.title }}</span>
              <span
                class="text-caption text-medium-emphasis mt-0.5"
                style="white-space: normal; max-width: 280px; line-height: 1.2"
              >
                {{ opt.description }}
              </span>
            </div>
          </v-list-item>

          <!-- Divider & Remove Option (Only for non-placeholder elements) -->
          <template v-if="!isPlaceholder">
            <v-divider class="my-1" />
            <v-list-item @click="handleRemoveElement" class="py-2">
              <template v-slot:prepend>
                <v-chip size="x-small" color="error" label class="mr-2">
                  <v-icon size="x-small">mdi-delete-outline</v-icon>
                </v-chip>
              </template>
              <div class="d-flex flex-column">
                <span class="font-weight-bold text-body-2 text-error"
                  >Remove</span
                >
                <span
                  class="text-caption text-medium-emphasis mt-0.5"
                  style="
                    white-space: normal;
                    max-width: 280px;
                    line-height: 1.2;
                  "
                >
                  Delete this element from the screenplay
                </span>
              </div>
            </v-list-item>
          </template>
        </v-list>
      </v-menu>
    </div>

    <!-- Content area: Always editable -->
    <div
      ref="editorRef"
      contenteditable="true"
      :class="['editor-element__content', elementClass]"
      @input="handleInput"
      @keydown="handleKeydown"
      @focus="handleFocus"
      @blur="handleBlur"
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
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    opacity 0.15s ease;
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

.editor-element__tag-col {
  width: 60px;
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  margin-top: 4px;
  user-select: none;
}

.editor-element__tag-btn {
  font-family: "Fira Code", monospace;
  font-size: 10px;
  font-weight: 800;
  width: 44px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  border: 1px solid currentColor;
  background: transparent;
  cursor: pointer;
  outline: none;
  user-select: none;
  transition: all 0.15s ease;
  opacity: 0.4;
  line-height: 1;
  padding: 0;
}

.editor-element__tag-btn:hover,
.editor-element:hover .editor-element__tag-btn,
.editor-element:focus-within .editor-element__tag-btn {
  opacity: 1;
}

.editor-element__tag-btn--scene-heading {
  color: #2196f3;
}
.editor-element__tag-btn--scene-heading-sub {
  color: #64b5f6;
}
.editor-element__tag-btn--action {
  color: #757575;
}
.editor-element__tag-btn--dialog-character {
  color: #9c27b0;
}
.editor-element__tag-btn--dialog-parenthetical {
  color: #4db6ac;
}
.editor-element__tag-btn--dialog {
  color: #009688;
}
.editor-element__tag-btn--scene-transition {
  color: #ff9800;
}

.editor-element__tag-btn--new {
  color: #9e9e9e;
  border-style: dashed;
}

.editor-element__menu-list {
  max-width: 320px;
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
    gap: 6px;
    padding: 2px 4px;
  }

  .editor-element__tag-col {
    width: 44px;
  }

  .editor-element__tag-btn {
    width: 36px;
    font-size: 9px;
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
