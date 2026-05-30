/**
 * Screenplay element types that map to the .mdsp syntax prefixes.
 *
 * - scene-heading:       `#`  prefix  (new scene)
 * - scene-heading-sub:   `##` prefix  (continuation heading)
 * - scene-transition:    `:`  prefix
 * - dialog-character:    `@`  prefix
 * - dialog:              no prefix (spelled dialogue immediately following character)
 * - dialog-parenthetical:no prefix (starts with `(` immediately following character)
 * - action:              no prefix
 */
export type ScreenplayElementType =
  | 'scene-heading'
  | 'scene-heading-sub'
  | 'scene-transition'
  | 'dialog-character'
  | 'dialog'
  | 'dialog-parenthetical'
  | 'action';

export interface ScreenplayElement {
  /** Unique identifier for Vue keying, selection, and reordering. */
  id: string;
  /** The semantic type of this element. */
  type: ScreenplayElementType;
  /** The display text, stripped of prefix characters. */
  text: string;
}

let _nextId = 1;

/**
 * Create a new ScreenplayElement with an auto‑generated unique ID.
 */
export function createElement(
  type: ScreenplayElementType,
  text: string,
): ScreenplayElement {
  return { id: `el-${_nextId++}`, type, text };
}

/**
 * Reset the internal ID counter. Useful for tests.
 */
export function resetElementIdCounter(): void {
  _nextId = 1;
}
