import type { SceneData } from "@/transformer";

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