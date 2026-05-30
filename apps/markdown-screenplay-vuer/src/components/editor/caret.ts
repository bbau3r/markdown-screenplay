import { nextTick } from "vue";

/**
 * Gets the current caret character offset within an HTML element.
 */
export function getCaretOffset(element: HTMLElement): number {
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

/**
 * Sets the caret/cursor position to a specific offset inside an element.
 */
export function setCursorOffset(element: HTMLElement, offset: number): void {
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
    range.collapse(true);
  } else {
    range.selectNodeContents(element);
    range.collapse(false);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * Checks if the caret is at the start (offset 0) of the given element.
 */
export function isCaretAtStart(element: HTMLElement): boolean {
  return getCaretOffset(element) === 0;
}

/**
 * Focuses the DOM node of the specified element ID and sets the cursor position.
 */
export function focusElement(id: string, caretPosition: 'start' | 'end' | number = 'end'): void {
  nextTick(() => {
    const el = document.querySelector(`[data-id="${id}"] .editor-element__content`) as HTMLElement;
    if (el) {
      el.focus();

      let offset = 0;
      if (caretPosition === "start") {
        offset = 0;
      } else if (caretPosition === "end") {
        offset = el.innerText.length;
      } else if (typeof caretPosition === "number") {
        offset = caretPosition;
      }

      setCursorOffset(el, offset);
    }
  });
}
