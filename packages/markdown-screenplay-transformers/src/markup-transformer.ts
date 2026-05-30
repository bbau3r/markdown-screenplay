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
          this._activeData += `\n${line.trim()}`;
        }
        break;
    }

    if (isBlankLine) this._activeType = ScreenplayActiveType.None;
  }
}

export function isCharacterLine(raw: string): boolean {
  const trimmed = raw.trim();

  // Exclude control lines
  if (/^[\/#:>]/.test(trimmed)) return false;

  const isAllCaps = (s: string) => /[A-Z]/.test(s) && !/[a-z]/.test(s);

  // If the whole line is exactly an alias link optionally followed by a parenthetical
  const exactAliasRegex = /^ \[(.+?)\] \((.+?)\)(?:\s*\((.+?)\))?$/;
  const exactAliasMatch = trimmed.match(exactAliasRegex);
  if (exactAliasMatch) {
    const [, , , parenRaw] = exactAliasMatch;
    if (!parenRaw) return true; // [Alias](Character Name) allowed in any case
    return isAllCaps(parenRaw.trim()); // trailing parenthetical must be ALL CAPS
  }

  // If the whole line is exactly @(Name) allow any case
  const exactAtParenRegex = /^@\((.+?)\)$/;
  if (exactAtParenRegex.test(trimmed)) return true;

  // If the whole line is exactly @Name allow any case
  const exactAtNameRegex = /^@([^\s]+)$/;
  if (exactAtNameRegex.test(trimmed)) return true;

  // Remove any inline constructs and check the remaining surrounding text
  const constructRegex = / \[(.+?) \] \((.+?) \)| @\((.+?) \)| @([^\s] +) /g;
  const withoutConstructs = trimmed.replace(constructRegex, '').trim();

  // If nothing remains after removing constructs then the line is valid
  if (withoutConstructs === '') return true;

  // If remaining text contains no letters then treat it as valid
  const lettersOnly = withoutConstructs.replace(/[^A-Za-z]/g, '');
  if (lettersOnly === '') return true;

  // Any surrounding text must be ALL CAPS
  return isAllCaps(withoutConstructs);
}

