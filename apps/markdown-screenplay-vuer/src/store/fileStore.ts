import type { FileData, MetadataData } from "@/interfaces/file-data";
import { HTMLTransformTarget, MarkupTransformer } from "@transformers";
import { defineStore } from "pinia";

export interface FilesState {
  files: FileData[];
  isEditing: boolean;
}

/**
 * Build the YAML frontmatter string from a MetadataData object.
 */
function buildYamlFrontmatter(meta: MetadataData): string {
  const lines: string[] = ["---"];
  if (meta.title) lines.push(`title: ${meta.title}`);
  if (meta.version) lines.push(`version: ${meta.version}`);
  const authors = meta.authors.filter((a) => a.trim().length > 0);
  if (authors.length === 1) {
    lines.push(`author: ${authors[0]}`);
  } else if (authors.length > 1) {
    lines.push("authors:");
    authors.forEach((a) => lines.push(`  - ${a}`));
  }
  lines.push("---");
  return lines.join("\n");
}

/**
 * Strip the existing YAML frontmatter from raw content, returning only the body.
 */
function stripYamlFrontmatter(raw: string): string {
  const lines = raw.split(/\r?\n/);
  let inYaml = false;
  let bodyStart = 0;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      if (!inYaml) {
        inYaml = true;
      } else {
        bodyStart = i + 1;
        break;
      }
    }
  }

  return lines.slice(bodyStart).join("\n");
}

/**
 * Re-render the HTML content from raw source + metadata.
 */
function rebuildContent(rawContent: string, metadata: MetadataData): string {
  const body = stripYamlFrontmatter(rawContent);
  const newRaw = buildYamlFrontmatter(metadata) + "\n" + body;

  const target = new HTMLTransformTarget();
  const transformer = new MarkupTransformer<HTMLTransformTarget, string>(target);
  newRaw.split(/\r?\n/).forEach((line) => transformer.next(line));
  return transformer.compose().output;
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

      // Strip blank authors
      const cleanedAuthors = metadata.authors.filter((a) => a.trim().length > 0);
      const cleanedMetadata: MetadataData = {
        ...metadata,
        authors: cleanedAuthors.length > 0 ? cleanedAuthors : [""],
      };

      // Rebuild the HTML content with the updated metadata
      const content = rebuildContent(file.rawContent, cleanedMetadata);

      this.files[index] = {
        ...file,
        metadata: cleanedMetadata,
        content,
      };
    },
    updateBody(index: number, bodyContent: string) {
      const file = this.files[index];
      if (!file) {
        return;
      }

      const rawContent = buildYamlFrontmatter(file.metadata) + "\n" + bodyContent;
      const content = rebuildContent(rawContent, file.metadata);

      this.files[index] = {
        ...file,
        rawContent,
        content,
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

