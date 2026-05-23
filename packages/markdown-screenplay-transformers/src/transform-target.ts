export interface TransformTarget<T> {
  ProcessSceneHeading(line: string, handleNewScene: boolean): void;
  ProcessSceneTransition(line: string): void;
  ProcessDialog(line: string): void;
  ProcessDialogCharacter(line: string): void;
  ProcessDefault(line: string): void;
  GenerateOutput(yamlData: YAMLTreeNode): T;
}

export interface TransformResult<T> {
  output: T;
  yamlData: YAMLTreeNode;
  scenes: SceneData[];
}

export interface YAMLTreeNode {
  key?: string;
  value?: string;
  nodes?: YAMLTreeNode[];
  isListItem?: boolean;
}

export interface SceneData {
  name: string;
  isSub?: boolean;
}
