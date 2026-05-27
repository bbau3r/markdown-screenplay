import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it } from "vitest";
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
});
