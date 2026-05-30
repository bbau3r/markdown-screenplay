import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import EditorElement from "../editor/EditorElement.vue";
import type { ScreenplayElement } from "@transformers";

// Mock window.getSelection for caret offset detection
const mockRange = {
  collapsed: true,
  startContainer: document.createTextNode(""),
  startOffset: 0,
  toString: () => "",
};

const mockSelection = {
  rangeCount: 1,
  getRangeAt: () => mockRange,
  removeAllRanges: () => { },
  addRange: () => { },
};

vi.stubGlobal("getSelection", () => mockSelection);

let overrideCaretOffset: number | null = null;
vi.mock("../editor/caret", async (importOriginal) => {
  const original = await importOriginal<typeof import("../editor/caret")>();
  return {
    ...original,
    getCaretOffset: (element: HTMLElement) => {
      if (overrideCaretOffset !== null) return overrideCaretOffset;
      return original.getCaretOffset(element);
    },
  };
});

describe("EditorElement.vue Backspace Demotion", () => {
  const mountElement = (element: ScreenplayElement) => {
    return mount(EditorElement, {
      props: {
        element,
        isSelected: true,
      },
      global: {
        stubs: {
          "v-menu": true,
          "v-list": true,
          "v-list-item": true,
          "v-chip": true,
          "v-icon": true,
          "v-divider": true,
        },
      },
    });
  };

  it("demotes dialog-parenthetical to dialog", async () => {
    const el: ScreenplayElement = {
      id: "el-parenthetical",
      type: "dialog-parenthetical",
      text: "(beat)",
    };
    const wrapper = mountElement(el);
    const contentDiv = wrapper.find(".editor-element__content");

    await contentDiv.trigger("keydown", { key: "Backspace" });

    // Assert update:type event was emitted with "dialog"
    const emitted = wrapper.emitted("update:type");
    expect(emitted).toBeTruthy();
    expect(emitted![0][0]).toEqual({
      id: "el-parenthetical",
      type: "dialog",
    });
  });

  it("demotes dialog to dialog-character", async () => {
    const el: ScreenplayElement = {
      id: "el-dialog",
      type: "dialog",
      text: "Hello!",
    };
    const wrapper = mountElement(el);
    const contentDiv = wrapper.find(".editor-element__content");

    await contentDiv.trigger("keydown", { key: "Backspace" });

    const emitted = wrapper.emitted("update:type");
    expect(emitted).toBeTruthy();
    expect(emitted![0][0]).toEqual({
      id: "el-dialog",
      type: "dialog-character",
    });
  });

  it("demotes dialog-character to action", async () => {
    const el: ScreenplayElement = {
      id: "el-char",
      type: "dialog-character",
      text: "JOHN",
    };
    const wrapper = mountElement(el);
    const contentDiv = wrapper.find(".editor-element__content");

    await contentDiv.trigger("keydown", { key: "Backspace" });

    const emitted = wrapper.emitted("update:type");
    expect(emitted).toBeTruthy();
    expect(emitted![0][0]).toEqual({
      id: "el-char",
      type: "action",
    });
  });

  it("demotes scene-heading-sub to scene-heading", async () => {
    const el: ScreenplayElement = {
      id: "el-sub",
      type: "scene-heading-sub",
      text: "DAY",
    };
    const wrapper = mountElement(el);
    const contentDiv = wrapper.find(".editor-element__content");

    await contentDiv.trigger("keydown", { key: "Backspace" });

    const emitted = wrapper.emitted("update:type");
    expect(emitted).toBeTruthy();
    expect(emitted![0][0]).toEqual({
      id: "el-sub",
      type: "scene-heading",
    });
  });

  it("demotes scene-heading to action", async () => {
    const el: ScreenplayElement = {
      id: "el-heading",
      type: "scene-heading",
      text: "INT. HALLWAY - NIGHT",
    };
    const wrapper = mountElement(el);
    const contentDiv = wrapper.find(".editor-element__content");

    await contentDiv.trigger("keydown", { key: "Backspace" });

    const emitted = wrapper.emitted("update:type");
    expect(emitted).toBeTruthy();
    expect(emitted![0][0]).toEqual({
      id: "el-heading",
      type: "action",
    });
  });

  it("emits merge-previous when action type is backspaced", async () => {
    const el: ScreenplayElement = {
      id: "el-action",
      type: "action",
      text: "The door slams shut.",
    };
    const wrapper = mountElement(el);
    const contentDiv = wrapper.find(".editor-element__content");

    await contentDiv.trigger("keydown", { key: "Backspace" });

    expect(wrapper.emitted("update:type")).toBeFalsy();
    const mergeEmitted = wrapper.emitted("merge-previous");
    expect(mergeEmitted).toBeTruthy();
    expect(mergeEmitted![0][0]).toBe("el-action");
  });

  it("emits merge-previous when element is empty (even if not action)", async () => {
    const el: ScreenplayElement = {
      id: "el-empty-parenthetical",
      type: "dialog-parenthetical",
      text: "",
    };
    const wrapper = mountElement(el);
    const contentDiv = wrapper.find(".editor-element__content");

    await contentDiv.trigger("keydown", { key: "Backspace" });

    expect(wrapper.emitted("update:type")).toBeFalsy();
    const mergeEmitted = wrapper.emitted("merge-previous");
    expect(mergeEmitted).toBeTruthy();
    expect(mergeEmitted![0][0]).toBe("el-empty-parenthetical");
  });

  it("converts dialog to dialog-parenthetical when typing opens with '('", async () => {
    const el: ScreenplayElement = {
      id: "el-typing",
      type: "dialog",
      text: "",
    };
    const wrapper = mountElement(el);
    const contentDiv = wrapper.find(".editor-element__content");

    // Simulate user typing '('
    (contentDiv.element as HTMLDivElement).innerText = "(";
    await contentDiv.trigger("input");

    // Assert update:type is emitted to dialog-parenthetical
    const emittedType = wrapper.emitted("update:type");
    expect(emittedType).toBeTruthy();
    expect(emittedType![0][0]).toEqual({
      id: "el-typing",
      type: "dialog-parenthetical",
    });

    // Assert update:text is NOT emitted to prevent double updates / store overrides
    const emittedText = wrapper.emitted("update:text");
    expect(emittedText).toBeFalsy();
  });

  it("converts dialog-parenthetical to dialog when deleting '('", async () => {
    const el: ScreenplayElement = {
      id: "el-parenthetical",
      type: "dialog-parenthetical",
      text: "(beat)",
    };
    const wrapper = mountElement(el);
    const contentDiv = wrapper.find(".editor-element__content");

    // Simulate user deleting the leading '('
    (contentDiv.element as HTMLDivElement).innerText = "beat)";
    await contentDiv.trigger("input");

    // Assert update:type is emitted to dialog
    const emittedType = wrapper.emitted("update:type");
    expect(emittedType).toBeTruthy();
    expect(emittedType![0][0]).toEqual({
      id: "el-parenthetical",
      type: "dialog",
    });

    // Assert update:text is NOT emitted
    const emittedText = wrapper.emitted("update:text");
    expect(emittedText).toBeFalsy();
  });

  it("debounces text input and flushes on blur/keydown", async () => {
    vi.useFakeTimers();
    try {
      const el: ScreenplayElement = {
        id: "el-debounce",
        type: "action",
        text: "",
      };
      const wrapper = mountElement(el);
      const contentDiv = wrapper.find(".editor-element__content");

      // 1. Simulate user typing
      (contentDiv.element as HTMLDivElement).innerText = "H";
      await contentDiv.trigger("input");
      (contentDiv.element as HTMLDivElement).innerText = "He";
      await contentDiv.trigger("input");
      (contentDiv.element as HTMLDivElement).innerText = "Hel";
      await contentDiv.trigger("input");

      // No emission yet because of debounce
      expect(wrapper.emitted("update:text")).toBeFalsy();

      // 2. Advance time by 500ms
      vi.advanceTimersByTime(500);

      // Now it should be emitted
      let emittedText = wrapper.emitted("update:text");
      expect(emittedText).toBeTruthy();
      expect(emittedText).toHaveLength(1);
      expect(emittedText![0][0]).toEqual({
        id: "el-debounce",
        text: "Hel",
      });

      // 3. Type again, then trigger blur
      (contentDiv.element as HTMLDivElement).innerText = "Hell";
      await contentDiv.trigger("input");
      expect(wrapper.emitted("update:text")).toHaveLength(1); // Still has 1 event

      await contentDiv.trigger("blur");

      // Should flush immediately on blur
      emittedText = wrapper.emitted("update:text");
      expect(emittedText).toHaveLength(2);
      expect(emittedText![1][0]).toEqual({
        id: "el-debounce",
        text: "Hell",
      });

      // 4. Type again, then trigger Keydown Enter
      (contentDiv.element as HTMLDivElement).innerText = "Hello";
      await contentDiv.trigger("input");
      expect(wrapper.emitted("update:text")).toHaveLength(2); // Still has 2 events

      await contentDiv.trigger("keydown", { key: "Enter" });

      // Should flush immediately on Enter
      emittedText = wrapper.emitted("update:text");
      expect(emittedText).toHaveLength(3);
      expect(emittedText![2][0]).toEqual({
        id: "el-debounce",
        text: "Hello",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels debounce when prop element.text is updated from parent", async () => {
    vi.useFakeTimers();
    try {
      const el: ScreenplayElement = {
        id: "el-cancel",
        type: "action",
        text: "original",
      };
      const wrapper = mountElement(el);
      const contentDiv = wrapper.find(".editor-element__content");

      // Type some text
      (contentDiv.element as HTMLDivElement).innerText = "original typed";
      await contentDiv.trigger("input");
      expect(wrapper.emitted("update:text")).toBeFalsy();

      // Parent updates the prop (e.g. from undo)
      await wrapper.setProps({
        element: {
          id: "el-cancel",
          type: "action",
          text: "undone-value",
        },
      });

      // Advance time by 500ms
      vi.advanceTimersByTime(500);

      // The debounce should have been cancelled, so no update:text is emitted
      expect(wrapper.emitted("update:text")).toBeFalsy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("demotes empty dialog to action when Enter is pressed", async () => {
    const el: ScreenplayElement = {
      id: "el-empty-dlg",
      type: "dialog",
      text: "",
    };
    const wrapper = mountElement(el);
    const contentDiv = wrapper.find(".editor-element__content");

    (contentDiv.element as HTMLDivElement).innerText = "";

    await contentDiv.trigger("keydown", { key: "Enter" });

    const emittedType = wrapper.emitted("update:type");
    expect(emittedType).toBeTruthy();
    expect(emittedType![0][0]).toEqual({
      id: "el-empty-dlg",
      type: "action",
    });
  });

  it("converts @JOHN followed by space to dialog-character", async () => {
    const el: ScreenplayElement = {
      id: "el-typing-char",
      type: "action",
      text: "",
    };
    const wrapper = mountElement(el);
    const contentDiv = wrapper.find(".editor-element__content");

    (contentDiv.element as HTMLDivElement).innerText = "@JOHN";
    overrideCaretOffset = 5;

    await contentDiv.trigger("keydown", { key: " " });

    overrideCaretOffset = null;

    const emittedType = wrapper.emitted("update:type");
    expect(emittedType).toBeTruthy();
    expect(emittedType![0][0]).toEqual({
      id: "el-typing-char",
      type: "dialog-character",
    });

    const emittedText = wrapper.emitted("update:text");
    expect(emittedText).toBeTruthy();
    expect(emittedText![0][0]).toEqual({
      id: "el-typing-char",
      text: "JOHN",
    });
  });

  it("converts alias format followed by space to dialog-character", async () => {
    const el: ScreenplayElement = {
      id: "el-typing-alias",
      type: "action",
      text: "",
    };
    const wrapper = mountElement(el);
    const contentDiv = wrapper.find(".editor-element__content");

    (contentDiv.element as HTMLDivElement).innerText = "[BOB](Robert) (cont'd)";
    overrideCaretOffset = 23;

    await contentDiv.trigger("keydown", { key: " " });

    overrideCaretOffset = null;

    const emittedType = wrapper.emitted("update:type");
    expect(emittedType).toBeTruthy();
    expect(emittedType![0][0]).toEqual({
      id: "el-typing-alias",
      type: "dialog-character",
    });

    const emittedText = wrapper.emitted("update:text");
    expect(emittedText).toBeTruthy();
    expect(emittedText![0][0]).toEqual({
      id: "el-typing-alias",
      text: "[BOB](Robert) (cont'd) ",
    });
  });

  it("converts action with @JOHN to dialog-character on Enter", async () => {
    const el: ScreenplayElement = {
      id: "el-enter-char",
      type: "action",
      text: "",
    };
    const wrapper = mountElement(el);
    const contentDiv = wrapper.find(".editor-element__content");

    (contentDiv.element as HTMLDivElement).innerText = "@JOHN";
    overrideCaretOffset = 5;

    await contentDiv.trigger("keydown", { key: "Enter" });

    overrideCaretOffset = null;

    const emittedType = wrapper.emitted("update:type");
    expect(emittedType).toBeTruthy();
    expect(emittedType![0][0]).toEqual({
      id: "el-enter-char",
      type: "dialog-character",
    });

    const emittedText = wrapper.emitted("update:text");
    expect(emittedText).toBeTruthy();
    expect(emittedText![0][0]).toEqual({
      id: "el-enter-char",
      text: "@JOHN",
    });

    const emittedSplit = wrapper.emitted("split");
    expect(emittedSplit).toBeTruthy();
    expect(emittedSplit![0][0]).toEqual({
      id: "el-enter-char",
      text1: "@JOHN",
      text2: "",
    });
  });

  it("converts action with alias to dialog-character on Enter", async () => {
    const el: ScreenplayElement = {
      id: "el-enter-alias",
      type: "action",
      text: "",
    };
    const wrapper = mountElement(el);
    const contentDiv = wrapper.find(".editor-element__content");

    (contentDiv.element as HTMLDivElement).innerText = "[BOB](Robert) (cont'd)";
    overrideCaretOffset = 23;

    await contentDiv.trigger("keydown", { key: "Enter" });

    overrideCaretOffset = null;

    const emittedType = wrapper.emitted("update:type");
    expect(emittedType).toBeTruthy();
    expect(emittedType![0][0]).toEqual({
      id: "el-enter-alias",
      type: "dialog-character",
    });

    const emittedText = wrapper.emitted("update:text");
    expect(emittedText).toBeTruthy();
    expect(emittedText![0][0]).toEqual({
      id: "el-enter-alias",
      text: "[BOB](Robert) (cont'd)",
    });

    const emittedSplit = wrapper.emitted("split");
    expect(emittedSplit).toBeTruthy();
    expect(emittedSplit![0][0]).toEqual({
      id: "el-enter-alias",
      text1: "[BOB](Robert) (cont'd)",
      text2: "",
    });
  });
});
