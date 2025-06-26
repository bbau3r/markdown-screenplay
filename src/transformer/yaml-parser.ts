import type { YAMLTreeNode } from "./transform-target";

export class YAMLParser {

  private _root!: YAMLTreeNode;
  private _nodeQueue!: YAMLTreeNode[];
  private _lastIndent!: number;
  private _indentPattern!: string;
  private _indentDetected!: boolean;

  constructor() {
    this.clear();
  }

  get ParsedYaml() { return this._root; }

  public clear() {
    this._root = {}
    this._nodeQueue = [this._root];
    this._lastIndent = 0;
    this._indentPattern = "  "; // default to two spaces
    this._indentDetected = false;
  }

  public processLine(line: string) {
    if (line.trim() === "") return; //skip empty lines

    this.detectIndentPattern(line);
    const currentIndent = this.countIndentation(line, this._indentPattern);

    // Traverse up if dedented
    if (currentIndent < this._lastIndent)
      this._nodeQueue.splice(currentIndent + 1);
    // Dive deeper if indent increased
    else if (currentIndent === this._lastIndent + 1) {
      const parent = this._nodeQueue[this._nodeQueue.length - 1];
      const lastChild = parent.nodes?.[parent.nodes.length - 1];
      if (lastChild)
        this._nodeQueue.push(lastChild);
    }

    const currentNode: YAMLTreeNode = this._nodeQueue[this._nodeQueue.length - 1];

    const [key, value] = line.split(":").map(str => str.trim());
    const isListItem = key?.startsWith("-");

    const cleanKey = isListItem ? key.slice(1).trim() : key;
    const newNode: YAMLTreeNode = {
      key: cleanKey,
      ...(value ? { value } : {})
    };

    currentNode.nodes ??= [];
    currentNode.nodes.push(newNode);

    this._lastIndent = currentIndent;
  }

  private detectIndentPattern(line: string): void {
    if (this._indentDetected) return;
    const match = line.match(/^(\s+)/);
    if (match) {
      this._indentPattern = match[1];
      this._indentDetected = true;
    }
  }

  private countIndentation(line: string, pattern: string): number {
    return (line.match(new RegExp(`^(${pattern})*`))?.[0].length ?? 0) / pattern.length;
  }
}
