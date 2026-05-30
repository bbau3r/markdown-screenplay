/**
 * Line classification for MDSP screenplay documents.
 *
 * Classifies each line of a screenplay document into a semantic type
 * (scene heading, dialog, action, transition, etc.) based on MDSP syntax rules.
 *
 * ## MDSP Syntax Summary:
 * - `# heading`        → Scene heading (single #) or sub-scene heading (##, ###, etc.)
 * - `: text`           → Scene transition (right-aligned, colon prefix)
 * - `> text <`         → Centered action (angle bracket prefix AND suffix)
 * - `@Name` / `[A](B)` → Character name, starts a dialog block if followed by non-blank
 * - `(text)`           → Dialog parenthetical (when inside a dialog block)
 * - Everything else    → Action
 */

import type { LineClassification, LineType } from "./types";

/** Active parsing state while classifying lines within a contiguous block. */
type ActiveState = "none" | "scene" | "transition" | "dialog-character" | "dialog" | "action";

/**
 * Classifies every line of a full MDSP document into its semantic type.
 * Returns an array with one entry per line (0-indexed to match the text lines).
 */
export function classifyFile(text: string): LineClassification[] {
  const lines = text.split(/\r?\n/);
  const classifications: LineClassification[] = [];

  let inFrontmatter = false;
  let activeState: ActiveState = "none";
  let isSubScene = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // ── Frontmatter boundaries ──
    if (trimmed === "---") {
      if (i === 0 || inFrontmatter) {
        inFrontmatter = !inFrontmatter;
        classifications.push({ type: "frontmatter" });
        continue;
      }
    }

    if (inFrontmatter) {
      classifications.push({ type: "frontmatter" });
      continue;
    }

    // ── Blank lines reset the active state ──
    if (trimmed.length === 0) {
      classifications.push({ type: "blank" });
      activeState = "none";
      continue;
    }

    // ── Determine the block type on the first non-blank line ──
    if (activeState === "none") {
      activeState = detectBlockStart(trimmed, lines[i + 1]);
      isSubScene = activeState === "scene" && !trimmed.startsWith("# ");
    }

    // ── Classify the current line based on active state ──
    classifications.push({ type: resolveLineType(activeState, trimmed, isSubScene) });

    // After the character heading line, switch to dialog body
    if (activeState === "dialog-character") {
      activeState = "dialog";
    }
  }

  return classifications;
}

/**
 * Detects what kind of block starts with this line.
 */
function detectBlockStart(trimmed: string, nextLine: string | undefined): ActiveState {
  // Scene headings: `# text`, `## text`, etc.
  if (/^#{1,6} /.test(trimmed)) {
    return "scene";
  }

  // Scene transitions: `: text`
  if (trimmed.startsWith(": ")) {
    return "transition";
  }

  // Character names: `@Name` or `[Alias](Name)` with optional parenthetical suffix
  if (trimmed.startsWith("@") || /^\[.+?\]\(.+?\)(?:\s*\(.+?\))?$/.test(trimmed)) {
    const isNextLineBlank = !nextLine || nextLine.trim().length === 0;
    return isNextLineBlank ? "action" : "dialog-character";
  }

  return "action";
}

/**
 * Resolves the final line type from the current active state.
 */
function resolveLineType(activeState: ActiveState, trimmed: string, isSubScene: boolean): LineType {
  switch (activeState) {
    case "scene":
      return isSubScene ? "scene-heading-sub" : "scene-heading";
    case "transition":
      return "scene-transition";
    case "dialog-character":
      return "dialog-character";
    case "dialog":
      return trimmed.startsWith("(") ? "dialog-parenthetical" : "dialog";
    case "action":
    default:
      // Centered action: `> text <`
      if (trimmed.startsWith(">") && trimmed.endsWith("<")) {
        return "centered-action";
      }
      return "action";
  }
}
