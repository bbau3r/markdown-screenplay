import type { ScreenplayElement } from "./screenplay-element";

/**
 * Serialize a ScreenplayElement array back to `.mdsp` body text.
 *
 * This does NOT include YAML frontmatter — metadata serialization
 * is handled separately.
 */
export function serializeToMdsp(elements: ScreenplayElement[]): string {
  const lines: string[] = [];

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];

    if (i > 0) {
      const prevEl = elements[i - 1];
      const isCurrentDialog = el.type === 'dialog' || el.type === 'dialog-parenthetical';
      const isPrevDialogOrChar = prevEl.type === 'dialog-character' ||
        prevEl.type === 'dialog' ||
        prevEl.type === 'dialog-parenthetical';
      if (!(isCurrentDialog && isPrevDialogOrChar)) {
        lines.push('');
      }
    }

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
        lines.push(el.text);
        break;
      case 'dialog':
      case 'dialog-parenthetical':
        lines.push(el.text);
        break;
      case 'action':
        lines.push(el.text);
        break;
    }
  }

  return lines.join('\n');
}
