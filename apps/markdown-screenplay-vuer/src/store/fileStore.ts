import type { CharacterFileData, FileData, MetadataData } from "@/interfaces/file-data";
import { HTMLTransformTarget, MarkupTransformer } from "@transformers";
import { defineStore } from "pinia";

export interface FilesState {
  files: FileData[];
}

/**
 * Build the YAML frontmatter string from a MetadataData object and characters list.
 */
function buildYamlFrontmatter(meta: MetadataData, characters?: CharacterFileData[]): string {
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
  if (characters && characters.length > 0) {
    lines.push("characters:");
    characters.forEach((char) => {
      if (char.name.trim()) {
        lines.push(`  ${char.name.trim()}:`);
        let color = char.color.trim();
        while (
          (color.startsWith("'") && color.endsWith("'")) ||
          (color.startsWith('"') && color.endsWith('"'))
        ) {
          color = color.slice(1, -1).trim();
        }
        lines.push(`    color: '${color}'`);
      }
    });
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
 * Re-render the HTML content from raw source + metadata + characters.
 */
function rebuildContent(rawContent: string, metadata: MetadataData, characters?: CharacterFileData[]): string {
  const body = stripYamlFrontmatter(rawContent);
  const newRaw = buildYamlFrontmatter(metadata, characters) + "\n" + body;

  const target = new HTMLTransformTarget();
  const transformer = new MarkupTransformer<HTMLTransformTarget, string>(target);
  newRaw.split(/\r?\n/).forEach((line) => transformer.next(line));
  return transformer.compose().output;
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
      const maxFiles = 5;
      if (this.files.length >= maxFiles) {
        this.files.shift();
      }
      this.files.push({
        ...file,
        isEditing: file.isEditing ?? false
      });
    },
    createNewFile() {
      // Find a unique filename
      let nextNum = 1;
      let newName = "untitled.mdsp";
      while (this.files.some(f => f.fileName.toLowerCase() === newName.toLowerCase())) {
        nextNum++;
        newName = `untitled_${nextNum}.mdsp`;
      }

      const defaultMetadata: MetadataData = {
        title: "Untitled Screenplay",
        version: "1.0",
        authors: [""],
      };

      const defaultRawContent = buildYamlFrontmatter(defaultMetadata) + "\n\n";

      const newFile: FileData = {
        content: rebuildContent(defaultRawContent, defaultMetadata),
        rawContent: defaultRawContent,
        scenes: [],
        characters: [],
        fileName: newName,
        metadata: defaultMetadata,
        isEditing: true
      };

      this.pushFile(newFile);
    },
    removeFile(index: number) {
      if (index >= 0 && index < this.files.length) {
        this.files.splice(index, 1);
      }
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
      const content = rebuildContent(file.rawContent, cleanedMetadata, file.characters);
      const rawContent = buildYamlFrontmatter(cleanedMetadata, file.characters) + "\n" + stripYamlFrontmatter(file.rawContent);

      this.files[index] = {
        ...file,
        metadata: cleanedMetadata,
        rawContent,
        content,
      };
    },
    updateBody(index: number, bodyContent: string) {
      const file = this.files[index];
      if (!file) {
        return;
      }

      const rawContent = buildYamlFrontmatter(file.metadata, file.characters) + "\n" + bodyContent;
      const content = rebuildContent(rawContent, file.metadata, file.characters);

      this.files[index] = {
        ...file,
        rawContent,
        content,
      };
    },
    updateFileName(index: number, fileName: string) {
      const file = this.files[index];
      if (file) {
        file.fileName = fileName;
      }
    },
    updateCharacters(index: number, characters: CharacterFileData[]) {
      const file = this.files[index];
      if (!file) {
        return;
      }

      const content = rebuildContent(file.rawContent, file.metadata, characters);
      const rawContent = buildYamlFrontmatter(file.metadata, characters) + "\n" + stripYamlFrontmatter(file.rawContent);

      this.files[index] = {
        ...file,
        characters,
        rawContent,
        content,
      };
    },
    setEditing(index: number, value: boolean) {
      const file = this.files[index];
      if (file) {
        file.isEditing = value;
      }
    },
    toggleEditing(index: number) {
      const file = this.files[index];
      if (file) {
        file.isEditing = !file.isEditing;
      }
    },
    $reset() {
      this.files = [];
    }
  },
  getters: {
    total: (state) => state.files.length,
    filesLinks: (state) => state.files.map((f, i) => ({
      text: f.fileName,
      icon: f.isEditing ? 'mdi-pencil' : 'mdi-file-document',
      route: f.isEditing ? '/editor/' + i : '/view/' + i
    })) ?? []
  }
})

