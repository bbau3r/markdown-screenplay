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
  removeAllRanges: () => {},
  addRange: () => {},
};

vi.stubGlobal("getSelection", () => mockSelection);

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
});
