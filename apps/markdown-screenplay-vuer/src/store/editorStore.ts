import { defineStore } from "pinia";
import { ref, computed } from "vue";
import {
  MarkupTransformer,
  JsonTransformTarget,
  serializeToMdsp,
  createElement,
  type ScreenplayElement,
  type ScreenplayElementType,
} from "@transformers";
import type { MetadataData } from "@/interfaces/file-data";

export const useEditorStore = defineStore("editor", () => {
  // ── State ──────────────────────────────────────────────────────────
  const elements = ref<ScreenplayElement[]>([]);
  const selectedElementId = ref<string | null>(null);
  const metadata = ref<MetadataData>({
    title: "",
    version: "",
    authors: [""],
  });

  /**
   * When non-null, an inline input bar is shown after the element
   * with this ID.
   */
  const inlineInputAfterElementId = ref<string | null>(null);

  // ── Getters ────────────────────────────────────────────────────────
  const serializedMdsp = computed(() => serializeToMdsp(elements.value));

  const selectedElement = computed(() =>
    elements.value.find((el) => el.id === selectedElementId.value) ?? null,
  );

  // ── Actions ────────────────────────────────────────────────────────

  /**
   * Parse raw `.mdsp` content into structured elements.
   */
  function loadFromRawContent(rawContent: string) {
    const target = new JsonTransformTarget();
    const transformer = new MarkupTransformer<JsonTransformTarget, ScreenplayElement[]>(target);
    const lines = rawContent.split(/\r?\n/);
    lines.forEach((line) => transformer.next(line));
    const result = transformer.compose();
    elements.value = result.output;
    selectedElementId.value = null;
    inlineInputAfterElementId.value = null;
  }

  /**
   * Append a new element at the end, or at a specific index.
   */
  function addElement(type: ScreenplayElementType, text: string, atIndex?: number) {
    const el = createElement(type, text);
    if (atIndex !== undefined && atIndex >= 0 && atIndex <= elements.value.length) {
      elements.value.splice(atIndex, 0, el);
    } else {
      elements.value.push(el);
    }
    return el;
  }

  /**
   * Update the text of an existing element.
   */
  function updateElementText(id: string, text: string) {
    const el = elements.value.find((e) => e.id === id);
    if (el) el.text = text;
  }

  /**
   * Update the type of an existing element.
   */
  function updateElementType(id: string, type: ScreenplayElementType) {
    const el = elements.value.find((e) => e.id === id);
    if (el) el.type = type;
  }

  /**
   * Remove an element by ID.
   */
  function removeElement(id: string) {
    const idx = elements.value.findIndex((e) => e.id === id);
    if (idx >= 0) {
      elements.value.splice(idx, 1);
      if (selectedElementId.value === id) {
        selectedElementId.value = null;
      }
    }
  }

  /**
   * Insert a new element after the element with the given ID.
   */
  function insertElementAfter(afterId: string, type: ScreenplayElementType, text: string) {
    const idx = elements.value.findIndex((e) => e.id === afterId);
    if (idx >= 0) {
      return addElement(type, text, idx + 1);
    }
    return addElement(type, text);
  }

  /**
   * Select an element (or deselect with null).
   */
  function selectElement(id: string | null) {
    selectedElementId.value = id;
  }

  /**
   * Show/hide the inline input bar after an element.
   */
  function showInlineInputAfter(id: string | null) {
    inlineInputAfterElementId.value = id;
  }

  function setMetadata(meta: MetadataData) {
    metadata.value = meta;
  }

  function $reset() {
    elements.value = [];
    selectedElementId.value = null;
    inlineInputAfterElementId.value = null;
    metadata.value = { title: "", version: "", authors: [""] };
  }

  return {
    // state
    elements,
    selectedElementId,
    metadata,
    inlineInputAfterElementId,
    // getters
    serializedMdsp,
    selectedElement,
    // actions
    loadFromRawContent,
    addElement,
    updateElementText,
    updateElementType,
    removeElement,
    insertElementAfter,
    selectElement,
    showInlineInputAfter,
    setMetadata,
    $reset,
  };
});
