<script setup lang="ts">
import { ref, nextTick } from "vue";
import { useEditorStore } from "@/store/editorStore";
import EditorElement from "./EditorElement.vue";
import EditorInputBar from "./EditorInputBar.vue";
import type { ScreenplayElementType } from "@transformers";

const editorStore = useEditorStore();

const inlineInputRef = ref<InstanceType<typeof EditorInputBar> | null>(null);
const bottomInputRef = ref<InstanceType<typeof EditorInputBar> | null>(null);

// ── Element event handlers ───────────────────────────────────────

function handleSelect(id: string) {
  editorStore.selectElement(
    editorStore.selectedElementId === id ? null : id,
  );
}

function handleUpdateText(payload: { id: string; text: string }) {
  editorStore.updateElementText(payload.id, payload.text);
}

function handleRemove(id: string) {
  editorStore.removeElement(id);
}

function handleInsertAfter(id: string) {
  editorStore.showInlineInputAfter(id);
  nextTick(() => inlineInputRef.value?.focus());
}

// ── Input bar handlers ───────────────────────────────────────────

function handleBottomSubmit(payload: { type: ScreenplayElementType; text: string }) {
  editorStore.addElement(payload.type, payload.text);
}

function handleInlineSubmit(payload: { type: ScreenplayElementType; text: string }) {
  const afterId = editorStore.inlineInputAfterElementId;
  if (afterId) {
    editorStore.insertElementAfter(afterId, payload.type, payload.text);
  } else {
    editorStore.addElement(payload.type, payload.text);
  }
  editorStore.showInlineInputAfter(null);
}

function handleInlineCancel() {
  editorStore.showInlineInputAfter(null);
}

// ── Global keyboard ─────────────────────────────────────────────

function handleContainerKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    editorStore.selectElement(null);
    editorStore.showInlineInputAfter(null);
  }
}
</script>

<template>
  <div
    class="editor-content"
    @keydown="handleContainerKeydown"
    @click.self="editorStore.selectElement(null)"
  >
    <!-- Empty state -->
    <div v-if="editorStore.elements.length === 0" class="editor-content__empty">
      <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-script-text-outline</v-icon>
      <p class="text-h6 text-medium-emphasis">No elements yet</p>
      <p class="text-body-2 text-disabled">
        Use the input bar below to add screenplay elements.<br />
        Type a prefix (<code>#</code> <code>:</code> <code>&gt;</code> <code>&gt;&gt;</code>)
        followed by a space to set the element type.
      </p>
    </div>

    <!-- Element list -->
    <div class="editor-content__elements sp-container">
      <template v-for="element in editorStore.elements" :key="element.id">
        <EditorElement
          :element="element"
          :is-selected="editorStore.selectedElementId === element.id"
          @select="handleSelect"
          @update:text="handleUpdateText"
          @remove="handleRemove"
          @insert-after="handleInsertAfter"
        />

        <!-- Inline input bar (shown after this element when Enter is pressed) -->
        <EditorInputBar
          v-if="editorStore.inlineInputAfterElementId === element.id"
          ref="inlineInputRef"
          placeholder="New element… (prefix + space to set type)"
          @submit="handleInlineSubmit"
          @cancel="handleInlineCancel"
        />
      </template>
    </div>

    <!-- Sticky bottom input bar -->
    <EditorInputBar
      ref="bottomInputRef"
      :is-bottom="true"
      @submit="handleBottomSubmit"
    />
  </div>
</template>

<style scoped>
.editor-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 16px;
  gap: 0;
}

.editor-content__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 48px 24px;
  opacity: 0.85;
}

.editor-content__empty code {
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
  padding: 1px 5px;
  border-radius: 3px;
  font-family: "Fira Code", monospace;
  font-size: 0.9em;
}

.editor-content__elements {
  flex: 1;
  padding-bottom: 80px; /* space for sticky bottom bar */
}
</style>
