/**
 * Obsidian Screenplay MDSP Plugin — Entry Point
 *
 * Registers the plugin with Obsidian and wires together the modular components:
 * - Frontmatter parsing & serialization
 * - CodeMirror 6 editor decorations
 * - Reading-view markdown post-processor
 * - Custom properties panel
 *
 * @see {@link https://github.com/bbau3r/m-screend}
 */

import { Plugin, MarkdownView, TFile } from "obsidian";
import type { LineClassification } from "./types";
import { logDebug, cleanBOM } from "./utils";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter";
import { classifyFile } from "./classifier";
import { buildEditorExtension } from "./decorations";
import { createPostProcessor } from "./post-processor";
import { PropertiesPanelManager } from "./properties-panel";
import type { CharacterEntry } from "./types";

export default class ScreenplayPlugin extends Plugin {
  /** Properties panel manager instance. */
  private panelManager!: PropertiesPanelManager;

  /** Shared frontmatter cache used by the editor extension. */
  private frontmatterCache = {
    text: "",
    colors: new Map<string, string>(),
    endLine: -1,
    charRange: { start: -1, end: -1 },
  };

  /** Cache of line classifications per file. */
  private classificationsCache = new Map<string, { mtime: number; list: LineClassification[] }>();

  /** Flag to prevent panel re-injection during programmatic frontmatter saves. */
  private savingFrontmatter = false;

  async onload() {
    console.log("Loading Screenplay MDSP Plugin...");
    logDebug(this.app, "Plugin onload started");

    // Register .mdsp as a markdown file extension
    try {
      this.registerExtensions(["mdsp"], "markdown");
      logDebug(this.app, "Extensions registered successfully for mdsp");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logDebug(this.app, "Failed to register extensions: " + msg);
    }

    // Initialize the properties panel manager
    this.panelManager = new PropertiesPanelManager(
      this.app,
      (view) => this.getFrontmatter(view),
      (view, key, val) => this.saveGenericProperty(view, key, val),
      (view, authors) => this.saveAuthors(view, authors),
      (view, chars) => this.saveCharacters(view, chars),
      (file) => this.isScreenplayFile(file),
      this.savingFrontmatter,
    );

    // Register workspace events
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.updateEditorClasses();
        setTimeout(() => this.panelManager.setup(), 200);
      }),
    );
    this.registerEvent(
      this.app.metadataCache.on("changed", () => {
        this.updateEditorClasses();
        if (!this.savingFrontmatter) {
          this.panelManager.setup();
        }
      }),
    );
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        setTimeout(() => this.panelManager.setup(), 150);
      }),
    );

    // Initial setup when layout is ready
    this.app.workspace.onLayoutReady(() => {
      this.updateEditorClasses();
      setTimeout(() => this.panelManager.setup(), 500);
    });

    // Register CodeMirror 6 editor extension
    this.registerEditorExtension(
      buildEditorExtension(this.app, (f) => this.isScreenplayFile(f), this.frontmatterCache),
    );
    logDebug(this.app, "Editor extension registered successfully");

    // Register reading-view post-processor
    this.registerMarkdownPostProcessor(
      createPostProcessor(
        this.app,
        (file) => this.isScreenplayFile(file),
        (file) => this.getClassificationsForFile(file),
      ),
    );
    logDebug(this.app, "Markdown post-processor registered successfully");
  }

  onunload() {
    console.log("Unloading Screenplay MDSP Plugin...");
    this.panelManager.teardown();

    const leaves = this.app.workspace.getLeavesOfType("markdown");
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof MarkdownView) {
        view.contentEl.classList.remove("mdsp-enabled");
        view.contentEl.querySelectorAll(".mdsp-props-panel").forEach((el) => el.remove());
      }
    }
  }

  // ─── File Detection ────────────────────────────────────────────────────────

  /** Determines if a file should be treated as an MDSP screenplay. */
  isScreenplayFile(file: TFile | null): boolean {
    if (!file) return false;

    // Check file extension
    if (file.extension === "mdsp" || file.name.endsWith(".mdsp.md")) {
      return true;
    }

    // Check frontmatter properties
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter;
    if (fm) {
      if (fm.syntax === "mdsp" || fm.cssclasses === "mdsp") return true;
      if (Array.isArray(fm.cssclasses) && fm.cssclasses.includes("mdsp")) return true;
      if (fm.characters !== undefined) return true;
    }

    return false;
  }

  // ─── Editor Classes ────────────────────────────────────────────────────────

  /** Toggles the `mdsp-enabled` CSS class on editor containers. */
  private updateEditorClasses(): void {
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof MarkdownView) {
        const enabled = this.isScreenplayFile(view.file);
        view.contentEl.classList.toggle("mdsp-enabled", enabled);
      }
    }
  }

  // ─── Classifications Cache ─────────────────────────────────────────────────

  /** Returns cached line classifications for a file, recomputing if stale. */
  private async getClassificationsForFile(file: TFile): Promise<LineClassification[]> {
    const cached = this.classificationsCache.get(file.path);
    if (cached && cached.mtime === file.stat.mtime) {
      return cached.list;
    }
    const content = await this.app.vault.cachedRead(file);
    const list = classifyFile(content);
    this.classificationsCache.set(file.path, { mtime: file.stat.mtime, list });
    return list;
  }

  // ─── Frontmatter Access ────────────────────────────────────────────────────

  /** Gets frontmatter from the editor text, falling back to Obsidian's cache. */
  private getFrontmatter(view: MarkdownView): Record<string, unknown> {
    try {
      const text = view.editor.getValue();
      if (text) {
        const fm = parseFrontmatter(text);
        if (fm && Object.keys(fm).length > 0) return fm;
      }
    } catch { /* ignore */ }

    // Fallback to Obsidian's metadata cache
    const file = view.file;
    if (file) {
      const cache = this.app.metadataCache.getFileCache(file);
      return (cache?.frontmatter as Record<string, unknown>) || {};
    }
    return {};
  }

  // ─── Frontmatter Saving ────────────────────────────────────────────────────

  /**
   * Serializes and writes frontmatter back to the editor.
   * Sets a flag to prevent recursive panel re-injection during the save.
   */
  private saveFrontmatterToEditor(view: MarkdownView, fm: Record<string, unknown>): void {
    try {
      this.savingFrontmatter = true;
      this.panelManager.savingFrontmatter = true;

      const docText = view.editor.getValue();
      const lines = docText.split(/\r?\n/);

      let endIdx = -1;
      if (lines.length > 0 && cleanBOM(lines[0].trim()) === "---") {
        for (let i = 1; i < lines.length; i++) {
          if (lines[i].trim() === "---") {
            endIdx = i;
            break;
          }
        }
      }

      const newFrontmatter = serializeFrontmatter(fm);

      if (endIdx !== -1) {
        view.editor.replaceRange(newFrontmatter + "\n", { line: 0, ch: 0 }, { line: endIdx + 1, ch: 0 });
      } else {
        view.editor.replaceRange(newFrontmatter + "\n\n", { line: 0, ch: 0 });
      }
    } catch (e) {
      console.error("Failed to save frontmatter to editor:", e);
    } finally {
      this.savingFrontmatter = false;
      this.panelManager.savingFrontmatter = false;
    }
  }

  private saveGenericProperty(view: MarkdownView, key: string, newValue: string): void {
    const fm = this.getFrontmatter(view);
    fm[key] = newValue;
    this.saveFrontmatterToEditor(view, fm);
  }

  private saveCharacters(view: MarkdownView, characters: CharacterEntry[]): void {
    const fm = this.getFrontmatter(view);
    const obj: Record<string, unknown> = {};
    for (const c of characters) {
      obj[c.name] = c.color ? { color: c.color } : {};
    }
    fm.characters = obj;
    this.saveFrontmatterToEditor(view, fm);
  }

  private saveAuthors(view: MarkdownView, authors: string[]): void {
    const fm = this.getFrontmatter(view);
    fm.authors = authors;
    this.saveFrontmatterToEditor(view, fm);
  }
}
