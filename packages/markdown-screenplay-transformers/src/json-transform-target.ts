import type { TransformTarget, YAMLTreeNode } from ".";
import { createElement, type ScreenplayElement } from "./screenplay-element";

/**
 * A TransformTarget that produces a structured array of ScreenplayElements
 * instead of an HTML string. This is the data model used by the editor.
 */
export class JsonTransformTarget implements TransformTarget<ScreenplayElement[]> {
  private _elements: ScreenplayElement[] = [];

  ProcessSceneHeading(line: string, handleNewScene: boolean): void {
    const text = line.trim();
    const type = handleNewScene ? 'scene-heading' : 'scene-heading-sub';
    this._elements.push(createElement(type, text));
  }

  ProcessSceneTransition(line: string): void {
    const text = line.trim();
    this._elements.push(createElement('scene-transition', text));
  }

  ProcessDialog(line: string): void {
    const trimmed = line.trim();
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
}
