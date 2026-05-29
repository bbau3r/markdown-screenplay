import type { TransformTarget, YAMLTreeNode } from ".";
import { createElement, type ScreenplayElement } from "./screenplay-element";

/**
 * A TransformTarget that produces a structured array of ScreenplayElements
 * instead of an HTML string. This is the data model used by the editor.
 */
export class JsonTransformTarget implements TransformTarget<ScreenplayElement[]> {
  private _elements: ScreenplayElement[] = [];

  ProcessSceneHeading(line: string, handleNewScene: boolean): void {
    // Strip leading '#' characters and trim
    const atRun = JsonTransformTarget.leadingCharRunLength(line);
    const text = line.slice(atRun).trim();
    const type = handleNewScene ? 'scene-heading' : 'scene-heading-sub';
    this._elements.push(createElement(type, text));
  }

  ProcessSceneTransition(line: string): void {
    const text = line.slice(1).trim();
    this._elements.push(createElement('scene-transition', text));
  }

  ProcessDialog(line: string): void {
    const trimmed = line.slice(2).trim();
    const isParenthetical = trimmed.startsWith("(");
    if (isParenthetical) {
      this._elements.push(createElement('dialog-parenthetical', trimmed));
    } else {
      this._elements.push(createElement('dialog', trimmed));
    }
  }

  ProcessDialogCharacter(line: string): void {
    const text = line.slice(1).trim();
    this._elements.push(createElement('dialog-character', text));
  }

  ProcessDefault(line: string): void {
    this._elements.push(createElement('action', line));
  }

  GenerateOutput(_yamlData: YAMLTreeNode): ScreenplayElement[] {
    return [...this._elements];
  }

  private static leadingCharRunLength(line: string): number {
    if (line.length === 0) return 0;
    const char = line[0];
    const match = new RegExp(`^${char}+`).exec(line);
    return match ? match[0].length : 0;
  }
}
