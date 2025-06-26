import type { SceneData } from "@/transformer";

export interface FileData {
  content: string;
  scenes: SceneData[];
  characters: string[];
  fileName: string;
}
