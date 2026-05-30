/**
 * Frontmatter parsing and serialization for the MDSP plugin.
 *
 * Consolidates what were previously 3 separate parsing paths into a unified module:
 * - Full frontmatter parsing (for properties panel)
 * - Character color extraction (for editor decorations)
 * - Character color extraction from Obsidian's metadata cache (for reading view)
 */

import type { Text } from "@codemirror/state";
import type { CharBlockRange, CharacterColorMap } from "./types";
import { cleanBOM, parseScalarValue, stripQuotes } from "./utils";
import { MAX_FRONTMATTER_SCAN_LINES } from "./types";

// ─── Full Frontmatter Parsing ────────────────────────────────────────────────

/**
 * Parses YAML-like frontmatter from raw document text.
 * Handles the `characters:` block with special care for its nested structure.
 *
 * This is a custom parser (not a full YAML parser) designed to handle
 * the specific subset of YAML used in MDSP frontmatter.
 */
export function parseFrontmatter(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return result;

  const firstLine = cleanBOM(lines[0].trim());
  if (firstLine !== "---") return result;

  // Find closing ---
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) return result;

  let currentKey = "";
  let inCharacters = false;
  let currentCharacterName = "";

  for (let i = 1; i < endIdx; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    const indent = line.length - line.trimStart().length;

    // Top-level key
    if (indent === 0) {
      const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*:(.*)$/);
      if (match) {
        currentKey = match[1].trim();
        const valuePart = match[2].trim();
        inCharacters = currentKey === "characters";

        if (inCharacters) {
          result[currentKey] = {};
        } else if (valuePart) {
          result[currentKey] = parseScalarValue(valuePart);
        } else {
          result[currentKey] = null;
        }
        continue;
      }
    }

    // Inside the characters block
    if (inCharacters) {
      parseCharacterLine(result, line, trimmed, indent, currentCharacterName, (name) => {
        currentCharacterName = name;
      });
      continue;
    }

    // Inside a generic nested block
    if (currentKey) {
      parseGenericNestedLine(result, currentKey, trimmed);
    }
  }

  return result;
}

/**
 * Parses a single line within the `characters:` block of frontmatter.
 * Handles both list-style (`- color name`) and map-style (`name: color`) entries.
 */
function parseCharacterLine(
  result: Record<string, unknown>,
  line: string,
  trimmed: string,
  indent: number,
  currentCharacterName: string,
  setCurrentName: (name: string) => void,
): void {
  const characters = result.characters as Record<string, unknown>;

  if (trimmed.startsWith("-")) {
    // List item: `- '#FF2E2E7D' KAYAK KILLER` or `- KAYAK KILLER`
    const item = trimmed.substring(1).trim();
    const colorMatch = item.match(/^(['"]?#?[a-fA-F0-9]{3,8}['"]?)\s+(.+)$/);
    if (colorMatch) {
      const color = stripQuotes(colorMatch[1]);
      const name = colorMatch[2].trim();
      characters[name] = { color };
    } else {
      characters[item] = {};
    }
    return;
  }

  // Key-value: `name: value` or `name:`
  const colonMatch = trimmed.match(/^([^:]+)\s*:(.*)$/);
  if (!colonMatch) return;

  const key = colonMatch[1].trim();
  const val = colonMatch[2].trim();

  if (indent === 2) {
    // Character name entry
    setCurrentName(key);
    if (val) {
      characters[key] = parseScalarValue(val);
    } else {
      characters[key] = {};
    }
  } else if (indent > 2 && currentCharacterName) {
    // Nested property of a character (e.g. `color: #FF0000`)
    if (typeof characters[currentCharacterName] !== "object") {
      characters[currentCharacterName] = {};
    }
    const charObj = characters[currentCharacterName] as Record<string, unknown>;
    charObj[key] = key === "color" ? stripQuotes(val) : parseScalarValue(val);
  }
}

/**
 * Parses a single line within a generic (non-characters) nested block.
 */
function parseGenericNestedLine(
  result: Record<string, unknown>,
  currentKey: string,
  trimmed: string,
): void {
  if (trimmed.startsWith("-")) {
    if (!Array.isArray(result[currentKey])) {
      result[currentKey] = [];
    }
    (result[currentKey] as unknown[]).push(parseScalarValue(trimmed.substring(1).trim()));
  } else {
    const match = trimmed.match(/^([^:]+)\s*:(.*)$/);
    if (match) {
      const subKey = match[1].trim();
      const subVal = match[2].trim();
      if (result[currentKey] === null || typeof result[currentKey] !== "object") {
        result[currentKey] = {};
      }
      (result[currentKey] as Record<string, unknown>)[subKey] = parseScalarValue(subVal);
    }
  }
}

// ─── Character Color Extraction ──────────────────────────────────────────────

/**
 * Extracts character name → color mappings from a CodeMirror `Text` document.
 * Scans the frontmatter `characters:` block directly from the document for
 * instant highlighting without waiting for Obsidian's metadata cache.
 *
 * All character names are lowercased for case-insensitive matching.
 */
export function parseCharacterColorsFromDoc(doc: Text): CharacterColorMap {
  const colors: CharacterColorMap = new Map();
  if (doc.length === 0) return colors;

  try {
    const firstLine = cleanBOM(doc.line(1).text.trim());
    if (firstLine !== "---") return colors;

    let inCharacters = false;
    let currentName = "";
    let currentColor = "";

    const commitCharacter = () => {
      const cleanName = stripQuotes(currentName.trim()).toLowerCase();
      const cleanColor = stripQuotes(currentColor.trim());
      if (cleanName && cleanColor) {
        colors.set(cleanName, cleanColor);
      }
    };

    for (let i = 2; i <= doc.lines; i++) {
      const line = doc.line(i).text;
      const trimmed = line.trim();

      if (trimmed === "---" || i > MAX_FRONTMATTER_SCAN_LINES) break;

      // Detect start of characters block
      if (/^characters\s*:/i.test(trimmed)) {
        inCharacters = true;
        continue;
      }

      if (!inCharacters) continue;

      // Detect end of characters block (another top-level key)
      if (/^[a-zA-Z0-9_-]+\s*:/i.test(line)) {
        commitCharacter();
        inCharacters = false;
        continue;
      }

      const isListItem = line.trimStart().startsWith("-");
      if (isListItem) {
        commitCharacter();
        currentName = "";
        currentColor = "";

        const listContent = line.trimStart().slice(1).trim();

        // `- name: value` or `- key: value`
        const keyValMatch = listContent.match(/^([^:]+)\s*:\s*(.*)$/);
        if (keyValMatch) {
          const key = keyValMatch[1].trim();
          const val = keyValMatch[2].trim();
          if (/^name$/i.test(key)) {
            currentName = val;
          } else if (val) {
            commitWithValues(colors, key, val);
          } else {
            currentName = key;
          }
          continue;
        }

        currentName = listContent;
      } else {
        // Non-list item inside characters block
        const colorMatch = trimmed.match(/^color\s*:\s*(.+)$/i);
        if (colorMatch) {
          currentColor = colorMatch[1];
          commitCharacter();
          continue;
        }

        const nameMatch = trimmed.match(/^name\s*:\s*(.+)$/i);
        if (nameMatch) {
          currentName = nameMatch[1];
          commitCharacter();
          continue;
        }

        // Map-style key with no value: `CHARACTER NAME:`
        const mapKeyMatch = trimmed.match(/^([^:]+)\s*:$/);
        if (mapKeyMatch) {
          commitCharacter();
          currentName = mapKeyMatch[1].trim();
          currentColor = "";
        }
      }
    }

    commitCharacter();
  } catch (e) {
    console.error("Error parsing mdsp frontmatter:", e);
  }

  return colors;
}

/** Helper: commit a name/color pair directly into the colors map. */
function commitWithValues(colors: CharacterColorMap, name: string, color: string): void {
  const cleanName = stripQuotes(name.trim()).toLowerCase();
  const cleanColor = stripQuotes(color.trim());
  if (cleanName && cleanColor) {
    colors.set(cleanName, cleanColor);
  }
}

/**
 * Extracts character colors from Obsidian's pre-parsed metadata cache frontmatter.
 * Used in the reading-view post-processor where the full document text isn't available.
 */
export function parseCharacterColorsFromCache(
  frontmatter: Record<string, unknown> | undefined,
): CharacterColorMap {
  const colors: CharacterColorMap = new Map();
  if (!frontmatter?.characters) return colors;

  const charsObj = frontmatter.characters;

  if (Array.isArray(charsObj)) {
    for (const item of charsObj) {
      if (typeof item !== "string") continue;
      const match = item.match(/^(['"]?#?[a-fA-F0-9]{3,8}['"]?)\s+(.+)$/);
      if (match) {
        colors.set(match[2].trim().toLowerCase(), stripQuotes(match[1]));
      } else {
        colors.set(item.trim().toLowerCase(), "");
      }
    }
  } else if (typeof charsObj === "object" && charsObj !== null) {
    for (const [key, val] of Object.entries(charsObj as Record<string, unknown>)) {
      const name = key.trim().toLowerCase();
      if (typeof val === "string") {
        colors.set(name, stripQuotes(val));
      } else if (val && typeof val === "object" && (val as Record<string, unknown>).color) {
        colors.set(name, stripQuotes(String((val as Record<string, unknown>).color)));
      }
    }
  }

  return colors;
}

// ─── Frontmatter Boundaries ─────────────────────────────────────────────────

/**
 * Returns the 1-indexed line number of the closing `---` delimiter,
 * or -1 if no valid frontmatter is found.
 */
export function getEndFrontmatterLine(doc: Text): number {
  if (doc.length === 0) return -1;
  try {
    const firstLine = cleanBOM(doc.line(1).text.trim());
    if (firstLine !== "---") return -1;

    const maxLines = Math.min(doc.lines, 100);
    for (let i = 2; i <= maxLines; i++) {
      if (doc.line(i).text.trim() === "---") {
        return i;
      }
    }
  } catch {
    // Ignore — doc may be in an intermediate state
  }
  return -1;
}

/**
 * Returns the 1-indexed line range of the `characters:` block content
 * (i.e. the lines after `characters:` and before the next top-level key or `---`).
 */
export function getCharactersBlockRange(doc: Text): CharBlockRange {
  const range: CharBlockRange = { start: -1, end: -1 };
  try {
    const firstLine = cleanBOM(doc.line(1).text.trim());
    if (firstLine !== "---") return range;

    let inCharacters = false;
    const maxLines = Math.min(doc.lines, MAX_FRONTMATTER_SCAN_LINES);

    for (let i = 2; i <= maxLines; i++) {
      const line = doc.line(i).text;
      const trimmed = line.trim();

      if (trimmed === "---") {
        if (inCharacters) range.end = i - 1;
        break;
      }

      if (/^characters\s*:/i.test(trimmed)) {
        range.start = i + 1;
        inCharacters = true;
        continue;
      }

      if (inCharacters && /^[a-zA-Z0-9_-]+\s*:/i.test(line)) {
        range.end = i - 1;
        break;
      }
    }

    // If we hit the end of the scan without finding a terminator, find the ---
    if (inCharacters && range.end === -1) {
      for (let i = 2; i <= doc.lines; i++) {
        if (doc.line(i).text.trim() === "---") {
          range.end = i - 1;
          break;
        }
      }
    }
  } catch {
    // Ignore
  }

  return range;
}

// ─── Frontmatter Extraction & Serialization ─────────────────────────────────

/**
 * Extracts the raw frontmatter text from a CodeMirror `Text` document.
 * Returns an empty string if no valid frontmatter is found.
 */
export function extractFrontmatterText(doc: Text): string {
  try {
    const maxLines = Math.min(doc.lines, 100);
    if (doc.lines > 0 && cleanBOM(doc.line(1).text.trim()) === "---") {
      for (let i = 2; i <= maxLines; i++) {
        if (doc.line(i).text.trim() === "---") {
          const lines: string[] = [];
          for (let j = 1; j <= i; j++) {
            lines.push(doc.line(j).text);
          }
          return lines.join("\n");
        }
      }
    }
  } catch {
    // Ignore
  }
  return "";
}

/**
 * Serializes a frontmatter object back into a YAML-like string.
 * Handles special formatting for `characters` (map-style) and `authors` (list-style).
 */
export function serializeFrontmatter(fm: Record<string, unknown>): string {
  const lines: string[] = ["---"];

  for (const [key, value] of Object.entries(fm)) {
    if (key === "characters") {
      lines.push("characters:");
      if (value && typeof value === "object") {
        for (const [charName, charInfo] of Object.entries(value as Record<string, unknown>)) {
          if (charInfo && typeof charInfo === "object" && (charInfo as Record<string, unknown>).color) {
            lines.push(`  ${charName}:`);
            lines.push(`    color: "${(charInfo as Record<string, unknown>).color}"`);
          } else if (typeof charInfo === "string") {
            lines.push(`  ${charName}: "${charInfo}"`);
          } else {
            lines.push(`  ${charName}:`);
          }
        }
      }
    } else if (key === "authors") {
      lines.push("authors:");
      if (Array.isArray(value)) {
        for (const author of value) {
          lines.push(`  - ${author}`);
        }
      }
    } else {
      if (typeof value === "string") {
        lines.push(`${key}: "${value}"`);
      } else {
        lines.push(`${key}: ${value}`);
      }
    }
  }

  lines.push("---");
  return lines.join("\n");
}
