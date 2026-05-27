<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import type { ScreenplayElement, ScreenplayElementType } from "@transformers";

const props = defineProps<{
  element: ScreenplayElement;
  isSelected: boolean;
}>();

const emit = defineEmits<{
  (e: "select", id: string): void;
  (e: "update:text", payload: { id: string; text: string }): void;
  (e: "remove", id: string): void;
  (e: "insert-after", id: string): void;
}>();

const isEditing = ref(false);
const editText = ref(props.element.text);
const inputRef = ref<HTMLInputElement | null>(null);

// Keep editText in sync when element text changes externally
watch(
  () => props.element.text,
  (newText) => {
    if (!isEditing.value) editText.value = newText;
  },
);

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
  const labelMap: Record<ScreenplayElementType, string> = {
    "scene-heading": "SCENE",
    "scene-heading-sub": "SUB",
    "scene-transition": "TRANS",
    "dialog-character": "CHAR",
    dialog: "DLG",
    "dialog-parenthetical": "PAREN",
    action: "ACTION",
  };
  return labelMap[props.element.type] ?? "?";
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

/** Display text — dialog characters are uppercased like the viewer */
const displayText = computed(() => {
  if (props.element.type === "dialog-character" || props.element.type === "scene-heading" || props.element.type === "scene-heading-sub") {
    return props.element.text.toUpperCase();
  }
  if (props.element.type === "scene-transition") {
    return props.element.text.toUpperCase() + ":";
  }
  if (props.element.type === "dialog-parenthetical") {
    const t = props.element.text.trim();
    return t.startsWith("(") ? t.toLowerCase() : `(${t.toLowerCase()})`;
  }
  return props.element.text;
});

function handleClick() {
  emit("select", props.element.id);
}

function startEdit() {
  isEditing.value = true;
  editText.value = props.element.text;
  nextTick(() => inputRef.value?.focus());
}

function commitEdit() {
  isEditing.value = false;
  const trimmed = editText.value.trim();
  if (trimmed !== props.element.text) {
    emit("update:text", { id: props.element.id, text: trimmed });
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    commitEdit();
    emit("insert-after", props.element.id);
  }
  if (event.key === "Escape") {
    event.preventDefault();
    editText.value = props.element.text; // revert
    isEditing.value = false;
  }
  if (event.key === "Backspace" && editText.value === "") {
    event.preventDefault();
    isEditing.value = false;
    emit("remove", props.element.id);
  }
}

function handleOuterKeydown(event: KeyboardEvent) {
  if (isEditing.value) return;

  if (
    (event.key === "Backspace" || event.key === "Delete") &&
    props.isSelected
  ) {
    event.preventDefault();
    emit("remove", props.element.id);
  }
  if (event.key === "Enter" && props.isSelected) {
    event.preventDefault();
    startEdit();
  }
}
</script>

<template>
  <div
    :class="[
      'editor-element',
      { 'editor-element--selected': isSelected },
    ]"
    tabindex="0"
    @click.stop="handleClick"
    @dblclick.stop="startEdit"
    @keydown="handleOuterKeydown"
  >
    <!-- Type badge -->
    <v-chip
      :color="typeColor"
      size="x-small"
      variant="tonal"
      class="editor-element__badge"
      label
    >
      {{ typeLabel }}
    </v-chip>

    <!-- Content area -->
    <div :class="['editor-element__content', elementClass]">
      <template v-if="isEditing">
        <input
          ref="inputRef"
          v-model="editText"
          class="editor-element__edit-input"
          @blur="commitEdit"
          @keydown="handleKeydown"
          spellcheck="true"
        />
      </template>
      <template v-else>
        <span class="editor-element__display">{{ displayText }}</span>
      </template>
    </div>
  </div>
</template>

<style scoped>
.editor-element {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 12px;
  margin: 2px 0;
  border-radius: 8px;
  border: 1.5px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
  outline: none;
  position: relative;
}

.editor-element:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
  border-color: rgba(var(--v-theme-on-surface), 0.08);
}

.editor-element--selected {
  background: rgba(var(--v-theme-primary), 0.06);
  border-color: rgba(var(--v-theme-primary), 0.35);
  box-shadow: 0 0 0 1px rgba(var(--v-theme-primary), 0.1);
}

.editor-element--selected:hover {
  background: rgba(var(--v-theme-primary), 0.08);
}

.editor-element__badge {
  flex-shrink: 0;
  margin-top: 3px;
  font-family: "Fira Code", monospace;
  font-size: 10px !important;
  letter-spacing: 0.5px;
  min-width: 48px;
  justify-content: center;
}

.editor-element__content {
  flex: 1;
  font-family: Courier, "Courier New", monospace;
  font-size: var(--sd-font-size, 16px);
  line-height: 1.6;
  min-height: 1.6em;
}

/* Screenplay-style classes applied to content */
.editor-element__content.scene-heading {
  font-weight: 800;
}

.editor-element__content.scene-transition {
  text-align: right;
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
}

.editor-element__display {
  display: block;
  white-space: pre-wrap;
  word-break: break-word;
}

.editor-element__edit-input {
  width: 100%;
  border: none;
  outline: none;
  background: rgba(var(--v-theme-primary), 0.04);
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  font-weight: inherit;
  font-style: inherit;
  padding: 2px 6px;
  border-radius: 4px;
  border-bottom: 2px solid rgb(var(--v-theme-primary));
}
</style>
