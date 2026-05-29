import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../editorStore";

describe("editorStore", () => {
  it("loads screenplay content and splits elements", () => {
    setActivePinia(createPinia());
    const store = useEditorStore();

    store.loadFromRawContent("# INT. HOUSE - DAY\n> JOHN\n>> Hello world!");

    expect(store.elements.length).toBe(3);
    expect(store.elements[0].type).toBe("scene-heading");
    expect(store.elements[0].text).toBe("INT. HOUSE - DAY");
    expect(store.elements[1].type).toBe("dialog-character");
    expect(store.elements[1].text).toBe("JOHN");
    expect(store.elements[2].type).toBe("dialog");
    expect(store.elements[2].text).toBe("Hello world!");

    // Split element at index 2 ("Hello world!") by slicing
    const el = store.elements[2];
    const newEl = store.splitElement(el.id, "Hello ", "world!");

    expect(store.elements.length).toBe(4);
    expect(store.elements[2].text).toBe("Hello ");
    expect(newEl).not.toBeNull();
    expect(newEl!.text).toBe("world!");
    expect(newEl!.type).toBe("dialog"); // Dialog inherits dialog type when split
  });

  it("merges elements with previous", () => {
    setActivePinia(createPinia());
    const store = useEditorStore();

    store.loadFromRawContent("Line 1\nLine 2");
    expect(store.elements.length).toBe(2);

    const secondElId = store.elements[1].id;
    const mergeResult = store.mergeWithPrevious(secondElId);

    expect(mergeResult).not.toBeNull();
    expect(mergeResult!.mergedId).toBe(store.elements[0].id);
    expect(mergeResult!.cursorOffset).toBe(6); // Length of "Line 1"
    expect(store.elements.length).toBe(1);
    expect(store.elements[0].text).toBe("Line 1Line 2");
  });

  it("handles multi-selection range and deletion", () => {
    setActivePinia(createPinia());
    const store = useEditorStore();

    store.loadFromRawContent("Line 1\nLine 2\nLine 3\nLine 4");
    expect(store.elements.length).toBe(4);

    const ids = store.elements.map((e) => e.id);

    // Select first element
    store.selectElement(ids[0]);
    expect(store.selectedElementIds).toEqual([ids[0]]);

    // Shift select third element (should select 1st, 2nd, and 3rd)
    store.selectElement(ids[2], true);
    expect(store.selectedElementIds).toEqual([ids[0], ids[1], ids[2]]);

    // Delete selected elements
    const nextFocusId = store.deleteSelectedElements();

    expect(store.elements.length).toBe(1);
    expect(store.elements[0].text).toBe("Line 4");
    expect(nextFocusId).toBe(ids[3]);
  });

  it("handles empty placeholders and serializedMdsp output", () => {
    setActivePinia(createPinia());
    const store = useEditorStore();

    store.loadFromRawContent("# INT. HOUSE - DAY\nLine 1");
    expect(store.elements.length).toBe(2);

    // Call ensurePlaceholders (normally run by EditorContent watcher)
    store.ensurePlaceholders();

    // Should insert empty action at start and end
    expect(store.elements.length).toBe(4);
    expect(store.elements[0].type).toBe("action");
    expect(store.elements[0].text).toBe("");
    expect(store.elements[1].type).toBe("scene-heading");
    expect(store.elements[3].type).toBe("action");
    expect(store.elements[3].text).toBe("");

    // Serialized output should strip the empty top and bottom placeholders!
    expect(store.serializedMdsp).toBe("# INT. HOUSE - DAY\nLine 1");
  });

  it("transitions element to/from dialog-parenthetical formatting the text correctly", () => {
    setActivePinia(createPinia());
    const store = useEditorStore();

    store.loadFromRawContent("# INT. HOUSE - DAY\n> JOHN\n>> Hello");
    expect(store.elements.length).toBe(3);
    const dialogEl = store.elements[2];
    expect(dialogEl.type).toBe("dialog");
    expect(dialogEl.text).toBe("Hello");

    // Transition to dialog-parenthetical
    store.updateElementType(dialogEl.id, "dialog-parenthetical");
    expect(dialogEl.type).toBe("dialog-parenthetical");
    expect(dialogEl.text).toBe("(Hello)");

    // Transition back to dialog
    store.updateElementType(dialogEl.id, "dialog");
    expect(dialogEl.type).toBe("dialog");
    expect(dialogEl.text).toBe("Hello");

    // Transition back with partial parentheses
    dialogEl.text = "(Hello";
    dialogEl.type = "dialog";
    store.updateElementType(dialogEl.id, "dialog-parenthetical");
    expect(dialogEl.text).toBe("(Hello)");

    dialogEl.text = "Hello)";
    dialogEl.type = "dialog";
    store.updateElementType(dialogEl.id, "dialog-parenthetical");
    expect(dialogEl.text).toBe("(Hello))");

    // If already fully enclosed, do nothing
    dialogEl.text = "(Hello)";
    dialogEl.type = "dialog";
    dialogEl.type = "dialog-parenthetical"; // wait, to test transition we must actually transition
    dialogEl.type = "dialog";
    store.updateElementType(dialogEl.id, "dialog-parenthetical");
    expect(dialogEl.text).toBe("(Hello)");
  });

  it("supports undo and redo functionality", () => {
    setActivePinia(createPinia());
    const store = useEditorStore();

    store.loadFromRawContent("Line 1\nLine 2");
    expect(store.undoStack.length).toBe(0);
    expect(store.redoStack.length).toBe(0);

    const firstId = store.elements[0].id;

    // 1. Text edit
    store.updateElementText(firstId, "Line 1 edited");
    expect(store.undoStack.length).toBe(1); // 1 snapshot pushed
    expect(store.undoStack[0].elements[0].text).toBe("Line 1"); // holds old text

    // 2. Undo
    store.undo();
    expect(store.elements[0].text).toBe("Line 1");
    expect(store.undoStack.length).toBe(0);
    expect(store.redoStack.length).toBe(1);
    expect(store.redoStack[0].elements[0].text).toBe("Line 1 edited");

    // 3. Redo
    store.redo();
    expect(store.elements[0].text).toBe("Line 1 edited");
    expect(store.undoStack.length).toBe(1);
    expect(store.redoStack.length).toBe(0);
  });

  it("groups consecutive text edits using debounce", () => {
    vi.useFakeTimers();
    try {
      setActivePinia(createPinia());
      const store = useEditorStore();

      store.loadFromRawContent("Line 1");
      const firstId = store.elements[0].id;

      // Type characters
      store.updateElementText(firstId, "Line 1a");
      store.updateElementText(firstId, "Line 1ab");
      store.updateElementText(firstId, "Line 1abc");

      // Because of debounce, only 1 undo snapshot should be recorded
      expect(store.undoStack.length).toBe(1);
      expect(store.undoStack[0].elements[0].text).toBe("Line 1");

      // Advance time by 1300ms (more than 1200ms debounce)
      vi.advanceTimersByTime(1300);

      // Now type again - should start a new session and push a new snapshot
      store.updateElementText(firstId, "Line 1abcd");
      expect(store.undoStack.length).toBe(2);
      expect(store.undoStack[1].elements[0].text).toBe("Line 1abc");
    } finally {
      vi.useRealTimers();
    }
  });

  it("finalizes typing session on non-text action", () => {
    setActivePinia(createPinia());
    const store = useEditorStore();

    store.loadFromRawContent("Line 1\nLine 2");
    const firstId = store.elements[0].id;

    // Type text
    store.updateElementText(firstId, "Line 1 typed");
    expect(store.undoStack.length).toBe(1);

    // Non-text action: update type
    store.updateElementType(firstId, "scene-heading");
    
    // Changing type should push the typed text to undoStack (making it length 2)
    expect(store.undoStack.length).toBe(2);
    expect(store.undoStack[1].elements[0].text).toBe("Line 1 typed");
    expect(store.undoStack[1].elements[0].type).toBe("action"); // before change to scene-heading
  });

  it("handles history boundaries and limits", () => {
    setActivePinia(createPinia());
    const store = useEditorStore();

    // 1. Undo/redo on empty stacks is safe
    expect(() => store.undo()).not.toThrow();
    expect(() => store.redo()).not.toThrow();

    // 2. Limit stack size to 100
    store.loadFromRawContent("Base");
    const firstId = store.elements[0].id;

    for (let i = 0; i < 110; i++) {
      // Force non-text change to push snapshots
      store.updateElementType(firstId, i % 2 === 0 ? "scene-heading" : "action");
    }
    
    // Stack should be capped at 100
    expect(store.undoStack.length).toBe(100);
  });

  it("bundles split element and subsequent typing", () => {
    setActivePinia(createPinia());
    const store = useEditorStore();

    store.loadFromRawContent("Line 1");
    const firstId = store.elements[0].id;

    // Split element (non-text action with bundling)
    const newEl = store.splitElement(firstId, "Li", "ne 1")!;
    expect(store.undoStack.length).toBe(1);
    expect(store.undoStack[0].elements.length).toBe(1); // holds "Line 1" before split

    // Type text immediately on the new element
    store.updateElementText(newEl.id, "ne 1 edited");
    
    // Typing text should NOT push a new snapshot because it is bundled!
    expect(store.undoStack.length).toBe(1);

    // Undo should revert all the way back to before the split (removing split and typing)
    store.undo();
    expect(store.elements.length).toBe(1);
    expect(store.elements[0].text).toBe("Line 1");
  });

  it("prevents recording duplicate snapshots on identical states", () => {
    setActivePinia(createPinia());
    const store = useEditorStore();

    store.loadFromRawContent("Line 1");
    
    const meta = { title: "My Script", version: "1", authors: ["Me"] };
    
    // Call setMetadata first time
    store.setMetadata(meta);
    expect(store.undoStack.length).toBe(1); // 1 snapshot pushed

    // Call setMetadata second time with the same values
    store.setMetadata({ ...meta });
    
    // Should NOT push a duplicate snapshot
    expect(store.undoStack.length).toBe(1);
    
    // Call setMetadata third time with different metadata
    store.setMetadata({ title: "My Script Changed", version: "1", authors: ["Me"] });
    expect(store.undoStack.length).toBe(2); // new snapshot pushed
  });
});
