import { HTMLTransformTarget, MarkupTransformer } from "@transformers"
import { TypedEvent } from "./typed-events";
import type { CharacterFileData, FileData, MetadataData } from "@/interfaces/file-data";
import type { YAMLTreeNode } from "@transformers";

export const ReadFileServiceKey = Symbol('ReadFileService');

export class ReadFileService {

  public readonly onComplete = new TypedEvent<FileData>();

  public readFile(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      this.onComplete.emit(this.processContent(content, file.name));
    }
    reader.readAsText(file)
  }

  public processContent(content: string, fileName: string): FileData {
    const markupTransformer = new MarkupTransformer<HTMLTransformTarget, string>(
      new HTMLTransformTarget(),
    )

    const lines = content.split(/\r?\n/)

    lines.forEach((line) => {
      markupTransformer.next(line)
    })

    const results = markupTransformer.compose()

    const charactersNode = results.yamlData.nodes?.find((x) => x.key?.toLowerCase() === 'characters')
    const characters =
      charactersNode?.nodes
        ?.map((x) => ({
          name: x.key,
          color: x.nodes
            ?.filter((n) => n.key?.toLowerCase() === 'color')?.[0]?.value
            ?? "#2EFFEF7D"
        } as CharacterFileData))
        .filter((x) => x !== undefined) ?? []

    return {
      content: results.output,
      scenes: results.scenes,
      characters,
      fileName,
      metadata: this.extractMetadata(results.yamlData),
    }
  }

  private extractMetadata(yamlData: YAMLTreeNode): MetadataData {
    const titleNode = yamlData.nodes?.find((node) => node.key?.toLowerCase() === 'title');
    const versionNode = yamlData.nodes?.find((node) => node.key?.toLowerCase() === 'version');
    const authorsNode = yamlData.nodes?.find((node) => node.key?.toLowerCase() === 'authors');
    const authorNode = yamlData.nodes?.find((node) => node.key?.toLowerCase() === 'author');

    return {
      title: titleNode?.value ?? "",
      version: versionNode?.value ?? "",
      authors: authorNode?.value
        ? [authorNode.value]
        : authorsNode?.nodes
          ?.map((node) => node.value ?? node.key ?? "")
          .filter((value) => value.trim().length > 0) ?? [""],
    }
  }
}
