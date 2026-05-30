import { nextTick } from "vue";
import type { Ref } from "vue";
import type { ScreenplayElement, ScreenplayElementType } from "@transformers";
import { getCaretOffset, setCursorOffset, isCaretAtStart } from "./caret";

export interface KeydownOptions {
  onUpdateLastEmittedText?: (text: string) => void;
}

export function useElementKeydown(
  element: ScreenplayElement,
  editorRef: Ref<HTMLDivElement | null>,
  flushDebounce: () => void,
  emit: {
    (e: "split", payload: { id: string; text1: string; text2: string }): void;
    (e: "update:type", payload: { id: string; type: ScreenplayElementType }): void;
    (e: "update:text", payload: { id: string; text: string }): void;
    (e: "merge-previous", id: string): void;
    (e: "navigate", payload: { id: string; direction: "up" | "down"; isShift: boolean }): void;
  },
  options?: KeydownOptions
) {
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

    // 1. Enter key: split element or convert empty non-action elements to action, or action with character prefix to dialog-character
    if (event.key === "Enter" && !event.shiftKey) {
      if (editorRef.value && editorRef.value.innerText.trim() === "" && element.type !== "action") {
        event.preventDefault();
        if (options?.onUpdateLastEmittedText) {
          options.onUpdateLastEmittedText("");
        }
        emit("update:text", { id: element.id, text: "" });
        emit("update:type", { id: element.id, type: "action" });
        return;
      }

      if (element.type === "action" && editorRef.value) {
        const text = editorRef.value.innerText.trim();
        const isChar = (text.startsWith("@") && text.length > 1) || (text.startsWith("[") && /^\[.+?\]\(.+?\)(?:\s*\(.+?\))?$/.test(text));
        if (isChar) {
          event.preventDefault();
          const offset = getCaretOffset(editorRef.value);
          const fullText = editorRef.value.innerText;
          const textBeforeCursor = fullText.slice(0, offset).trim();
          const textAfterCursor = fullText.slice(offset).trim();

          let charText = textBeforeCursor;
          if (charText.startsWith("@")) {
            charText = charText.slice(1).trim();
          }

          emit("update:type", { id: element.id, type: "dialog-character" });
          emit("update:text", { id: element.id, text: charText });
          editorRef.value.innerText = charText;

          emit("split", { id: element.id, text1: charText, text2: textAfterCursor });
          return;
        }
      }

      event.preventDefault();
      if (editorRef.value) {
        const offset = getCaretOffset(editorRef.value);

        const text = editorRef.value.innerText;
        const text1 = text.slice(0, offset);
        const text2 = text.slice(offset);

        // Update DOM and store immediately to prevent text retention in current element
        editorRef.value.innerText = text1;

        emit("split", { id: element.id, text1, text2 });
      }
    }

    // 2. Space key: check markdown prefix shortcuts
    if (event.key === " " && element.type === "action") {
      if (editorRef.value) {
        const offset = getCaretOffset(editorRef.value);
        const text = editorRef.value.innerText;
        const prefix = text.slice(0, offset).trim();
        const remainingText = text.slice(offset);

        let newType: ScreenplayElementType | null = null;
        let newText = remainingText;

        if (prefix === "##") {
          newType = "scene-heading-sub";
        } else if (prefix === "#") {
          newType = "scene-heading";
        } else if (prefix === ":") {
          newType = "scene-transition";
        } else if (prefix.startsWith("@")) {
          newType = "dialog-character";
          newText = prefix.slice(1).trim() + remainingText;
        } else if (prefix.startsWith("[") && /^\[.+?\]\(.+?\)(?:\s*\(.+?\))?$/.test(prefix)) {
          newType = "dialog-character";
          newText = prefix + remainingText;
        }

        if (newType !== null) {
          event.preventDefault();
          emit("update:type", { id: element.id, type: newType });

          editorRef.value.innerText = newText;
          if (options?.onUpdateLastEmittedText) {
            options.onUpdateLastEmittedText(newText);
          }
          emit("update:text", { id: element.id, text: newText });

          nextTick(() => {
            if (editorRef.value) {
              setCursorOffset(editorRef.value, newText.length);
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
            if (options?.onUpdateLastEmittedText) {
              options.onUpdateLastEmittedText("");
            }
            emit("update:text", { id: element.id, text: "" });
            emit("merge-previous", element.id);
            return;
          } else if (event.key === "Backspace" && editorRef.value && isCaretAtStart(editorRef.value)) {
            // 2. Part of the element is selected and Backspace pressed -> Delete selected text but don't merge
            return;
          }
        } else if (event.key === "Backspace" && editorRef.value && isCaretAtStart(editorRef.value)) {
          // 3. Only merge if no text is selected (caret is collapsed) on Backspace
          const isDOMEmpty = editorRef.value.innerText.trim() === "";
          if (isDOMEmpty || element.type === "action") {
            event.preventDefault();
            if (isDOMEmpty) {
              if (options?.onUpdateLastEmittedText) {
                options.onUpdateLastEmittedText("");
              }
              emit("update:text", { id: element.id, text: "" });
            }
            emit("merge-previous", element.id);
          } else {
            event.preventDefault();
            const demotionMap: Record<
              ScreenplayElementType,
              ScreenplayElementType
            > = {
              "dialog-character": "action",
              "dialog-parenthetical": "dialog",
              "dialog": "dialog-character",
              "scene-heading-sub": "scene-heading",
              "scene-heading": "action",
              "scene-transition": "action",
              "action": "action",
            };
            const nextType = demotionMap[element.type] || "action";
            emit("update:type", { id: element.id, type: nextType });
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
      if (editorRef.value && isCaretAtStart(editorRef.value)) {
        event.preventDefault();
        emit("navigate", {
          id: element.id,
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
            id: element.id,
            direction: "down",
            isShift: event.shiftKey,
          });
        }
      }
    }
  }

  return handleKeydown;
}
