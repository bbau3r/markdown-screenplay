/**
 * ColorBubbleWidget — an inline CodeMirror widget that renders a clickable
 * color swatch next to character names in the frontmatter properties.
 *
 * Clicking the swatch opens the browser's native color picker. When a color
 * is chosen, the widget updates the frontmatter text directly via the editor.
 */

import { EditorView, WidgetType } from "@codemirror/view";
import { normalizeHex6, buildHexWithAlpha } from "./utils";

export class ColorBubbleWidget extends WidgetType {
  constructor(
    readonly color: string,
    readonly view: EditorView,
  ) {
    super();
  }

  eq(other: ColorBubbleWidget): boolean {
    return other.color === this.color;
  }

  toDOM(): HTMLElement {
    const container = document.createElement("span");
    container.style.display = "inline-flex";
    container.style.alignItems = "center";
    container.style.cursor = "pointer";

    const bubble = this.createBubble();
    container.appendChild(bubble);

    const colorInput = this.createColorInput();
    container.appendChild(colorInput);

    container.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      colorInput.click();
    });

    colorInput.addEventListener("input", (e) => e.stopPropagation());
    colorInput.addEventListener("change", (e) => {
      e.stopPropagation();
      this.handleColorChange(container, colorInput.value);
    });

    return container;
  }

  /** Creates the circular color swatch element. */
  private createBubble(): HTMLElement {
    const bubble = document.createElement("span");
    bubble.className = "cm-mdsp-color-bubble";
    Object.assign(bubble.style, {
      display: "inline-block",
      width: "12px",
      height: "12px",
      borderRadius: "50%",
      marginRight: "6px",
      verticalAlign: "middle",
    });

    if (this.color) {
      bubble.style.backgroundColor = this.color;
      bubble.style.border = "1px solid rgba(0, 0, 0, 0.15)";
      bubble.style.boxShadow = "0 1px 1px rgba(0,0,0,0.1)";
    } else {
      bubble.style.backgroundColor = "transparent";
      bubble.style.border = "1.5px dashed var(--text-muted)";
      bubble.style.opacity = "0.7";
      bubble.title = "Click to assign a color";
    }

    return bubble;
  }

  /** Creates a hidden `<input type="color">` element. */
  private createColorInput(): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "color";
    input.value = normalizeHex6(this.color);
    input.style.display = "none";
    return input;
  }

  /**
   * Handles the user selecting a new color from the picker.
   * Dispatches an editor transaction to update the frontmatter text in-place.
   */
  private handleColorChange(container: HTMLElement, newHex6: string): void {
    const finalColor = buildHexWithAlpha(newHex6, this.color);

    try {
      const pos = this.view.posAtDOM(container);
      if (pos === null) return;

      const line = this.view.state.doc.lineAt(pos);
      const text = line.text;

      // Try to replace an existing hex color in the line
      const colorMatch = text.match(/#([a-fA-F0-9]{3,8})/i);
      if (colorMatch && colorMatch.index !== undefined) {
        this.view.dispatch({
          changes: {
            from: line.from + colorMatch.index,
            to: line.from + colorMatch.index + colorMatch[0].length,
            insert: finalColor,
          },
        });
        return;
      }

      // No existing color — try inserting one into a list item: `- NAME`
      const listMatch = text.match(/^(\s*-\s*)(.+)$/);
      if (listMatch) {
        this.view.dispatch({
          changes: {
            from: line.from,
            to: line.to,
            insert: `${listMatch[1]}'${finalColor}' ${listMatch[2].trim()}`,
          },
        });
        return;
      }

      // No existing color — try inserting one into a map entry: `NAME:`
      const mapMatch = text.match(/^(\s*)([^:]+)\s*:\s*$/);
      if (mapMatch) {
        this.view.dispatch({
          changes: {
            from: line.from,
            to: line.to,
            insert: `${mapMatch[1]}${mapMatch[2].trim()}: '${finalColor}'`,
          },
        });
      }
    } catch (err) {
      console.error("Failed to update color:", err);
    }
  }
}
