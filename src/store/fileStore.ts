import type { FileData } from "@/interfaces/file-data";
import { defineStore } from "pinia";

export interface FilesState {
  files: FileData[];
}

export const useFileStore = defineStore('files', {
  state: (): FilesState => {
    return {
      files: [],
    }
  },
  actions: {
    getFile(index: number) {
      return this.files[index];
    },
    pushFile(file: FileData) {
      const maxFiles = 1;
      if (this.files.length === maxFiles)
        this.files.pop();

      this.files.unshift(file);
    },
    $reset() {
      this.files = [];
    }
  },
  getters: {
    total: (state) => state.files.length,
    filesLinks: (state) => state.files.map((f, i) => ({
      text: f.fileName,
      icon: 'mdi-file-document',
      route: 'view?id=' + i
    })) ?? []
  }
})
