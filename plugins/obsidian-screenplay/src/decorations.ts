/**
 * CodeMirror 6 editor extension for MDSP screenplay documents.
 *
 * Provides real-time decorations in the editor view:
 * - Frontmatter property styling (key/value highlighting, divider lines)
 * - Character entries in frontmatter (color bubbles, name highlighting, syntax hiding)
 * - Screenplay line formatting (scene headings, dialog, transitions, etc.)
 * - Character reference highlighting (@Name, [Alias](Name))
 * - Syntax prefix hiding when cursor is not on the line
 */

import type { App } from "obsidian";
import type { Text } from "@codemirror/state";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import type { LineClassification, CharacterColorMap, CharBlockRange } from "./types";
import { CLASSIFICATION_CSS_CLASS, CHARACTER_REF_REGEX } from "./types";
import { classifyFile } from "./classifier";
import { parseCharacterColorsFromDoc, getEndFrontmatterLine, getCharactersBlockRange, extractFrontmatterText } from "./frontmatter";
import { ColorBubbleWidget } from "./widgets";
import { logDebug, cleanBOM, isCursorOnLine, isCursorInRange } from "./utils";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Cached frontmatter state to avoid re-parsing on every keystroke. */
interface FrontmatterCache {
  text: string;
  colors: CharacterColorMap;
  endLine: number;
  charRange: CharBlockRange;
}

// ─── Extension Builder ───────────────────────────────────────────────────────

/**
 * Builds the CodeMirror 6 editor extension for the MDSP plugin.
 *
 * @param app - The Obsidian App instance
 * @param isScreenplayFile - Function to check if the active file is a screenplay
 * @param frontmatterCache - Mutable cache object shared with the plugin for frontmatter state
 */
export function buildEditorExtension(
  app: App,
  isScreenplayFile: (file: import("obsidian").TFile | null) => boolean,
  frontmatterCache: FrontmatterCache,
) {
  return [
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;
        private classificationCache = new WeakMap<Text, LineClassification[]>();

        constructor(view: EditorView) {
          this.decorations = this.buildDecorations(view);
        }

        update(update: ViewUpdate) {
          if (update.docChanged || update.viewportChanged || update.selectionSet) {
            this.decorations = this.buildDecorations(update.view);
          }
        }

        /** Returns cached classifications for a document, computing if needed. */
        private getClassifications(doc: Text): LineClassification[] {
          let cached = this.classificationCache.get(doc);
          if (!cached) {
            cached = classifyFile(doc.toString());
            this.classificationCache.set(doc, cached);
          }
          return cached;
        }

        /** Main decoration builder — coordinates all decoration layers. */
        private buildDecorations(view: EditorView): DecorationSet {
          logDebug(app, `buildDecorations started for doc length=${view.state.doc.length}`);

          try {
            if (!this.shouldDecorate(view, isScreenplayFile)) {
              return Decoration.none;
            }

            this.refreshFrontmatterCache(view, frontmatterCache);

            const builder = new RangeSetBuilder<Decoration>();
            const classifications = this.getClassifications(view.state.doc);

            for (const { from, to } of view.visibleRanges) {
              const startLine = view.state.doc.lineAt(from).number;
              const endLine = view.state.doc.lineAt(to).number;

              for (let l = startLine; l <= endLine; l++) {
                const line = view.state.doc.line(l);

                if (this.isFrontmatterLine(l, frontmatterCache.endLine)) {
                  decorateFrontmatterLine(view, builder, line, l, frontmatterCache);
                  continue;
                }

                const classification = classifications[l - 1];
                if (classification) {
                  decorateScreenplayLine(view, builder, line, l, classification);
                }

                decorateCharacterReferences(view, builder, line, frontmatterCache.colors);
              }
            }

            const result = builder.finish();
            logDebug(app, `buildDecorations finished with size=${result.size}`);
            return result as DecorationSet;
          } catch (err: unknown) {
            const msg = err instanceof Error ? `${err.message}\nStack: ${err.stack}` : String(err);
            logDebug(app, `ERROR in buildDecorations: ${msg}`);
            return Decoration.none;
          }
        }

        /** Determines whether the current document should receive MDSP decorations. */
        private shouldDecorate(
          view: EditorView,
          isScreenplay: (file: import("obsidian").TFile | null) => boolean,
        ): boolean {
          let activeFileRef: import("obsidian").TFile | null = null;
          try {
            activeFileRef = app.workspace.getActiveFile();
          } catch { /* ignore */ }

          if (isScreenplay(activeFileRef)) return true;

          // Fallback: scan the doc for a characters: block
          return this.hasCharactersBlock(view);
        }

        /** Quick scan of the document for a `characters:` frontmatter key. */
        private hasCharactersBlock(view: EditorView): boolean {
          try {
            const doc = view.state.doc;
            if (doc.length === 0 || cleanBOM(doc.line(1).text.trim()) !== "---") return false;

            const maxLines = Math.min(doc.lines, 200);
            for (let i = 2; i <= maxLines; i++) {
              const line = doc.line(i).text.trim();
              if (line === "---") break;
              if (/^characters\s*:/i.test(line)) return true;
            }
          } catch { /* ignore */ }
          return false;
        }

        /** Checks if a line number falls within the frontmatter boundaries. */
        private isFrontmatterLine(lineNumber: number, endFrontmatterLine: number): boolean {
          return endFrontmatterLine !== -1 && lineNumber >= 1 && lineNumber <= endFrontmatterLine;
        }

        /** Updates the shared frontmatter cache if the frontmatter text has changed. */
        private refreshFrontmatterCache(view: EditorView, cache: FrontmatterCache): void {
          const currentText = extractFrontmatterText(view.state.doc);
          if (currentText !== cache.text) {
            cache.text = currentText;
            cache.colors = parseCharacterColorsFromDoc(view.state.doc);
            cache.endLine = getEndFrontmatterLine(view.state.doc);
            cache.charRange = getCharactersBlockRange(view.state.doc);
            logDebug(app, `Frontmatter changed, re-parsed. Colors count=${cache.colors.size}`);
          }
        }
      },
      {
        decorations: (v) => v.decorations,
      },
    ),

    // Click handler: prevent Obsidian from following character reference links
    EditorView.domEventHandlers({
      click(event, view) {
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos !== null && isPosInCharacterMatch(pos, view.state.doc, frontmatterCache.colors)) {
          event.preventDefault();
          event.stopPropagation();
          return true;
        }
        return false;
      },
    }),
  ];
}

// ─── Frontmatter Line Decorations ────────────────────────────────────────────

/**
 * Applies decorations to a single line within the frontmatter block.
 * Handles property dividers, character entries (with color bubbles), and generic key-value pairs.
 */
function decorateFrontmatterLine(
  view: EditorView,
  builder: RangeSetBuilder<Decoration>,
  line: { from: number; to: number; text: string },
  lineNumber: number,
  cache: FrontmatterCache,
): void {
  const text = line.text;

  // Line class: divider (--- lines) or property line
  const lineClass = (lineNumber === 1 || lineNumber === cache.endLine)
    ? "cm-mdsp-property-divider"
    : "cm-mdsp-property-line";

  builder.add(line.from, line.from, Decoration.line({ attributes: { class: lineClass } }));

  // Character entries get special treatment
  const { charRange } = cache;
  const isInCharacters = charRange.start !== -1 && charRange.end !== -1
    && lineNumber >= charRange.start && lineNumber <= charRange.end;

  if (isInCharacters) {
    const decorated = decorateCharacterEntry(view, builder, line, lineNumber);
    if (decorated) return;
  }

  // Fallback: generic key-value property styling
  decorateGenericProperty(builder, line);
}

/**
 * Decorates a character entry line within the `characters:` block.
 * Handles 4 variants:
 *   1. List item with color:    `- '#FF2E2E7D' KAYAK KILLER`
 *   2. Map entry with color:    `KAYAK KILLER: '#FF2E2E7D'`
 *   3. List item without color: `- KAYAK KILLER`
 *   4. Map entry without color: `KAYAK KILLER:`
 *
 * Returns true if the line was handled, false otherwise.
 */
function decorateCharacterEntry(
  view: EditorView,
  builder: RangeSetBuilder<Decoration>,
  line: { from: number; to: number; text: string },
  lineNumber: number,
): boolean {
  const text = line.text;
  const cursorOnLine = isCursorOnLine(view, lineNumber);
  const colorMatch = text.match(/#([a-fA-F0-9]{3,8})/);

  // Case 1: List item with color — `- '#FF2E2E7D' KAYAK KILLER`
  const listColorMatch = text.match(/^(\s*-\s*)(['"]?#?[a-fA-F0-9]{3,8}['"]?)\s+(.+)$/);
  if (listColorMatch) {
    const prefixLen = listColorMatch[1].length;
    const colorLen = listColorMatch[2].length;
    const nameStart = prefixLen + colorLen + 1;

    if (!cursorOnLine) {
      builder.add(line.from, line.from + nameStart, Decoration.replace({}));
    }
    if (colorMatch) {
      addColorBubble(builder, line.from + nameStart, colorMatch[0], view);
    }
    addValueMark(builder, line.from + nameStart, line.to);
    return true;
  }

  // Case 2: Map entry with color — `KAYAK KILLER: '#FF2E2E7D'`
  const mapColorMatch = text.match(/^(\s*)([^:]+)\s*:\s*(['"]?#?[a-fA-F0-9]{3,8}['"]?)\s*$/);
  if (mapColorMatch) {
    const prefixLen = mapColorMatch[1].length;
    const keyLen = mapColorMatch[2].length;

    if (colorMatch) {
      addColorBubble(builder, line.from + prefixLen, colorMatch[0], view);
    }
    addValueMark(builder, line.from + prefixLen, line.from + prefixLen + keyLen);

    const colonIndex = text.indexOf(":");
    if (!cursorOnLine) {
      builder.add(line.from + colonIndex, line.to, Decoration.replace({}));
    } else {
      builder.add(
        line.from + colonIndex + 1, line.to,
        Decoration.mark({ class: "cm-mdsp-property-key" }),
      );
    }
    return true;
  }

  // Case 3: List item without color — `- KAYAK KILLER`
  const listNoColorMatch = text.match(/^(\s*-\s*)(.+)$/);
  if (listNoColorMatch) {
    const prefixLen = listNoColorMatch[1].length;
    const name = listNoColorMatch[2].trim();

    if (name && name !== "---") {
      if (!cursorOnLine) {
        builder.add(line.from, line.from + prefixLen, Decoration.replace({}));
      }
      addColorBubble(builder, line.from + prefixLen, "", view);
      addValueMark(builder, line.from + prefixLen, line.to);
      return true;
    }
  }

  // Case 4: Map entry without color — `KAYAK KILLER:`
  const mapNoColorMatch = text.match(/^(\s*)([^:]+)\s*:\s*$/);
  if (mapNoColorMatch) {
    const prefixLen = mapNoColorMatch[1].length;
    const keyLen = mapNoColorMatch[2].length;
    const name = mapNoColorMatch[2].trim();

    if (name && name !== "characters" && name !== "---") {
      addColorBubble(builder, line.from + prefixLen, "", view);
      addValueMark(builder, line.from + prefixLen, line.from + prefixLen + keyLen);

      const colonIndex = text.indexOf(":");
      if (!cursorOnLine) {
        builder.add(line.from + colonIndex, line.to, Decoration.replace({}));
      }
      return true;
    }
  }

  return false;
}

/** Adds a color bubble widget decoration at the given position. */
function addColorBubble(
  builder: RangeSetBuilder<Decoration>,
  pos: number,
  color: string,
  view: EditorView,
): void {
  builder.add(pos, pos, Decoration.widget({
    widget: new ColorBubbleWidget(color, view),
    side: -1,
  }));
}

/** Adds a property-value mark decoration over a range. */
function addValueMark(builder: RangeSetBuilder<Decoration>, from: number, to: number): void {
  builder.add(from, to, Decoration.mark({ class: "cm-mdsp-property-value" }));
}

/** Decorates generic (non-character) key-value property lines in frontmatter. */
function decorateGenericProperty(
  builder: RangeSetBuilder<Decoration>,
  line: { from: number; to: number; text: string },
): void {
  const text = line.text;

  const keyValMatch = text.match(/^(\s*-?\s*)([a-zA-Z0-9_-]+)\s*:(.*)$/);
  if (keyValMatch) {
    const prefixLen = keyValMatch[1].length;
    const keyLen = keyValMatch[2].length;

    builder.add(
      line.from + prefixLen,
      line.from + prefixLen + keyLen + 1,
      Decoration.mark({ class: "cm-mdsp-property-key" }),
    );

    if (keyValMatch[3].trim().length > 0) {
      addValueMark(builder, line.from + prefixLen + keyLen + 1, line.to);
    }
  } else {
    const listMatch = text.match(/^(\s*-\s*)(.+)$/);
    if (listMatch) {
      addValueMark(builder, line.from + listMatch[1].length, line.to);
    }
  }
}

// ─── Screenplay Line Decorations ─────────────────────────────────────────────

/**
 * Applies decorations to a single screenplay content line (outside frontmatter).
 * Adds the appropriate CSS class and optionally hides formatting prefixes.
 */
function decorateScreenplayLine(
  view: EditorView,
  builder: RangeSetBuilder<Decoration>,
  line: { from: number; to: number; text: string },
  lineNumber: number,
  classification: LineClassification,
): void {
  const cssClass = CLASSIFICATION_CSS_CLASS[classification.type];
  if (!cssClass) return;

  builder.add(line.from, line.from, Decoration.line({ attributes: { class: cssClass } }));

  // Hide formatting prefixes when cursor is not on this line
  if (!isCursorOnLine(view, lineNumber)) {
    hideSyntaxPrefix(builder, line, classification.type);
  }
}

/**
 * Hides MDSP syntax prefixes/suffixes via replace decorations.
 * `# ` for scene headings, `: ` for transitions, `@` for characters, etc.
 */
function hideSyntaxPrefix(
  builder: RangeSetBuilder<Decoration>,
  line: { from: number; to: number; text: string },
  type: string,
): void {
  const text = line.text;

  if (type === "scene-heading" || type === "scene-heading-sub") {
    const match = text.match(/^#+\s*/);
    if (match) builder.add(line.from, line.from + match[0].length, Decoration.replace({}));
  } else if (type === "scene-transition") {
    const match = text.match(/^:\s*/);
    if (match) builder.add(line.from, line.from + match[0].length, Decoration.replace({}));
  } else if (type === "dialog-character") {
    if (text.startsWith("@")) builder.add(line.from, line.from + 1, Decoration.replace({}));
  } else if (type === "centered-action") {
    const matchStart = text.match(/^:\s*/);
    const matchEnd = text.match(/\s*:$/);
    if (matchStart) builder.add(line.from, line.from + matchStart[0].length, Decoration.replace({}));
    if (matchEnd && line.to - matchEnd[0].length > line.from) {
      builder.add(line.to - matchEnd[0].length, line.to, Decoration.replace({}));
    }
  }
}

// ─── Character Reference Decorations ─────────────────────────────────────────

/**
 * Finds and decorates character references within a line of text.
 * Handles `@Name`, `@(Name)`, and `[Alias](Name)` syntax.
 *
 * When the cursor is NOT on the match:
 * - Hides the formatting syntax (@, parentheses, brackets)
 * - Highlights the visible name with the character's color
 *
 * When the cursor IS on the match:
 * - Applies a neutral "active" class to prevent Obsidian link behavior
 */
function decorateCharacterReferences(
  view: EditorView,
  builder: RangeSetBuilder<Decoration>,
  line: { from: number; to: number; text: string },
  colors: CharacterColorMap,
): void {
  const text = line.text;
  const regex = new RegExp(CHARACTER_REF_REGEX.source, CHARACTER_REF_REGEX.flags);
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const fullMatch = match[0];
    const matchStart = line.from + match.index;
    const matchEnd = matchStart + fullMatch.length;

    const { characterName, prefixLen, suffixLen } = parseCharacterMatch(match, fullMatch);
    if (!characterName) continue;

    const color = colors.get(characterName.trim().toLowerCase());
    if (!color) continue;

    if (!isCursorInRange(view, matchStart, matchEnd)) {
      // Hide prefix syntax
      if (prefixLen > 0) {
        builder.add(matchStart, matchStart + prefixLen, Decoration.replace({}));
      }

      // Highlight the visible name
      builder.add(
        matchStart + prefixLen,
        matchEnd - suffixLen,
        Decoration.mark({
          attributes: { style: `background-color: ${color};` },
          class: "cm-mdsp-character-highlight",
        }),
      );

      // Hide suffix syntax
      if (suffixLen > 0) {
        builder.add(matchEnd - suffixLen, matchEnd, Decoration.replace({}));
      }
    } else {
      // Cursor is on this match — apply active class only
      builder.add(matchStart, matchEnd, Decoration.mark({ class: "cm-mdsp-character-active" }));
    }
  }
}

/**
 * Extracts character name and syntax prefix/suffix lengths from a regex match.
 */
function parseCharacterMatch(
  match: RegExpExecArray,
  fullMatch: string,
): { characterName: string; prefixLen: number; suffixLen: number } {
  if (match[1]) {
    // @(character name)
    return { characterName: match[1], prefixLen: 2, suffixLen: 1 };
  }
  if (match[2]) {
    // @character
    return { characterName: match[2], prefixLen: 1, suffixLen: 0 };
  }
  if (match[4]) {
    // [alias](character name)
    const alias = match[3];
    return {
      characterName: match[4],
      prefixLen: 1, // "["
      suffixLen: fullMatch.length - 1 - alias.length, // "](name)"
    };
  }
  return { characterName: "", prefixLen: 0, suffixLen: 0 };
}

// ─── Click Handler Helper ────────────────────────────────────────────────────

/**
 * Checks if a document position falls inside a character reference match.
 * Used by the click handler to prevent Obsidian from following character links.
 */
function isPosInCharacterMatch(pos: number, doc: Text, colors: CharacterColorMap): boolean {
  if (pos < 0 || pos > doc.length) return false;
  try {
    const line = doc.lineAt(pos);
    const regex = new RegExp(CHARACTER_REF_REGEX.source, CHARACTER_REF_REGEX.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line.text)) !== null) {
      const matchStart = line.from + match.index;
      const matchEnd = matchStart + match[0].length;
      if (pos < matchStart || pos > matchEnd) continue;

      const characterName = match[1] || match[2] || match[4] || "";
      if (characterName && colors.has(characterName.trim().toLowerCase())) {
        return true;
      }
    }
  } catch { /* ignore */ }
  return false;
}
