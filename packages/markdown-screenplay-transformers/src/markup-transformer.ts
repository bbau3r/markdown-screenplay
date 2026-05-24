import type { SceneData, TransformResult, TransformTarget } from ".";
import { YAMLParser } from "./yaml-parser";

export class MarkupTransformer<T extends TransformTarget<U>, U> {

  private _handleYaml: boolean = false;
  private _handleNewScene = false;
  private _yamlParser: YAMLParser;
  private _scenes: SceneData[] = [];

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
    const yamlData = this._yamlParser.ParsedYaml;
    const output = this._target.GenerateOutput(yamlData);
    const scenes = this._scenes;

    return { output, yamlData, scenes }
  }

  private appendScene(line: string, handleNewScene: boolean) {
    this._target.ProcessSceneHeading(line, handleNewScene);
    const sceneName = line.slice(1).trim();
    this._scenes.push({
      name: sceneName,
      ...(handleNewScene ? { isSub: true } : {})
    })
  }

  private processLine(line: string) {
    switch (true) {
      case line.length === 0:
        return;
      case line.startsWith("@@"):
        this.appendScene(line, false);
        break;
      case line.startsWith("@"):
        this.appendScene(line, true);
        break;
      case line.startsWith(":"):
        this._target.ProcessSceneTransition(line);
        break;
      case line.startsWith(">>"):
        this._target.ProcessDialog(line);
        break;
      case line.startsWith(">"):
        this._target.ProcessDialogCharacter(line);
        break;
      default:
        this._target.ProcessDefault(line);
        break;
    }
  }
}
