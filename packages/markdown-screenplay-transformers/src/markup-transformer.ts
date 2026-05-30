import type { SceneData, TransformResult, TransformTarget } from ".";
import { YAMLParser } from "./yaml-parser";

enum ScreenplayActiveType {
  None = 0,
  Dialog,
  Scene,
  Dialog_Character,
  Action,
  Transition,
}

export class MarkupTransformer<T extends TransformTarget<U>, U> {

  private _handleYaml: boolean = false;
  private _yamlParser: YAMLParser;
  private _scenes: SceneData[] = [];
  private _activeType: ScreenplayActiveType = ScreenplayActiveType.None;
  private _activeData: string = "";

  /**
   * @param _target Transform Target
   */
  constructor(private _target: T) {
    this._yamlParser = new YAMLParser();
  }

  public next(line: string): void {
    if (line.trim() === "---") {
      this._handleYaml = !this._handleYaml;
      return;
    }

    if (this._handleYaml)
      this._yamlParser.processLine(line);
    else
      this.processLine(line);
  }

  public compose(): TransformResult<U> {
    // Ensure any active data is processed at the end of the input
    this.processLine("");

    // Compose the final output using the TransformTarget and YAML data
    const yamlData = this._yamlParser.ParsedYaml;
    const output = this._target.GenerateOutput(yamlData);
    const scenes = this._scenes;

    return { output, yamlData, scenes }
  }

  private processLine(line: string) {
    const isBlankLine = line.trim().length === 0;
    const initialLine = this._activeType === ScreenplayActiveType.None && this._activeData.trim().length === 0;

    if (initialLine) {
      const trimmed = line.trim();
      switch (true) {
        case line.match(/^#{1,6} /) !== null:
        case line.startsWith("# "):
          this._activeType = ScreenplayActiveType.Scene;
          break;
        case line.startsWith(": "):
          this._activeType = ScreenplayActiveType.Transition;
          break;
        case isCharacterLine(trimmed):
          this._activeType = ScreenplayActiveType.Dialog_Character;
          break;
        default:
          this._activeType = ScreenplayActiveType.Action;
          break;
      }
    }

    switch (this._activeType) {
      case ScreenplayActiveType.Scene:
        if (initialLine) {
          const indentCount = line.match(/^#+/)![0].length;
          const extractedLine = line.slice(indentCount).trim();
          this._scenes.push({
            name: extractedLine,
            ...(indentCount === 1 ? { isSub: true } : {})
          });
        }
        else if (isBlankLine) {
          const previousScene = this._scenes[this._scenes.length - 1];
          this._target.ProcessSceneHeading(previousScene.name, previousScene.isSub === true);
        }
        else {
          this._scenes[this._scenes.length - 1].name += ` ${line.trim()}`;
        }
        break;
      case ScreenplayActiveType.Transition:
        if (initialLine) {
          const extractedLine = line.slice(2).trim();
          this._activeData = extractedLine;
        }
        else if (isBlankLine) {
          this._target.ProcessSceneTransition(this._activeData);
          this._activeData = "";
        }
        else {
          this._activeData += ` ${line.trim()}`;
        }
        break;
      case ScreenplayActiveType.Dialog_Character:
        if (initialLine) {
          this._activeData = line.trim();
        }
        else if (isBlankLine) {
          this._target.ProcessDefault(this._activeData);
          this._activeData = "";
        }
        else {
          this._target.ProcessDialogCharacter(this._activeData);
          this._activeData = line.trim();
          this._activeType = ScreenplayActiveType.Dialog;
        }
        break;
      case ScreenplayActiveType.Dialog:
        this._target.ProcessDialog(this._activeData);
        this._activeData = line.trim();
        break;
      case ScreenplayActiveType.Action:
        if (initialLine) {
          this._activeData = line.trim();
        }
        else if (isBlankLine) {
          this._target.ProcessDefault(this._activeData);
          this._activeData = "";
        }
        else {
          this._activeData += ` ${line.trim()}`;
        }
        break;
    }

    if (isBlankLine) this._activeType = ScreenplayActiveType.None;
  }
}

export function isCharacterLine(trimmed: string): boolean {
  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith(":") ||
    trimmed.startsWith(">")
  ) {
    return false;
  }

  // 1. Check [alias](reference) format
  const aliasMatch = trimmed.match(/^\[(.+?)\]\((.+?)\)(?:\s*\((.+?)\))?$/);
  if (aliasMatch) {
    const alias = aliasMatch[1].trim();
    const ref = aliasMatch[2].trim();
    const paren = aliasMatch[3] ? aliasMatch[3].trim() : "";
    
    const isAliasCaps = /[A-Z]/.test(alias) && !/[a-z]/.test(alias);
    const isRefCaps = /[A-Z]/.test(ref) && !/[a-z]/.test(ref);
    const isParenCaps = paren === "" || (/[A-Z]/.test(paren) && !/[a-z]/.test(paren));
    
    return isAliasCaps && isRefCaps && isParenCaps;
  }

  // 2. Check @(name) format
  const parenMatch = trimmed.match(/^@\((.+?)\)$/);
  if (parenMatch) {
    const name = parenMatch[1].trim();
    return /[A-Z]/.test(name) && !/[a-z]/.test(name);
  }

  // 3. Check @name format
  if (trimmed.startsWith("@")) {
    const name = trimmed.slice(1).trim();
    if (name.length === 0) return false;
    return /[A-Z]/.test(name) && !/[a-z]/.test(name);
  }

  // 4. Plain text / ALL CAPS format
  return /[A-Z]/.test(trimmed) && !/[a-z]/.test(trimmed);
}
