import type { TransformTarget, YAMLTreeNode } from ".";

export class HTMLTransformTarget implements TransformTarget<string> {
  private static readonly subscriptPattern = /_\[(.+?)\]/g;
  private static readonly superscriptPattern = /\^\[(.+?)\]/g;
  private static readonly boldPattern = /\*\*(.*?)\*\*/g;
  private static readonly italicPattern = /\*(.*?)\*/g;
  private static readonly underlinePattern = /_(.*?)_/g;
  private static readonly strikePattern = /~(.*?)~/g;
  private static readonly characterRefPattern = /@\((.+?)\)/g;
  private static readonly characterRefSinglePattern = /@(\w+)/g;
  private static readonly characterRefAliasPattern = /\[(.+?)\]\((.+?)\)/g;

  private _sceneCount = 1;
  private _headingCount = 0;
  private _sceneAnchorFormat;
  private _activeSection = false;

  private _output: string = "";

  /**
   * Configuration for scroll-target naming.
   *
   * @param config Optional settings:
   *  - `sceneAnchorFormat`: A format string used to generate anchor IDs (e.g. "scene_{0}").
   *    Default is "scene_{0}", which becomes "scene_1", "scene_2", etc.
   *  - `sceneStart`: The starting number for scene anchors. Default is 1".
   */
  constructor(config: { sceneAnchorFormat?: string, sceneStart?: number } = {}) {
    this._sceneAnchorFormat = config.sceneAnchorFormat ?? "scene_{0}";
    this._sceneCount = config.sceneStart ?? 1;
  }

  ProcessSceneHeading(line: string, handleNewScene: boolean): void {
    this.closeActiveSection();
    this._output += `<div id="${this.formatString(this._sceneAnchorFormat, this._headingCount + "")}" class="scene-heading"${handleNewScene ? ` data-scene-count="${this._sceneCount}"` : ""}>${this.identifyCharacter(line.toUpperCase().trim())}</div>\n`;
    this._headingCount++;
    if (handleNewScene)
      this._sceneCount++;
  }
  ProcessSceneTransition(line: string): void {
    this.closeActiveSection();
    this._output += `<p class="scene-transition">${line.toUpperCase()}:</p>\n`;
  }
  ProcessDialog(line: string): void {
    const isParenthetical: boolean = line.startsWith("(");
    const classType: string = `dialog${isParenthetical ? "-parenthetical" : ""}`;
    this._output += `<p class="${classType}">${this.formatLine(isParenthetical ? line.toLowerCase() : line)}</p>\n`;
  }
  ProcessDialogCharacter(line: string): void {
    this.closeActiveSection();
    this.openActiveSection();
    this._output += `<p class="dialog-heading">${this.formatLine(line.toUpperCase())}</p>\n`;
  }
  ProcessDefault(line: string): void {
    this.closeActiveSection();
    const isCentered = line.startsWith(": ") && line.endsWith(" :");
    if (isCentered)
      this._output += `<p class="centered">${this.formatLine(line.slice(2, -2).trim())}</p>\n`;
    else
      this._output += `<p class="section">${this.formatLine(line)}</p>\n`;
  }

  private openActiveSection(): void {
    if (!this._activeSection) {
      this._output += `<div class="section">\n`;
      this._activeSection = true;
    }
  }

  private closeActiveSection(): void {
    if (this._activeSection) {
      this._output += `</div>\n`;
      this._activeSection = false;
    }
  }

  private formatString(template: string, ...args: string[]): string {
    return template.replace(/{(\d+)}/g, (_, i) => args[i] ?? '')
  }

  private identifyCharacter(line: string): string {
    return line.trim()
      // &(Character Name)
      .replace(HTMLTransformTarget.characterRefPattern, (_, ref) => {
        return `<span data-character="${ref.toLowerCase()}" class="character">${ref.toUpperCase()}</span>`;
      })
      // &Character
      .replace(HTMLTransformTarget.characterRefSinglePattern, (_, ref) => {
        return `<span data-character="${ref.toLowerCase()}" class="character">${ref.toUpperCase()}</span>`;
      })
      // [alias](ref)
      .replace(HTMLTransformTarget.characterRefAliasPattern, (_, alias, ref) => {
        return `<span data-character="${ref.toLowerCase()}" class="character">${alias.toUpperCase()}</span>`;
      });
  }

  formatLine(line: string): string {
    if (line[0] === "/") line = line.slice(1);
    return this.identifyCharacter(line)
      .replace(HTMLTransformTarget.subscriptPattern, "<sub>$1</sub>")
      .replace(HTMLTransformTarget.superscriptPattern, "<sup>$1</sup>")
      .replace(HTMLTransformTarget.boldPattern, "<b>$1</b>")
      .replace(HTMLTransformTarget.italicPattern, "<i>$1</i>")
      .replace(HTMLTransformTarget.underlinePattern, "<u>$1</u>")
      .replace(HTMLTransformTarget.strikePattern, "<s>$1</s>");
  }

  GenerateOutput(yamlRoot: YAMLTreeNode): string {
    // Clean up any unclosed sections
    this.closeActiveSection();

    console.log("YAML Root:", yamlRoot);
    if (yamlRoot.nodes)
      return `${HTMLTransformTarget.renderTitle(yamlRoot.nodes)}\n${this._output}`;
    return this._output;
  }

  private static joinWithConjuction(arr: string[]): string {
    if (arr.length === 0) return "";
    if (arr.length === 1) return arr[0];
    if (arr.length === 2) return arr.join(" and ");
    return `${arr.slice(0, -1).join(", ")} and ${arr[arr.length - 1]}`;
  }

  private static renderTitle(yamlValues: YAMLTreeNode[]): string {
    let render: string = "";
    let content: string = "";
    let additionalInformation: string = "";
    let title: string | undefined;
    let author: string | undefined;
    let version: string | undefined;

    yamlValues.forEach(element => {
      if (element.value) {
        switch (element.key?.toLowerCase()) {
          case "title":
            title = element.value;
            break;
          case "author":
            author = element.value;
            break;
          case "version":
            version = element.value;
            break;
        }
      }
      else if (element.nodes) {
        switch (element.key?.toLowerCase()) {
          case "authors":
            const authorList = element.nodes.map(x => x.key).filter(x => x !== undefined);
            author = HTMLTransformTarget.joinWithConjuction(authorList);;
            break;
        }
      }
    });

    if (title) content += `<title>${title}</title><h1>${title.toUpperCase()}</h1>\n`;
    if (author) content += `<h2>Written by:<br/>${author}</h2>\n`;
    if (version) additionalInformation += `<p>version: ${version}</p>`;

    if (content) render += `<center class="title-section">${content}</center>`;
    if (additionalInformation) render += `<div>${additionalInformation}</div>`;
    if (render) render += "<hr/>";

    return render;
  }

}
