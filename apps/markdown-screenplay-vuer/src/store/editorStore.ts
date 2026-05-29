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
import type { MetadataData, CharacterFileData } from "@/interfaces/file-data";

export const useEditorStore = defineStore("editor", () => {
  // ── State ──────────────────────────────────────────────────────────
  const elements = ref<ScreenplayElement[]>([]);
  const selectedElementIds = ref<string[]>([]);
  const metadata = ref<MetadataData>({
    title: "",
    version: "",
    authors: [""],
  });
  const characters = ref<CharacterFileData[]>([]);

  const inlineInputAfterElementId = ref<string | null>(null);

  interface HistorySnapshot {
    elements: ScreenplayElement[];
    metadata: MetadataData;
    characters: CharacterFileData[];
    selectedElementIds: string[];
    caretOffset: number | null;
  }

  const undoStack = ref<HistorySnapshot[]>([]);
  const redoStack = ref<HistorySnapshot[]>([]);
  const caretOffset = ref<number | null>(null);
  const isTyping = ref(false);
  let typingTimeout: ReturnType<typeof setTimeout> | null = null;
  const MAX_HISTORY = 100;

  function getCaretOffsetOfActiveElement(): number | null {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return null;
    }
    const activeEl = document.activeElement as HTMLElement;
    if (activeEl && activeEl.classList.contains("editor-element__content")) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        let offset = 0;
        const node = range.startContainer;
        const targetOffset = range.startOffset;

        if (activeEl.contains(node) || activeEl === node) {
          const walker = document.createTreeWalker(activeEl, NodeFilter.SHOW_TEXT, null);
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
              if (activeEl.contains(child)) {
                childOffset += child.textContent?.length || 0;
              }
            }
            return childOffset;
          }
        }
      }
    }
    return null;
  }

  function recordState(isTextEdit = false, bundleSubsequentTyping = false) {
    const currentElementsStr = JSON.stringify(elements.value);
    const currentMetadataStr = JSON.stringify(metadata.value);
    const currentCharactersStr = JSON.stringify(characters.value);

    // Helper to check if the top snapshot in the stack is identical to current state
    function isDuplicateSnapshot(): boolean {
      if (undoStack.value.length === 0) return false;
      const top = undoStack.value[undoStack.value.length - 1];
      return JSON.stringify(top.elements) === currentElementsStr &&
             JSON.stringify(top.metadata) === currentMetadataStr &&
             JSON.stringify(top.characters) === currentCharactersStr;
    }

    if (isTextEdit) {
      if (!isTyping.value) {
        if (!isDuplicateSnapshot()) {
          if (undoStack.value.length >= MAX_HISTORY) {
            undoStack.value.shift();
          }
          undoStack.value.push({
            elements: JSON.parse(currentElementsStr),
            metadata: JSON.parse(currentMetadataStr),
            characters: JSON.parse(currentCharactersStr),
            selectedElementIds: [...selectedElementIds.value],
            caretOffset: getCaretOffsetOfActiveElement(),
          });
        }
        isTyping.value = true;
      }
      redoStack.value = [];

      if (typingTimeout) {
        clearTimeout(typingTimeout);
      }
      typingTimeout = setTimeout(() => {
        isTyping.value = false;
        typingTimeout = null;
      }, 1200);
    } else {
      if (isTyping.value) {
        isTyping.value = false;
        if (typingTimeout) {
          clearTimeout(typingTimeout);
          typingTimeout = null;
        }
      }
      
      if (!isDuplicateSnapshot()) {
        if (undoStack.value.length >= MAX_HISTORY) {
          undoStack.value.shift();
        }
        undoStack.value.push({
          elements: JSON.parse(currentElementsStr),
          metadata: JSON.parse(currentMetadataStr),
          characters: JSON.parse(currentCharactersStr),
          selectedElementIds: [...selectedElementIds.value],
          caretOffset: getCaretOffsetOfActiveElement(),
        });
      }
      redoStack.value = [];

      if (bundleSubsequentTyping) {
        isTyping.value = true;
        if (typingTimeout) {
          clearTimeout(typingTimeout);
        }
        typingTimeout = setTimeout(() => {
          isTyping.value = false;
          typingTimeout = null;
        }, 1200);
      }
    }
  }

  // ── Getters ────────────────────────────────────────────────────────
  const serializedMdsp = computed(() => {
    let startIdx = 0;
    while (startIdx < elements.value.length && elements.value[startIdx].type === "action" && elements.value[startIdx].text === "") {
      startIdx++;
    }
    
    let endIdx = elements.value.length - 1;
    while (endIdx >= startIdx && elements.value[endIdx].type === "action" && elements.value[endIdx].text === "") {
      endIdx--;
    }
    
    const contentElements = elements.value.slice(startIdx, endIdx + 1);
    return serializeToMdsp(contentElements);
  });

  const selectedElementId = computed(() => selectedElementIds.value[0] ?? null);

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
    
    // Ensure we have at least one element so the editor is never completely empty
    if (elements.value.length === 0) {
      elements.value.push(createElement("action", ""));
    }
    
    selectedElementIds.value = [];
    inlineInputAfterElementId.value = null;

    undoStack.value = [];
    redoStack.value = [];
    isTyping.value = false;
    if (typingTimeout) {
      clearTimeout(typingTimeout);
      typingTimeout = null;
    }
  }

  /**
   * Append a new element at the end, or at a specific index.
   */
  function addElement(type: ScreenplayElementType, text: string, atIndex?: number) {
    recordState(false, true);
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
    if (el) {
      if (el.text !== text) {
        recordState(true);
        el.text = text;
      }
    }
  }

  function updateElementType(id: string, type: ScreenplayElementType) {
    const el = elements.value.find((e) => e.id === id);
    if (el) {
      const oldType = el.type;
      if (oldType !== type) {
        recordState(false, true);
        if (type === "dialog-parenthetical") {
          let txt = el.text;
          if (txt.startsWith("(") && txt.endsWith(")")) {
            // Already enclosed, do nothing
          } else {
            if (!txt.startsWith("(")) {
              txt = "(" + txt;
            }
            txt = txt + ")";
          }
          el.text = txt;
        } else if (oldType === "dialog-parenthetical") {
          let txt = el.text;
          if (txt.startsWith("(")) {
            txt = txt.slice(1);
          }
          if (txt.endsWith(")")) {
            txt = txt.slice(0, -1);
          }
          el.text = txt;
        }
        el.type = type;
      }
    }
  }

  /**
   * Remove an element by ID.
   */
  function removeElement(id: string) {
    const idx = elements.value.findIndex((e) => e.id === id);
    if (idx >= 0) {
      recordState(false);
      elements.value.splice(idx, 1);
      selectedElementIds.value = selectedElementIds.value.filter((x) => x !== id);
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
  function selectElement(id: string | null, isShift: boolean = false, isCtrl: boolean = false) {
    if (id === null) {
      selectedElementIds.value = [];
      return;
    }

    if (isShift && selectedElementIds.value.length > 0) {
      const lastId = selectedElementIds.value[selectedElementIds.value.length - 1];
      const idx1 = elements.value.findIndex((e) => e.id === lastId);
      const idx2 = elements.value.findIndex((e) => e.id === id);
      if (idx1 >= 0 && idx2 >= 0) {
        const start = Math.min(idx1, idx2);
        const end = Math.max(idx1, idx2);
        selectedElementIds.value = elements.value.slice(start, end + 1).map((e) => e.id);
      }
    } else if (isCtrl) {
      const idx = selectedElementIds.value.indexOf(id);
      if (idx >= 0) {
        selectedElementIds.value.splice(idx, 1);
      } else {
        selectedElementIds.value.push(id);
      }
    } else {
      selectedElementIds.value = [id];
    }
  }

  /**
   * Delete all selected elements and return the ID of the element to focus next.
   */
  function deleteSelectedElements(): string | null {
    if (selectedElementIds.value.length === 0) return null;

    recordState(false);
    const firstSelectedId = selectedElementIds.value[0];
    const firstIdx = elements.value.findIndex((e) => e.id === firstSelectedId);

    elements.value = elements.value.filter(
      (el) => !selectedElementIds.value.includes(el.id),
    );

    selectedElementIds.value = [];

    if (elements.value.length === 0) {
      const newEl = createElement("action", "");
      elements.value.push(newEl);
      selectedElementIds.value = [newEl.id];
      return newEl.id;
    }

    const nextFocusIdx = Math.min(firstIdx, elements.value.length - 1);
    if (nextFocusIdx >= 0) {
      const targetId = elements.value[nextFocusIdx].id;
      selectedElementIds.value = [targetId];
      return targetId;
    }
    return null;
  }

  /**
   * Split an element at the given character offset.
   */
  function splitElement(id: string, text1: string, text2: string): ScreenplayElement | null {
    const idx = elements.value.findIndex((e) => e.id === id);
    if (idx >= 0) {
      recordState(false, true);
      const el = elements.value[idx];
      el.text = text1;

      let nextType: ScreenplayElementType = "action";
      if (el.type === "dialog-character") {
        nextType = "dialog";
      } else if (el.type === "dialog-parenthetical") {
        nextType = "dialog";
      } else if (el.type === "dialog") {
        nextType = "dialog";
      }

      const newEl = createElement(nextType, text2);
      elements.value.splice(idx + 1, 0, newEl);

      selectedElementIds.value = [newEl.id];
      return newEl;
    }
    return null;
  }

  /**
   * Merge the element with the previous element in the list.
   */
  function mergeWithPrevious(id: string): { mergedId: string; cursorOffset: number } | null {
    const idx = elements.value.findIndex((e) => e.id === id);
    if (idx > 0) {
      recordState(false, true);
      const prevEl = elements.value[idx - 1];
      const currentEl = elements.value[idx];
      const originalPrevTextLength = prevEl.text.length;

      prevEl.text = prevEl.text + currentEl.text;
      elements.value.splice(idx, 1);

      selectedElementIds.value = [prevEl.id];

      return {
        mergedId: prevEl.id,
        cursorOffset: originalPrevTextLength,
      };
    }
    return null;
  }

  function showInlineInputAfter(id: string | null) {
    inlineInputAfterElementId.value = id;
  }

  function setMetadata(meta: MetadataData, isTextEdit = false) {
    const currentMetaStr = JSON.stringify(metadata.value);
    const newMetaStr = JSON.stringify(meta);
    if (currentMetaStr !== newMetaStr) {
      recordState(isTextEdit);
      metadata.value = meta;
    }
  }

  function ensurePlaceholders() {
    if (elements.value.length === 0) {
      elements.value.push(createElement("action", ""));
      return;
    }

    // Ensure first element is an empty action
    if (elements.value[0].text !== "" || elements.value[0].type !== "action") {
      elements.value.unshift(createElement("action", ""));
    }

    // Ensure last element is an empty action
    const lastIdx = elements.value.length - 1;
    if (elements.value[lastIdx].text !== "" || elements.value[lastIdx].type !== "action") {
      elements.value.push(createElement("action", ""));
    }
  }

  function undo() {
    if (isTyping.value) {
      isTyping.value = false;
      if (typingTimeout) {
        clearTimeout(typingTimeout);
        typingTimeout = null;
      }
    }

    if (undoStack.value.length === 0) return;

    if (redoStack.value.length >= MAX_HISTORY) {
      redoStack.value.shift();
    }
    redoStack.value.push({
      elements: JSON.parse(JSON.stringify(elements.value)),
      metadata: JSON.parse(JSON.stringify(metadata.value)),
      characters: JSON.parse(JSON.stringify(characters.value)),
      selectedElementIds: [...selectedElementIds.value],
      caretOffset: getCaretOffsetOfActiveElement(),
    });

    const prevSnapshot = undoStack.value.pop()!;
    elements.value = prevSnapshot.elements;
    metadata.value = prevSnapshot.metadata;
    characters.value = prevSnapshot.characters;
    selectedElementIds.value = prevSnapshot.selectedElementIds;
    caretOffset.value = prevSnapshot.caretOffset;
  }

  function redo() {
    if (redoStack.value.length === 0) return;

    if (undoStack.value.length >= MAX_HISTORY) {
      undoStack.value.shift();
    }
    undoStack.value.push({
      elements: JSON.parse(JSON.stringify(elements.value)),
      metadata: JSON.parse(JSON.stringify(metadata.value)),
      characters: JSON.parse(JSON.stringify(characters.value)),
      selectedElementIds: [...selectedElementIds.value],
      caretOffset: getCaretOffsetOfActiveElement(),
    });

    const nextSnapshot = redoStack.value.pop()!;
    elements.value = nextSnapshot.elements;
    metadata.value = nextSnapshot.metadata;
    characters.value = nextSnapshot.characters;
    selectedElementIds.value = nextSnapshot.selectedElementIds;
    caretOffset.value = nextSnapshot.caretOffset;
  }

  function setCharacters(chars: CharacterFileData[], isTextEdit = false) {
    const currentCharsStr = JSON.stringify(characters.value);
    const newCharsStr = JSON.stringify(chars);
    if (currentCharsStr !== newCharsStr) {
      recordState(isTextEdit);
      characters.value = chars;
    }
  }

  function clearHistory() {
    undoStack.value = [];
    redoStack.value = [];
  }

  function $reset() {
    elements.value = [];
    selectedElementIds.value = [];
    inlineInputAfterElementId.value = null;
    metadata.value = { title: "", version: "", authors: [""] };
    characters.value = [];
    undoStack.value = [];
    redoStack.value = [];
    isTyping.value = false;
    if (typingTimeout) {
      clearTimeout(typingTimeout);
      typingTimeout = null;
    }
    caretOffset.value = null;
  }

  return {
    // state
    elements,
    selectedElementIds,
    metadata,
    characters,
    inlineInputAfterElementId,
    undoStack,
    redoStack,
    caretOffset,
    // getters
    serializedMdsp,
    selectedElementId,
    selectedElement,
    // actions
    loadFromRawContent,
    addElement,
    updateElementText,
    updateElementType,
    removeElement,
    insertElementAfter,
    selectElement,
    deleteSelectedElements,
    splitElement,
    mergeWithPrevious,
    showInlineInputAfter,
    setMetadata,
    setCharacters,
    clearHistory,
    ensurePlaceholders,
    undo,
    redo,
    $reset,
  };
});
