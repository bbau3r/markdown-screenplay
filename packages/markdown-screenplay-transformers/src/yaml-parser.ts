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

  public get ParsedObject(): unknown {
    return this.toObject(this._root);
  }

  public clear() {
    this._root = {}
    this._nodeQueue = [this._root];
    this._lastIndent = 0;
    this._indentPattern = "  "; // default to two spaces
    this._indentDetected = false;
  }

  public processLine(line: string) {
    if (line.trim() === "") return; // skip empty lines

    this.detectIndentPattern(line);
    const currentIndent = this.countIndentation(line, this._indentPattern);

    if (currentIndent < this._lastIndent)
      this._nodeQueue.splice(currentIndent + 1);
    else if (currentIndent === this._lastIndent + 1) {
      const parent = this._nodeQueue[this._nodeQueue.length - 1];
      const lastChild = parent.nodes?.[parent.nodes.length - 1];
      if (lastChild)
        this._nodeQueue.push(lastChild);
    }

    const currentNode = this._nodeQueue[this._nodeQueue.length - 1];
    const { key, value, isListItem } = this.parseLine(line);

    const newNode: YAMLTreeNode = {
      ...(key !== undefined ? { key } : {}),
      ...(value !== undefined ? { value } : {}),
      ...(isListItem ? { isListItem } : {}),
    };

    currentNode.nodes ??= [];
    currentNode.nodes.push(newNode);

    this._lastIndent = currentIndent;
  }

  private parseLine(line: string) {
    const rawLine = line.trimStart();
    const isListItem = rawLine.startsWith("-");
    const content = isListItem ? rawLine.slice(1).trim() : rawLine;

    if (content === "")
      return { key: undefined, value: undefined, isListItem };

    const separatorIndex = content.indexOf(":");
    if (separatorIndex < 0)
      return { key: content, value: undefined, isListItem };

    const key = content.slice(0, separatorIndex).trim();
    let value = content.slice(separatorIndex + 1).trim();
    
    if (value === "") {
      value = undefined as any;
    } else {
      // Strip surrounding single or double quotes
      if (
        (value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"'))
      ) {
        value = value.slice(1, -1);
      }
    }

    return { key, value, isListItem };
  }

  private toObject(node: YAMLTreeNode): unknown {
    if (!node.nodes || node.nodes.length === 0)
      return node.value ?? node.key;

    const nodes = node.nodes;
    const isSequence = nodes.every((child) => child.isListItem);
    if (isSequence)
      return nodes.map((child) => this.buildListItem(child));

    const object: Record<string, unknown> = {};
    for (const child of nodes) {
      if (!child.key)
        continue;

      const value = this.toObject(child);
      if (child.isListItem) {
        if (!Array.isArray(object[child.key]))
          object[child.key] = [];
        (object[child.key] as unknown[]).push(value);
      } else {
        object[child.key] = value;
      }
    }

    return object;
  }

  private buildListItem(node: YAMLTreeNode): unknown {
    if (node.key === undefined)
      return this.toObject(node);

    if (node.nodes && node.nodes.length > 0)
      return { [node.key]: this.toObject({ nodes: node.nodes } as YAMLTreeNode) };

    if (node.value !== undefined)
      return { [node.key]: node.value };

    return node.key;
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
