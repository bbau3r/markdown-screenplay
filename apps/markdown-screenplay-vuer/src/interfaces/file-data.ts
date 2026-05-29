import type { SceneData } from "@transformers";

export interface MetadataData {
  title: string;
  version: string;
  authors: string[];
}

export interface FileData {
  content: string;
  rawContent: string;
  scenes: SceneData[];
  characters: CharacterFileData[];
  fileName: string;
  metadata: MetadataData;
  isEditing: boolean;
}

export interface CharacterFileData {
  name: string;
  color: string;
}