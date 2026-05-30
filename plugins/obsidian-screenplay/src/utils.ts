/**
 * Shared utility functions for the Obsidian Screenplay MDSP plugin.
 */

import type { App } from "obsidian";
import type { EditorView } from "@codemirror/view";

/**
 * Logs a debug message to the console with a plugin-specific prefix.
 */
export function logDebug(app: App, msg: string): void {
  console.debug(`[Screenplay Debug] ${msg}`);
}

/**
 * Strips a leading BOM (Byte Order Mark) character from a string, if present.
 * Common when reading files saved by certain editors on Windows.
 */
export function cleanBOM(str: string): string {
  if (str && str.charCodeAt(0) === 0xFEFF) {
    return str.slice(1);
  }
  return str;
}

/**
 * Parses a raw YAML scalar value string into its appropriate JS type.
 * Handles quoted strings, booleans, null, and numbers.
 */
export function parseScalarValue(val: string): string | boolean | number | null {
  val = val.trim();
  if (!val) return "";

  // Strip surrounding quotes
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1);
  }

  const lower = val.toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;
  if (lower === "null") return null;

  const num = Number(val);
  if (!isNaN(num)) return num;

  return val;
}

/**
 * Strips surrounding single or double quotes from a string.
 * e.g. `"'#FF0000'" → "#FF0000"`
 */
export function stripQuotes(val: string): string {
  return val.replace(/^['"]|['"]$/g, "");
}

/**
 * Checks whether the editor cursor (any selection range) is on the given line number.
 */
export function isCursorOnLine(view: EditorView, lineNumber: number): boolean {
  return view.state.selection.ranges.some((r) => {
    try {
      const fromLine = view.state.doc.lineAt(r.from).number;
      const toLine = view.state.doc.lineAt(r.to).number;
      return fromLine === toLine && fromLine === lineNumber;
    } catch {
      return false;
    }
  });
}

/**
 * Checks whether the editor cursor overlaps a specific character range [from, to].
 */
export function isCursorInRange(view: EditorView, from: number, to: number): boolean {
  return view.state.selection.ranges.some((r) => {
    try {
      const fromLine = view.state.doc.lineAt(r.from).number;
      const toLine = view.state.doc.lineAt(r.to).number;
      return fromLine === toLine && r.from <= to && r.to >= from;
    } catch {
      return false;
    }
  });
}

/**
 * Normalizes a hex color string to a 6-character hex (without alpha).
 * Returns `"#808080"` as fallback if the input is not a valid hex color.
 */
export function normalizeHex6(color: string): string {
  const fallback = "#808080";
  if (!color || !color.startsWith("#")) return fallback;
  if (color.length === 9) return color.slice(0, 7); // strip alpha
  if (color.length === 7) return color;
  return fallback;
}

/**
 * Builds a final hex color string by combining a 6-char hex with an alpha channel.
 * Preserves the original alpha if the original color had one, otherwise uses the default.
 */
export function buildHexWithAlpha(hex6: string, originalColor: string, defaultAlpha = "7d"): string {
  if (originalColor && originalColor.startsWith("#") && originalColor.length === 9) {
    return hex6 + originalColor.slice(7, 9);
  }
  return hex6 + defaultAlpha;
}

/**
 * Focuses an element and selects all its text content.
 * Used by the properties panel for inline-editable fields.
 */
export function focusAndSelectAll(el: HTMLElement): void {
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}
