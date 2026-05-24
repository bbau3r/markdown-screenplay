import type { FileData, MetadataData } from "@/interfaces/file-data";
import { defineStore } from "pinia";

export interface FilesState {
  files: FileData[];
  isEditing: boolean;
}

export const useFileStore = defineStore('files', {
  state: (): FilesState => {
    return {
      files: [],
      isEditing: false,
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
    updateMetadata(index: number, metadata: MetadataData) {
      const file = this.files[index];

      if (!file) {
        return;
      }

      this.files[index] = {
        ...file,
        metadata,
      };
    },
    setEditing(value: boolean) {
      this.isEditing = value;
    },
    toggleEditing() {
      this.isEditing = !this.isEditing;
    },
    $reset() {
      this.files = [];
      this.isEditing = false;
    }
  },
  getters: {
    total: (state) => state.files.length,
    filesLinks: (state) => state.files.map((f, i) => ({
      text: f.fileName,
      icon: state.isEditing && i === 0 ? 'mdi-pencil' : 'mdi-file-document',
      route: state.isEditing ? '/editor/' + i : '/view/' + i
    })) ?? []
  }
})
