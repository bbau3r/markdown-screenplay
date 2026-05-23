import type { SceneData } from "@transformers";

export interface FileData {
  content: string;
  scenes: SceneData[];
  characters: CharacterFileData[];
  fileName: string;
}

export interface CharacterFileData {
  name: string;
  color: string;
}