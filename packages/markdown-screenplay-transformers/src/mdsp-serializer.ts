import type { ScreenplayElement } from "./screenplay-element";

/**
 * Serialize a ScreenplayElement array back to `.mdsp` body text.
 *
 * This does NOT include YAML frontmatter — metadata serialization
 * is handled separately.
 */
export function serializeToMdsp(elements: ScreenplayElement[]): string {
  const lines: string[] = [];

  for (const el of elements) {
    switch (el.type) {
      case 'scene-heading':
        lines.push(`# ${el.text}`);
        break;
      case 'scene-heading-sub':
        lines.push(`## ${el.text}`);
        break;
      case 'scene-transition':
        lines.push(`: ${el.text}`);
        break;
      case 'dialog-character':
        lines.push(`> ${el.text}`);
        break;
      case 'dialog':
      case 'dialog-parenthetical':
        lines.push(`>> ${el.text}`);
        break;
      case 'action':
        lines.push(el.text);
        break;
    }
  }

  return lines.join('\n');
}
