/**
 * Custom properties panel for MDSP screenplay documents.
 *
 * Replaces Obsidian's built-in properties panel with a custom one that provides:
 * - Editable generic properties (title, draft, etc.)
 * - Authors list with add/remove/edit
 * - Characters list with color swatches and inline editing
 */

import type { App, MarkdownView } from "obsidian";
import type { CharacterEntry } from "./types";
import { logDebug, focusAndSelectAll } from "./utils";

/** Properties to skip (handled separately or internal to Obsidian). */
const SKIP_PROPERTIES = new Set(["position", "cssclasses", "cssclass", "syntax", "characters", "authors"]);

/** Debounce delay (ms) for re-injecting the panel after DOM mutations. */
const PANEL_DEBOUNCE_MS = 120;

// ─── Panel Manager ───────────────────────────────────────────────────────────

/**
 * Manages the lifecycle of custom properties panels across all open markdown views.
 */
export class PropertiesPanelManager {
  private observers: MutationObserver[] = [];
  private debounces = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private app: App,
    private getFrontmatter: (view: MarkdownView) => Record<string, unknown>,
    private saveGenericProperty: (view: MarkdownView, key: string, value: string) => void,
    private saveAuthors: (view: MarkdownView, authors: string[]) => void,
    private saveCharacters: (view: MarkdownView, characters: CharacterEntry[]) => void,
    private isScreenplayFile: (file: import("obsidian").TFile | null) => boolean,
    public savingFrontmatter: boolean,
  ) {}

  /** Disconnects all mutation observers watching for DOM changes. */
  teardown(): void {
    for (const obs of this.observers) obs.disconnect();
    this.observers = [];
  }

  /**
   * Scans all open markdown leaves and sets up the properties panel
   * for any that contain screenplay files.
   */
  setup(): void {
    logDebug(this.app, "setupPropertiesPanel called");
    this.teardown();

    const leaves = this.app.workspace.getLeavesOfType("markdown");
    logDebug(this.app, `setupPropertiesPanel found ${leaves.length} markdown leaves`);

    for (const leaf of leaves) {
      const view = leaf.view as MarkdownView;
      if (!view?.file) continue;
      if (!this.isScreenplayFile(view.file)) continue;

      const contentEl = view.contentEl;
      const fm = this.getFrontmatter(view);
      this.injectPanel(contentEl, view, fm);
      this.observeForReinsertion(contentEl, view);
    }
  }

  /**
   * Watches the editor container for DOM mutations (Obsidian rebuilds)
   * and re-injects the panel when needed.
   */
  private observeForReinsertion(contentEl: HTMLElement, view: MarkdownView): void {
    const filePath = view.file?.path ?? "";
    const viewContent = contentEl.querySelector(".cm-editor")?.parentElement || contentEl;

    const observer = new MutationObserver((mutations) => {
      if (this.savingFrontmatter) return;
      if (this.areOnlyPanelMutations(mutations)) return;

      // Debounce to avoid excessive rebuilds
      const existing = this.debounces.get(filePath);
      if (existing) clearTimeout(existing);

      this.debounces.set(
        filePath,
        setTimeout(() => {
          this.debounces.delete(filePath);
          const freshFm = this.getFrontmatter(view);
          this.injectPanel(contentEl, view, freshFm);
        }, PANEL_DEBOUNCE_MS),
      );
    });

    observer.observe(viewContent, { childList: true });
    this.observers.push(observer);
  }

  /** Checks if all mutations are just our own panel being added/removed. */
  private areOnlyPanelMutations(mutations: MutationRecord[]): boolean {
    for (const mutation of mutations) {
      for (let i = 0; i < mutation.addedNodes.length; i++) {
        const node = mutation.addedNodes[i] as HTMLElement;
        if (!node.classList?.contains("mdsp-props-panel")) return false;
      }
      for (let i = 0; i < mutation.removedNodes.length; i++) {
        const node = mutation.removedNodes[i] as HTMLElement;
        if (!node.classList?.contains("mdsp-props-panel")) return false;
      }
    }
    return true;
  }

  // ─── Panel Injection ─────────────────────────────────────────────────────

  /**
   * Injects (or replaces) the custom properties panel into the editor content area.
   * Skips if the frontmatter hasn't changed or the user is actively editing the panel.
   */
  private injectPanel(contentEl: HTMLElement, view: MarkdownView, fm: Record<string, unknown>): void {
    if (!view.file) return;
    logDebug(this.app, `injectPropertiesPanel called for file: ${view.file.path}`);

    const existing = contentEl.querySelector(".mdsp-props-panel") as HTMLElement | null;
    if (existing) {
      const currentFmStr = JSON.stringify(fm);
      if (existing.dataset.fm === currentFmStr) {
        logDebug(this.app, "injectPropertiesPanel: frontmatter identical, skipping");
        return;
      }
      if (existing.contains(document.activeElement)) {
        logDebug(this.app, "injectPropertiesPanel: user is editing panel, skipping");
        return;
      }
      existing.remove();
    }

    const panel = this.buildPanel(view, fm);

    const metaContainer = contentEl.querySelector(".metadata-container");
    if (metaContainer) {
      metaContainer.parentElement!.insertBefore(panel, metaContainer);
    } else {
      contentEl.prepend(panel);
    }

    // Request CodeMirror to re-measure after panel height changes
    this.requestEditorMeasure(view);
  }

  /** Triggers a CodeMirror layout re-measure after a short delay. */
  private requestEditorMeasure(view: MarkdownView): void {
    const editorView = (view as any).editor?.cm;
    if (editorView?.requestMeasure) {
      setTimeout(() => {
        editorView.requestMeasure();
        logDebug(this.app, "Triggered requestMeasure after panel injection");
      }, 50);
    }
  }

  // ─── Panel Building ──────────────────────────────────────────────────────

  /** Builds the complete properties panel DOM tree. */
  private buildPanel(view: MarkdownView, fm: Record<string, unknown>): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "mdsp-props-panel";
    panel.dataset.fm = JSON.stringify(fm);

    // Header
    const hdr = document.createElement("div");
    hdr.className = "mdsp-props-header";
    hdr.textContent = "Properties";
    panel.appendChild(hdr);

    // Body
    const body = document.createElement("div");
    body.className = "mdsp-props-body";
    panel.appendChild(body);

    // Generic properties
    for (const [key, value] of Object.entries(fm)) {
      if (SKIP_PROPERTIES.has(key)) continue;
      this.renderGenericProperty(body, view, key, value);
    }

    // Authors and characters blocks
    this.renderAuthorsBlock(body, view, fm.authors);
    this.renderCharactersBlock(body, view, fm.characters);

    return panel;
  }

  // ─── Generic Properties ──────────────────────────────────────────────────

  private renderGenericProperty(parent: HTMLElement, view: MarkdownView, key: string, value: unknown): void {
    const row = document.createElement("div");
    row.className = "mdsp-prop-row";

    const label = document.createElement("span");
    label.className = "mdsp-prop-label";
    label.textContent = key;
    row.appendChild(label);

    if (Array.isArray(value)) {
      const tagsWrap = document.createElement("div");
      tagsWrap.className = "mdsp-prop-tags";
      for (const item of value) {
        const tag = document.createElement("span");
        tag.className = "mdsp-prop-tag";
        tag.textContent = String(item);
        tagsWrap.appendChild(tag);
      }
      row.appendChild(tagsWrap);
    } else {
      const valEl = document.createElement("span");
      valEl.className = "mdsp-prop-value";
      valEl.textContent = String(value ?? "");
      valEl.contentEditable = "true";
      valEl.spellcheck = false;

      valEl.addEventListener("blur", () => {
        const newVal = valEl.textContent?.trim() ?? "";
        if (newVal !== String(value)) {
          this.saveGenericProperty(view, key, newVal);
        }
      });
      valEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); valEl.blur(); }
      });

      row.appendChild(valEl);
    }

    parent.appendChild(row);
  }

  // ─── Authors Block ───────────────────────────────────────────────────────

  private renderAuthorsBlock(parent: HTMLElement, view: MarkdownView, authorsVal: unknown): void {
    const block = document.createElement("div");
    block.className = "mdsp-authors-block";

    const hdr = document.createElement("div");
    hdr.className = "mdsp-authors-label";
    hdr.textContent = "authors";
    block.appendChild(hdr);

    const authors = this.normalizeAuthorsValue(authorsVal);

    const list = document.createElement("div");
    list.className = "mdsp-authors-list";
    block.appendChild(list);

    const render = () => {
      list.innerHTML = "";

      for (let i = 0; i < authors.length; i++) {
        list.appendChild(this.createAuthorRow(view, authors, i, render));
      }

      list.appendChild(this.createAddButton("+ Add author", () => {
        authors.push("NEW AUTHOR");
        this.saveAuthors(view, authors);
        render();
        const last = list.querySelector(".mdsp-author-row:last-of-type .mdsp-author-name") as HTMLElement;
        if (last) focusAndSelectAll(last);
      }));
    };

    render();
    parent.appendChild(block);
  }

  /** Normalizes raw authors value into a string array. */
  private normalizeAuthorsValue(val: unknown): string[] {
    if (Array.isArray(val)) return val.filter(Boolean).map(String);
    if (typeof val === "string" && val.trim()) return [val.trim()];
    return [];
  }

  /** Creates a single author row with editable name and delete button. */
  private createAuthorRow(
    view: MarkdownView,
    authors: string[],
    index: number,
    rerender: () => void,
  ): HTMLElement {
    const row = document.createElement("div");
    row.className = "mdsp-author-row";

    const nameEl = document.createElement("span");
    nameEl.className = "mdsp-author-name";
    nameEl.textContent = authors[index];
    nameEl.contentEditable = "true";
    nameEl.spellcheck = false;

    nameEl.addEventListener("blur", () => {
      const n = nameEl.textContent?.trim() || "";
      if (n && n !== authors[index]) {
        authors[index] = n;
        this.saveAuthors(view, authors);
      }
    });
    nameEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); nameEl.blur(); }
    });

    row.appendChild(nameEl);
    row.appendChild(this.createDeleteButton(() => {
      authors.splice(index, 1);
      this.saveAuthors(view, authors);
      rerender();
    }));

    return row;
  }

  // ─── Characters Block ────────────────────────────────────────────────────

  private renderCharactersBlock(parent: HTMLElement, view: MarkdownView, charsObj: unknown): void {
    const block = document.createElement("div");
    block.className = "mdsp-chars-block";

    const hdr = document.createElement("div");
    hdr.className = "mdsp-chars-label";
    hdr.textContent = "characters";
    block.appendChild(hdr);

    const characters = this.normalizeCharactersValue(charsObj);

    const list = document.createElement("div");
    list.className = "mdsp-chars-list";
    block.appendChild(list);

    const render = () => {
      list.innerHTML = "";

      for (let i = 0; i < characters.length; i++) {
        list.appendChild(this.createCharacterRow(view, characters, i, render));
      }

      list.appendChild(this.createAddButton("+ Add character", () => {
        characters.push({ name: "NEW CHARACTER", color: "" });
        this.saveCharacters(view, characters);
        render();
        const last = list.querySelector(".mdsp-char-row:last-of-type .mdsp-char-name") as HTMLElement;
        if (last) focusAndSelectAll(last);
      }));
    };

    render();
    parent.appendChild(block);
  }

  /** Normalizes raw characters value into a CharacterEntry array. */
  private normalizeCharactersValue(val: unknown): CharacterEntry[] {
    const chars: CharacterEntry[] = [];
    if (typeof val !== "object" || Array.isArray(val) || val === null) return chars;

    for (const [key, v] of Object.entries(val as Record<string, unknown>)) {
      if (v && typeof v === "object" && (v as Record<string, unknown>).color) {
        chars.push({
          name: key,
          color: String((v as Record<string, unknown>).color).replace(/^['"]|['"]$/g, ""),
        });
      } else if (typeof v === "string") {
        chars.push({ name: key, color: v.replace(/^['"]|['"]$/g, "") });
      } else {
        chars.push({ name: key, color: "" });
      }
    }
    return chars;
  }

  /** Creates a single character row with color bubble, editable name, and delete button. */
  private createCharacterRow(
    view: MarkdownView,
    characters: CharacterEntry[],
    index: number,
    rerender: () => void,
  ): HTMLElement {
    const c = characters[index];
    const row = document.createElement("div");
    row.className = "mdsp-char-row";

    // Color bubble
    const bubble = document.createElement("span");
    bubble.className = "mdsp-char-bubble";
    if (c.color) {
      bubble.style.backgroundColor = c.color;
    } else {
      bubble.classList.add("mdsp-char-bubble-empty");
    }

    // Hidden color picker
    const picker = document.createElement("input");
    picker.type = "color";
    picker.className = "mdsp-char-picker";
    picker.value = this.toHex6(c.color);

    bubble.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); picker.click(); });
    picker.addEventListener("input", () => {
      bubble.style.backgroundColor = picker.value + this.getAlphaSuffix(c.color);
    });
    picker.addEventListener("change", () => {
      characters[index].color = picker.value + this.getAlphaSuffix(c.color);
      this.saveCharacters(view, characters);
      bubble.style.backgroundColor = characters[index].color;
      bubble.classList.remove("mdsp-char-bubble-empty");
    });

    row.appendChild(bubble);
    row.appendChild(picker);

    // Editable name
    const nameEl = document.createElement("span");
    nameEl.className = "mdsp-char-name";
    nameEl.textContent = c.name;
    nameEl.contentEditable = "true";
    nameEl.spellcheck = false;

    nameEl.addEventListener("blur", () => {
      const n = nameEl.textContent?.trim() || "";
      if (n && n !== c.name) {
        characters[index].name = n;
        this.saveCharacters(view, characters);
      }
    });
    nameEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); nameEl.blur(); }
    });

    row.appendChild(nameEl);
    row.appendChild(this.createDeleteButton(() => {
      characters.splice(index, 1);
      this.saveCharacters(view, characters);
      rerender();
    }));

    return row;
  }

  // ─── Shared UI Helpers ───────────────────────────────────────────────────

  /** Creates a × delete button. */
  private createDeleteButton(onClick: () => void): HTMLElement {
    const del = document.createElement("span");
    del.className = "mdsp-char-del";
    del.innerHTML = "&times;";
    del.title = "Remove";
    del.addEventListener("click", onClick);
    return del;
  }

  /** Creates an "+ Add ..." button. */
  private createAddButton(text: string, onClick: () => void): HTMLElement {
    const btn = document.createElement("div");
    btn.className = text.includes("author") ? "mdsp-author-add-btn" : "mdsp-char-add-btn";
    btn.textContent = text;
    btn.addEventListener("click", onClick);
    return btn;
  }

  /** Normalizes a hex color to 6-char format for the color picker. */
  private toHex6(color: string): string {
    if (!color?.startsWith("#")) return "#808080";
    return color.length >= 7 ? color.slice(0, 7) : color;
  }

  /** Extracts or defaults the alpha channel suffix. */
  private getAlphaSuffix(color: string): string {
    if (color?.startsWith("#") && color.length === 9) return color.slice(7);
    return "7D";
  }
}
