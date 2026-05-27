<script setup lang="ts">
import { ref, nextTick } from "vue";
import type { ScreenplayElementType } from "@transformers";

const props = defineProps<{
  /** When true this is the sticky bottom bar; when false it's an inline spawn. */
  isBottom?: boolean;
  /** Placeholder text for the input. */
  placeholder?: string;
}>();

const emit = defineEmits<{
  (e: "submit", payload: { type: ScreenplayElementType; text: string }): void;
  (e: "cancel"): void;
}>();

const inputText = ref("");
const inputRef = ref<HTMLInputElement | null>(null);

/**
 * Detect the element type from prefix characters typed before the first space.
 * Returns the detected type and the remaining text after the prefix.
 */
function detectType(raw: string): { type: ScreenplayElementType; text: string } {
  // Order matters: check longer prefixes first
  if (raw.startsWith("## ")) return { type: "scene-heading-sub", text: raw.slice(3) };
  if (raw.startsWith("# "))  return { type: "scene-heading", text: raw.slice(2) };
  if (raw.startsWith(">> ")) return { type: detectDialogSubtype(raw.slice(3)), text: raw.slice(3) };
  if (raw.startsWith("> "))  return { type: "dialog-character", text: raw.slice(2) };
  if (raw.startsWith(": "))  return { type: "scene-transition", text: raw.slice(2) };
  return { type: "action", text: raw };
}

function detectDialogSubtype(text: string): ScreenplayElementType {
  return text.trimStart().startsWith("(") ? "dialog-parenthetical" : "dialog";
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    submit();
  }
  if (event.key === "Escape") {
    event.preventDefault();
    inputText.value = "";
    emit("cancel");
  }
}

function submit() {
  const raw = inputText.value.trim();
  if (!raw) return;

  const { type, text } = detectType(raw);
  emit("submit", { type, text });
  inputText.value = "";
}

function focus() {
  nextTick(() => inputRef.value?.focus());
}

defineExpose({ focus });
</script>

<template>
  <div :class="['editor-input-bar', { 'editor-input-bar--bottom': isBottom }]">
    <div class="editor-input-bar__prefix-hint">
      <span class="hint-chip">#</span>
      <span class="hint-chip">:</span>
      <span class="hint-chip">&gt;</span>
      <span class="hint-chip">&gt;&gt;</span>
    </div>
    <input
      ref="inputRef"
      v-model="inputText"
      :placeholder="placeholder ?? 'Type element… (# scene, : transition, > character, >> dialog)'"
      class="editor-input-bar__input"
      @keydown="handleKeydown"
      autocomplete="off"
      spellcheck="true"
    />
    <v-btn
      icon
      variant="text"
      size="small"
      color="primary"
      @click="submit"
      :disabled="!inputText.trim()"
    >
      <v-icon>mdi-plus-circle</v-icon>
    </v-btn>
  </div>
</template>

<style scoped>
.editor-input-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(var(--v-theme-surface), 1);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 12px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.editor-input-bar:focus-within {
  border-color: rgb(var(--v-theme-primary));
  box-shadow: 0 0 0 2px rgba(var(--v-theme-primary), 0.15);
}

.editor-input-bar--bottom {
  position: sticky;
  bottom: 0;
  z-index: 10;
  margin: 0 -4px;
  border-radius: 12px 12px 0 0;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
}

.editor-input-bar__prefix-hint {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.hint-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 4px;
  font-family: "Fira Code", "Courier New", monospace;
  font-size: 11px;
  font-weight: 600;
  border-radius: 4px;
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
  user-select: none;
}

.editor-input-bar__input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-family: "Courier New", Courier, monospace;
  font-size: 15px;
  line-height: 1.6;
  padding: 4px 0;
}

.editor-input-bar__input::placeholder {
  color: rgba(var(--v-theme-on-surface), 0.35);
  font-style: italic;
}
</style>
