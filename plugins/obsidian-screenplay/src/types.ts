/**
 * Shared types, interfaces, and constants for the Obsidian Screenplay MDSP plugin.
 */

/** The result of classifying a single line of an MDSP document. */
export interface LineClassification {
  type: LineType;
}

/** All possible line types in an MDSP screenplay document. */
export type LineType =
  | "frontmatter"
  | "blank"
  | "scene-heading"
  | "scene-heading-sub"
  | "scene-transition"
  | "dialog-character"
  | "dialog"
  | "dialog-parenthetical"
  | "action"
  | "centered-action"
  | "none";

/** A character name → hex color mapping. */
export type CharacterColorMap = Map<string, string>;

/** A single character entry with name and optional color. */
export interface CharacterEntry {
  name: string;
  color: string;
}

/** The line range of the `characters:` block within frontmatter. */
export interface CharBlockRange {
  start: number;
  end: number;
}

/**
 * Maps line classification types to their corresponding CodeMirror / reading-view CSS classes.
 * Used by both the editor decoration builder and the reading-view post-processor.
 */
export const CLASSIFICATION_CSS_CLASS: Record<string, string> = {
  "scene-heading": "cm-mdsp-scene-heading",
  "scene-heading-sub": "cm-mdsp-scene-heading-sub",
  "scene-transition": "cm-mdsp-scene-transition",
  "dialog-character": "cm-mdsp-dialog-heading",
  "dialog": "cm-mdsp-dialog",
  "dialog-parenthetical": "cm-mdsp-dialog-parenthetical",
  "action": "cm-mdsp-action",
  "centered-action": "cm-mdsp-centered",
};

/**
 * Regex patterns used for matching character references in screenplay text.
 * Matches: @(Name), @Name, or [Alias](Name)
 */
export const CHARACTER_REF_REGEX = /@\(([^)]+)\)|@(\w+)|\[([^\]]+)\]\(([^)]+)\)/g;

/** Default alpha value appended to hex colors when none is specified. */
export const DEFAULT_ALPHA = "7d";

/** Maximum number of frontmatter lines to scan before giving up. */
export const MAX_FRONTMATTER_SCAN_LINES = 200;
