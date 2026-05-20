import type { SceneData } from "@/transformer";

export interface FileData {
  content: string;
  scenes: SceneData[];
  characters: (CharacterData | string)[];
  fileName: string;
}

export interface CharacterData {
  name: string;
  color: string;
}