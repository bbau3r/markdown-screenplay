import { Plugin, MarkdownView, TFile, App } from "obsidian";
import { RangeSetBuilder, Text } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";

function logDebug(app: App, msg: string) {
  try {
    const timestamp = new Date().toISOString();
    app.vault.adapter.append("screenplay-debug.log", `[${timestamp}] ${msg}\n`);
  } catch (e) {}
}

function cleanBOM(str: string): string {
  if (str && str.charCodeAt(0) === 0xFEFF) {
    return str.slice(1);
  }
  return str;
}

// Function to parse characters from frontmatter text with extreme YAML formatting flexibility
function parseCharactersFromDoc(doc: Text): Map<string, string> {
  const colors = new Map<string, string>();
  if (doc.length === 0) return colors;
  
  try {
    const firstLine = cleanBOM(doc.line(1).text.trim());
    if (firstLine !== "---") return colors;
    
    let inCharacters = false;
    let currentCharacterName = "";
    let currentCharacterColor = "";
    
    const commitCharacter = (name: string, color: string) => {
      const cleanName = name.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
      const cleanColor = color.trim().replace(/^['"]|['"]$/g, '');
      if (cleanName && cleanColor) {
        colors.set(cleanName, cleanColor);
      }
    };

    for (let i = 2; i <= doc.lines; i++) {
      const line = doc.line(i).text;
      const trimmed = line.trim();
      
      if (trimmed === "---") {
        break;
      }
      if (i > 200) {
        break;
      }
      
      if (/^characters\s*:/i.test(trimmed)) {
        inCharacters = true;
        continue;
      }
      
      if (inCharacters) {
        if (/^[a-zA-Z0-9_-]+\s*:/i.test(line)) {
          inCharacters = false;
          commitCharacter(currentCharacterName, currentCharacterColor);
          continue;
        }
        
        const isListItem = line.trimStart().startsWith("-");
        if (isListItem) {
          commitCharacter(currentCharacterName, currentCharacterColor);
          currentCharacterName = "";
          currentCharacterColor = "";
          
          const listContent = line.trimStart().slice(1).trim();
          
          const nameMatch = listContent.match(/^name\s*:\s*(.+)$/i);
          if (nameMatch) {
            currentCharacterName = nameMatch[1];
            continue;
          }
          
          const keyValMatch = listContent.match(/^([^:]+)\s*:\s*(.*)$/);
          if (keyValMatch) {
            const key = keyValMatch[1].trim();
            const val = keyValMatch[2].trim();
            if (val) {
              commitCharacter(key, val);
            } else {
              currentCharacterName = key;
            }
            continue;
          }
          
          currentCharacterName = listContent;
        } else {
          const colorMatch = trimmed.match(/^color\s*:\s*(.+)$/i);
          if (colorMatch) {
            currentCharacterColor = colorMatch[1];
            commitCharacter(currentCharacterName, currentCharacterColor);
            continue;
          }
          
          const nameMatch = trimmed.match(/^name\s*:\s*(.+)$/i);
          if (nameMatch) {
            currentCharacterName = nameMatch[1];
            commitCharacter(currentCharacterName, currentCharacterColor);
            continue;
          }
          
          const mapKeyMatch = trimmed.match(/^([^:]+)\s*:$/);
          if (mapKeyMatch) {
            commitCharacter(currentCharacterName, currentCharacterColor);
            currentCharacterName = mapKeyMatch[1].trim();
            currentCharacterColor = "";
            continue;
          }
        }
      }
    }
    
    commitCharacter(currentCharacterName, currentCharacterColor);
  } catch (e) {
    console.error("Error parsing mdsp frontmatter: ", e);
  }
  
  return colors;
}

// Check if a line number is in the frontmatter boundaries
function getEndFrontmatterLine(doc: Text): number {
  if (doc.length === 0) return -1;
  try {
    const firstLine = cleanBOM(doc.line(1).text.trim());
    if (firstLine !== "---") return -1;
    
    for (let i = 2; i <= doc.lines; i++) {
      if (doc.line(i).text.trim() === "---") {
        return i;
      }
      if (i > 100) break; // sanity limit
    }
  } catch (e) {
    // Ignore
  }
  return -1;
}

// Locate the line boundaries of the characters section in the frontmatter
function getCharactersBlockRange(doc: Text): { start: number, end: number } {
  let start = -1;
  let end = -1;
  try {
    const firstLine = cleanBOM(doc.line(1).text.trim());
    if (firstLine !== "---") return { start, end };
    
    let inCharacters = false;
    
    for (let i = 2; i <= doc.lines; i++) {
      const line = doc.line(i).text;
      const trimmed = line.trim();
      if (trimmed === "---") {
        if (inCharacters) {
          end = i - 1;
        }
        break;
      }
      if (i > 200) break;
      
      if (/^characters\s*:/i.test(trimmed)) {
        start = i + 1;
        inCharacters = true;
        continue;
      }
      
      if (inCharacters) {
        if (/^[a-zA-Z0-9_-]+\s*:/i.test(line)) {
          end = i - 1;
          break;
        }
      }
    }
    
    if (inCharacters && end === -1) {
      for (let i = 2; i <= doc.lines; i++) {
        if (doc.line(i).text.trim() === "---") {
          end = i - 1;
          break;
        }
      }
    }
  } catch (e) {}
  
  return { start, end };
}

// Helper function to check if a document position falls inside a character reference match
function isPosInCharacterMatch(pos: number, doc: Text, colors: Map<string, string>): boolean {
  if (pos < 0 || pos > doc.length) return false;
  try {
    const line = doc.lineAt(pos);
    const text = line.text;
    const regex = /@\(([^)]+)\)|@(\w+)|\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const fullMatch = match[0];
      const matchStart = line.from + match.index;
      const matchEnd = matchStart + fullMatch.length;
      if (pos >= matchStart && pos <= matchEnd) {
        let characterName = "";
        if (match[1]) characterName = match[1];
        else if (match[2]) characterName = match[2];
        else if (match[4]) characterName = match[4];

        if (characterName) {
          const lowerName = characterName.trim().toLowerCase();
          if (colors.has(lowerName)) {
            return true;
          }
        }
      }
    }
  } catch (e) {}
  return false;
}

// Widget to render a visual color bubble next to character names in properties
class ColorBubbleWidget extends WidgetType {
  constructor(readonly color: string, readonly view: EditorView) {
    super();
  }

  toDOM() {
    const container = document.createElement("span");
    container.style.display = "inline-flex";
    container.style.alignItems = "center";
    container.style.cursor = "pointer";

    const bubble = document.createElement("span");
    bubble.className = "cm-mdsp-color-bubble";
    bubble.style.display = "inline-block";
    bubble.style.width = "12px";
    bubble.style.height = "12px";
    bubble.style.borderRadius = "50%";
    bubble.style.marginRight = "6px";
    bubble.style.verticalAlign = "middle";
    
    if (this.color) {
      bubble.style.backgroundColor = this.color;
      bubble.style.border = "1px solid rgba(0, 0, 0, 0.15)";
      bubble.style.boxShadow = "0 1px 1px rgba(0,0,0,0.1)";
    } else {
      bubble.style.backgroundColor = "transparent";
      bubble.style.border = "1.5px dashed var(--text-muted)";
      bubble.style.opacity = "0.7";
      bubble.title = "Click to assign a color";
    }

    container.appendChild(bubble);

    // Create a hidden input of type color
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    
    let hex6 = "#808080";
    if (this.color && this.color.startsWith("#")) {
      if (this.color.length === 9) {
        hex6 = this.color.slice(0, 7);
      } else if (this.color.length === 7) {
        hex6 = this.color;
      }
    }
    colorInput.value = hex6;
    colorInput.style.display = "none";
    container.appendChild(colorInput);

    // Click on container opens the color picker
    container.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      colorInput.click();
    });

    colorInput.addEventListener("input", (e) => {
      e.stopPropagation();
    });

    colorInput.addEventListener("change", (e) => {
      e.stopPropagation();
      const newColor6 = colorInput.value;
      
      let finalColor = newColor6;
      if (this.color && this.color.startsWith("#") && this.color.length === 9) {
        const alpha = this.color.slice(7, 9);
        finalColor = newColor6 + alpha;
      } else {
        finalColor = newColor6 + "7d"; // 50% opacity (alpha 7D)
      }

      try {
        const pos = this.view.posAtDOM(container);
        if (pos !== null) {
          const line = this.view.state.doc.lineAt(pos);
          const text = line.text;
          
          const colorRegex = /#([a-fA-F0-9]{3,8})/i;
          const match = text.match(colorRegex);
          if (match && match.index !== undefined) {
            const startPos = line.from + match.index;
            const endPos = startPos + match[0].length;
            this.view.dispatch({
              changes: {
                from: startPos,
                to: endPos,
                insert: finalColor
              }
            });
          } else {
            // Case 3: List item WITHOUT color: `- KAYAK KILLER`
            const listMatch = text.match(/^(\s*-\s*)(.+)$/);
            if (listMatch) {
              const prefix = listMatch[1];
              const name = listMatch[2].trim();
              this.view.dispatch({
                changes: {
                  from: line.from,
                  to: line.to,
                  insert: `${prefix}'${finalColor}' ${name}`
                }
              });
            } else {
              // Case 4: Map entry WITHOUT color: `KAYAK KILLER:`
              const mapMatch = text.match(/^(\s*)([^:]+)\s*:\s*$/);
              if (mapMatch) {
                const prefix = mapMatch[1];
                const name = mapMatch[2].trim();
                this.view.dispatch({
                  changes: {
                    from: line.from,
                    to: line.to,
                    insert: `${prefix}${name}: '${finalColor}'`
                  }
                });
              }
            }
          }
        }
      } catch (err) {
        console.error("Failed to update color:", err);
      }
    });

    return container;
  }

  eq(other: ColorBubbleWidget) {
    return other.color === this.color;
  }
}

export default class ScreenplayPlugin extends Plugin {
  async onload() {
    console.log("Loading Screenplay MDSP Plugin...");
    logDebug(this.app, "Plugin onload started");

    // Register the .mdsp extension as markdown
    try {
      this.registerExtensions(["mdsp"], "markdown");
      logDebug(this.app, "Extensions registered successfully for mdsp");
    } catch (e: any) {
      logDebug(this.app, "Failed to register extensions: " + e.message);
    }

    // Register event to update CSS classes when switching files or when metadata changes
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => this.updateEditorClasses())
    );
    this.registerEvent(
      this.app.metadataCache.on("changed", () => this.updateEditorClasses())
    );

    // Initial check
    this.app.workspace.onLayoutReady(() => {
      this.updateEditorClasses();
    });

    // Register the editor extension (CodeMirror 6)
    this.registerEditorExtension(this.buildEditorExtension());
    logDebug(this.app, "Editor extension registered successfully");

    // Register a markdown post-processor for Reading View
    this.registerMarkdownPostProcessor((el, ctx) => {
      logDebug(this.app, `Markdown post-processor running for ${ctx.sourcePath}`);
      try {
        const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
        if (!(file instanceof TFile) || !this.isScreenplayFile(file)) {
          return;
        }

        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;
        const colors = new Map<string, string>();
        if (frontmatter && frontmatter.characters) {
          const charsObj = frontmatter.characters;
          if (Array.isArray(charsObj)) {
            for (const item of charsObj) {
              if (typeof item === "string") {
                const match = item.match(/^(['"]?#?[a-fA-F0-9]{3,8}['"]?)\s+(.+)$/);
                if (match) {
                  const color = match[1].replace(/^['"]|['"]$/g, '');
                  const name = match[2].trim().toLowerCase();
                  colors.set(name, color);
                } else {
                  colors.set(item.trim().toLowerCase(), "");
                }
              }
            }
          } else if (typeof charsObj === "object") {
            for (const [key, val] of Object.entries(charsObj)) {
              const name = key.trim().toLowerCase();
              if (typeof val === "string") {
                colors.set(name, val.replace(/^['"]|['"]$/g, ''));
              } else if (val && typeof val === "object" && (val as any).color) {
                colors.set(name, String((val as any).color).replace(/^['"]|['"]$/g, ''));
              }
            }
          }
        }

        logDebug(this.app, `Parsed Reading View YAML colors count: ${colors.size}`);
        if (colors.size === 0) return;

        // 1. Process standard links [alias](character name) -> styled and non-clickable
        const links = el.querySelectorAll("a.internal-link");
        links.forEach((linkEl) => {
          const href = linkEl.getAttribute("data-href") || linkEl.getAttribute("href") || "";
          const lowerHref = href.trim().toLowerCase();
          const color = colors.get(lowerHref);
          if (color) {
            const htmlEl = linkEl as HTMLElement;
            htmlEl.style.backgroundColor = color;
            htmlEl.classList.add("cm-mdsp-character-highlight");
            htmlEl.style.color = "var(--text-normal)";
            htmlEl.style.textDecoration = "none";
            htmlEl.style.pointerEvents = "none";
            htmlEl.style.cursor = "text";
          }
        });

        // 2. Process inline text nodes containing @Runner or @(Runner) -> styled span
        const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
        let node;
        const nodesToReplace: { node: Text; parent: ParentNode; newNodes: Node[] }[] = [];

        while (node = walk.nextNode() as Text) {
          const parentName = node.parentNode?.nodeName.toLowerCase();
          if (parentName === "code" || parentName === "pre" || parentName === "a" || parentName === "style" || parentName === "script") {
            continue;
          }

          const text = node.nodeValue || "";
          const regex = /@\(([^)]+)\)|@(\w+)/g;
          if (regex.test(text)) {
            regex.lastIndex = 0;
            let lastIdx = 0;
            let match;
            const newNodes: Node[] = [];

            while ((match = regex.exec(text)) !== null) {
              const matchStart = match.index;
              const fullMatch = match[0];

              let characterName = "";
              if (match[1]) characterName = match[1];
              else if (match[2]) characterName = match[2];

              const lowerName = characterName.trim().toLowerCase();
              const color = colors.get(lowerName);

              if (color) {
                if (matchStart > lastIdx) {
                  newNodes.push(document.createTextNode(text.substring(lastIdx, matchStart)));
                }

                const span = document.createElement("span");
                span.className = "cm-mdsp-character-highlight";
                span.style.backgroundColor = color;
                span.textContent = characterName;
                newNodes.push(span);

                lastIdx = matchStart + fullMatch.length;
              }
            }

            if (lastIdx < text.length) {
              newNodes.push(document.createTextNode(text.substring(lastIdx)));
            }

            if (newNodes.length > 0) {
              nodesToReplace.push({ node, parent: node.parentNode!, newNodes });
            }
          }
        }

        for (const item of nodesToReplace) {
          const { node, parent, newNodes } = item;
          if (parent.contains(node)) {
            const fragment = document.createDocumentFragment();
            for (const n of newNodes) {
              fragment.appendChild(n);
            }
            parent.replaceChild(fragment, node);
          }
        }
      } catch (err: any) {
        logDebug(this.app, `ERROR in Reading View post-processor: ${err.message}`);
      }
    });
    logDebug(this.app, "Markdown post-processor registered successfully");
  }

  onunload() {
    console.log("Unloading Screenplay MDSP Plugin...");
    // Clean up class names on all markdown views
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof MarkdownView) {
        view.contentEl.classList.remove("mdsp-enabled");
      }
    }
  }

  isScreenplayFile(file: TFile | null): boolean {
    if (!file) return false;
    
    // 1. Check file extensions
    if (file.extension === "mdsp" || file.name.endsWith(".mdsp.md")) {
      return true;
    }
    
    // 2. Check frontmatter properties
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;
    if (frontmatter) {
      if (frontmatter.syntax === "mdsp" || frontmatter.cssclasses === "mdsp") {
        return true;
      }
      if (Array.isArray(frontmatter.cssclasses) && frontmatter.cssclasses.includes("mdsp")) {
        return true;
      }
      // If characters are specified in frontmatter properties, enable plugin highlighting
      if (frontmatter.characters !== undefined) {
        return true;
      }
    }
    
    return false;
  }

  updateEditorClasses() {
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof MarkdownView) {
        const file = view.file;
        const enabled = this.isScreenplayFile(file);
        
        const containerEl = view.contentEl;
        if (enabled) {
          containerEl.classList.add("mdsp-enabled");
        } else {
          containerEl.classList.remove("mdsp-enabled");
        }
      }
    }
  }

  buildEditorExtension() {
    const pluginInstance = this;
    
    return [
      ViewPlugin.fromClass(
        class {
          decorations: DecorationSet;

          constructor(view: EditorView) {
            this.decorations = this.buildDecorations(view);
          }

          update(update: ViewUpdate) {
            if (update.docChanged || update.viewportChanged || update.selectionSet) {
              this.decorations = this.buildDecorations(update.view);
            }
          }

          buildDecorations(view: EditorView): DecorationSet {
            logDebug(pluginInstance.app, `buildDecorations started for doc length=${view.state.doc.length}`);
            try {
              // 1. Resolve current file and check active state
              const activeFile = pluginInstance.app.workspace.getActiveFile();
              
              // Instant check: read document state directly to see if a "characters:" property section exists.
              // This enables instant highlighting when editing without waiting for the Obsidian metadata cache to refresh.
              let hasCharactersBlock = false;
              try {
                if (view.state.doc.length > 0 && cleanBOM(view.state.doc.line(1).text.trim()) === "---") {
                  const linesToScan = Math.min(view.state.doc.lines, 200);
                  for (let i = 2; i <= linesToScan; i++) {
                    const line = view.state.doc.line(i).text.trim();
                    if (line === "---") break;
                    if (/^characters\s*:/i.test(line)) {
                      hasCharactersBlock = true;
                      break;
                    }
                  }
                }
              } catch (e) {}

              const isMdsp = pluginInstance.isScreenplayFile(activeFile) || hasCharactersBlock;
              if (!isMdsp) {
                return Decoration.none;
              }

              // 2. Parse character colors from document text
              const colors = parseCharactersFromDoc(view.state.doc);
              logDebug(pluginInstance.app, `Parsed character colors count=${colors.size}`);
              const endFrontmatterLine = getEndFrontmatterLine(view.state.doc);
              const charRange = getCharactersBlockRange(view.state.doc);
              logDebug(pluginInstance.app, `charRange start=${charRange.start}, end=${charRange.end}`);

              const builder = new RangeSetBuilder<Decoration>();

            // 3. Walk visible ranges
            for (const { from, to } of view.visibleRanges) {
              const startLine = view.state.doc.lineAt(from).number;
              const endLine = view.state.doc.lineAt(to).number;

              for (let l = startLine; l <= endLine; l++) {
                const line = view.state.doc.line(l);
                const text = line.text;

                // Style the frontmatter lines as properties
                if (endFrontmatterLine !== -1 && l >= 1 && l <= endFrontmatterLine) {
                  let lineClass = "";
                  if (l === 1 || l === endFrontmatterLine) {
                    lineClass = "cm-mdsp-property-divider";
                  } else {
                    lineClass = "cm-mdsp-property-line";
                  }

                  builder.add(
                    line.from,
                    line.from,
                    Decoration.line({
                      attributes: { class: lineClass }
                    })
                  );

                  const isLineInCharacters = charRange.start !== -1 && charRange.end !== -1 && l >= charRange.start && l <= charRange.end;
                  const isCursorOnLine = view.state.selection.ranges.some(
                    r => r.from >= line.from && r.to <= line.to
                  );

                  if (isLineInCharacters) {
                    const colorMatch = text.match(/#([a-fA-F0-9]{3,8})/);

                    // Case 1: List item with color: `- '#FF2E2E7D' KAYAK KILLER`
                    const charListMatch = text.match(/^(\s*-\s*)(['"]?#?[a-fA-F0-9]{3,8}['"]?)\s+(.+)$/);
                    if (charListMatch) {
                      const prefixLen = charListMatch[1].length;
                      const colorLen = charListMatch[2].length;

                      if (!isCursorOnLine) {
                        // Hide "- " and the hex color value
                        builder.add(
                          line.from,
                          line.from + prefixLen + colorLen + 1,
                          Decoration.mark({
                            class: "cm-mdsp-syntax-hidden"
                          })
                        );
                      }

                      if (colorMatch) {
                        const color = colorMatch[0];
                        // Render bubble widget at the start of the character name
                        builder.add(
                          line.from + prefixLen + colorLen + 1,
                          line.from + prefixLen + colorLen + 1,
                          Decoration.widget({
                            widget: new ColorBubbleWidget(color, view),
                            side: -1
                          })
                        );
                      }

                      builder.add(
                        line.from + prefixLen + colorLen + 1,
                        line.to,
                        Decoration.mark({
                          class: "cm-mdsp-property-value"
                        })
                      );
                      continue;
                    }

                    // Case 2: Map entry with color: `KAYAK KILLER: '#FF2E2E7D'`
                    const charMapMatch = text.match(/^(\s*)([^:]+)\s*:\s*(['"]?#?[a-fA-F0-9]{3,8}['"]?)\s*$/);
                    if (charMapMatch) {
                      const prefixLen = charMapMatch[1].length;
                      const keyLen = charMapMatch[2].length;

                      if (colorMatch) {
                        const color = colorMatch[0];
                        builder.add(
                          line.from + prefixLen,
                          line.from + prefixLen,
                          Decoration.widget({
                            widget: new ColorBubbleWidget(color, view),
                            side: -1
                          })
                        );
                      }

                      builder.add(
                        line.from + prefixLen,
                        line.from + prefixLen + keyLen,
                        Decoration.mark({
                          class: "cm-mdsp-property-value"
                        })
                      );

                      const colonIndex = text.indexOf(":");
                      if (!isCursorOnLine) {
                        builder.add(
                          line.from + colonIndex,
                          line.to,
                          Decoration.mark({
                            class: "cm-mdsp-syntax-hidden"
                          })
                        );
                      } else {
                        builder.add(
                          line.from + colonIndex + 1,
                          line.to,
                          Decoration.mark({
                            class: "cm-mdsp-property-key"
                          })
                        );
                      }
                      continue;
                    }

                    // Case 3: List item WITHOUT color: `- KAYAK KILLER`
                    const charListNoColorMatch = text.match(/^(\s*-\s*)(.+)$/);
                    if (charListNoColorMatch) {
                      const prefixLen = charListNoColorMatch[1].length;
                      const name = charListNoColorMatch[2].trim();

                      if (name && name !== "---") {
                        if (!isCursorOnLine) {
                          builder.add(
                            line.from,
                            line.from + prefixLen,
                            Decoration.mark({
                              class: "cm-mdsp-syntax-hidden"
                            })
                          );
                        }

                        // Render placeholder bubble widget at the start of the character name
                        builder.add(
                          line.from + prefixLen,
                          line.from + prefixLen,
                          Decoration.widget({
                            widget: new ColorBubbleWidget("", view),
                            side: -1
                          })
                        );

                        builder.add(
                          line.from + prefixLen,
                          line.to,
                          Decoration.mark({
                            class: "cm-mdsp-property-value"
                          })
                        );
                        continue;
                      }
                    }

                    // Case 4: Map entry WITHOUT color: `KAYAK KILLER:`
                    const charMapNoColorMatch = text.match(/^(\s*)([^:]+)\s*:\s*$/);
                    if (charMapNoColorMatch) {
                      const prefixLen = charMapNoColorMatch[1].length;
                      const keyLen = charMapNoColorMatch[2].length;
                      const name = charMapNoColorMatch[2].trim();

                      if (name && name !== "characters" && name !== "---") {
                        builder.add(
                          line.from + prefixLen,
                          line.from + prefixLen,
                          Decoration.widget({
                            widget: new ColorBubbleWidget("", view),
                            side: -1
                          })
                        );

                        builder.add(
                          line.from + prefixLen,
                          line.from + prefixLen + keyLen,
                          Decoration.mark({
                            class: "cm-mdsp-property-value"
                          })
                        );

                        const colonIndex = text.indexOf(":");
                        if (!isCursorOnLine) {
                          builder.add(
                            line.from + colonIndex,
                            line.to,
                            Decoration.mark({
                              class: "cm-mdsp-syntax-hidden"
                            })
                          );
                        }
                        continue;
                      }
                    }
                  }

                  // Fallback for standard properties highlighting (key-value pairs)
                  const keyValMatch = text.match(/^(\s*-?\s*)([a-zA-Z0-9_-]+)\s*:(.*)$/);
                  if (keyValMatch) {
                    const prefixLen = keyValMatch[1].length;
                    const keyLen = keyValMatch[2].length;

                    builder.add(
                      line.from + prefixLen,
                      line.from + prefixLen + keyLen + 1,
                      Decoration.mark({
                        class: "cm-mdsp-property-key"
                      })
                    );

                    if (keyValMatch[3].trim().length > 0) {
                      builder.add(
                        line.from + prefixLen + keyLen + 1,
                        line.to,
                        Decoration.mark({
                          class: "cm-mdsp-property-value"
                        })
                      );
                    }
                  } else {
                    const listItemMatch = text.match(/^(\s*-\s*)(.+)$/);
                    if (listItemMatch) {
                      const prefixLen = listItemMatch[1].length;
                      builder.add(
                        line.from + prefixLen,
                        line.to,
                        Decoration.mark({
                          class: "cm-mdsp-property-value"
                        })
                      );
                    }
                  }
                  continue;
                }

                // Style the screenplay lines
                let lineClass = "";
                if (text.startsWith("##")) {
                  lineClass = "cm-mdsp-scene-heading-sub";
                } else if (text.startsWith("#")) {
                  lineClass = "cm-mdsp-scene-heading";
                } else if (text.startsWith(":")) {
                  lineClass = "cm-mdsp-scene-transition";
                } else if (text.startsWith(">>")) {
                  const trimmed = text.slice(2).trim();
                  if (trimmed.startsWith("(")) {
                    lineClass = "cm-mdsp-dialog-parenthetical";
                  } else {
                    lineClass = "cm-mdsp-dialog";
                  }
                } else if (text.startsWith(">")) {
                  lineClass = "cm-mdsp-dialog-heading";
                } else if (text.trim().length > 0) {
                  lineClass = "cm-mdsp-action";
                }

                if (lineClass) {
                  builder.add(
                    line.from,
                    line.from,
                    Decoration.line({
                      attributes: { class: lineClass }
                    })
                  );

                  // Check if cursor is on this line to dynamically hide prefix formatting characters
                  const isCursorOnLine = view.state.selection.ranges.some(
                    r => r.from >= line.from && r.to <= line.to
                  );

                  if (!isCursorOnLine) {
                    let hideLen = 0;
                    if (text.startsWith("## ")) hideLen = 3;
                    else if (text.startsWith("##")) hideLen = 2;
                    else if (text.startsWith("# ")) hideLen = 2;
                    else if (text.startsWith("#")) hideLen = 1;
                    else if (text.startsWith(">> ")) hideLen = 3;
                    else if (text.startsWith(">>")) hideLen = 2;
                    else if (text.startsWith("> ")) hideLen = 2;
                    else if (text.startsWith(">")) hideLen = 1;
                    else if (text.startsWith(": ")) hideLen = 2;
                    else if (text.startsWith(":")) hideLen = 1;

                    if (hideLen > 0) {
                      builder.add(
                        line.from,
                        line.from + hideLen,
                        Decoration.mark({
                          class: "cm-mdsp-syntax-hidden"
                        })
                      );
                    }
                  }
                }

                // Highlight character references and handle syntax hiding
                const regex = /@\(([^)]+)\)|@(\w+)|\[([^\]]+)\]\(([^)]+)\)/g;
                let match;
                while ((match = regex.exec(text)) !== null) {
                  const fullMatch = match[0];
                  const matchStart = line.from + match.index;
                  const matchEnd = matchStart + fullMatch.length;

                  let characterName = "";
                  let prefixLen = 0;
                  let suffixLen = 0;

                  if (match[1]) {
                    // @(character name)
                    characterName = match[1];
                    prefixLen = 2; // "@("
                    suffixLen = 1; // ")"
                  } else if (match[2]) {
                    // @character
                    characterName = match[2];
                    prefixLen = 1; // "@"
                    suffixLen = 0;
                  } else if (match[4]) {
                    // [alias](character name)
                    const alias = match[3];
                    characterName = match[4];
                    prefixLen = 1; // "["
                    suffixLen = fullMatch.length - prefixLen - alias.length; // "](name)"
                  }

                  if (characterName) {
                    const lowerName = characterName.trim().toLowerCase();
                    const color = colors.get(lowerName);
                    if (color) {
                      // Determine if cursor is on this specific character match range
                      const isCursorOnMatch = view.state.selection.ranges.some(
                        r => r.from <= matchEnd && r.to >= matchStart
                      );

                      // Only highlight and hide syntax if the cursor is NOT on the match range (i.e. editing is not active)
                      if (!isCursorOnMatch) {
                        // 1. Hide formatting brackets/parentheses prefix
                        if (prefixLen > 0) {
                          builder.add(
                            matchStart,
                            matchStart + prefixLen,
                            Decoration.mark({
                              class: "cm-mdsp-syntax-hidden"
                            })
                          );
                        }

                        // 2. Highlight ONLY the visible name/alias part
                        builder.add(
                          matchStart + prefixLen,
                          matchEnd - suffixLen,
                          Decoration.mark({
                            attributes: {
                              style: `background-color: ${color};`
                            },
                            class: "cm-mdsp-character-highlight"
                          })
                        );

                        // 3. Hide formatting brackets/parentheses suffix
                        if (suffixLen > 0) {
                          builder.add(
                            matchEnd - suffixLen,
                            matchEnd,
                            Decoration.mark({
                              class: "cm-mdsp-syntax-hidden"
                            })
                          );
                        }
                      } else {
                        // Apply active class to prevent Obsidian link styles/clicks even during editing
                        builder.add(
                          matchStart,
                          matchEnd,
                          Decoration.mark({
                            class: "cm-mdsp-character-active"
                          })
                        );
                      }
                    }
                  }
                }
              }
            }

            const result = builder.finish();
            logDebug(pluginInstance.app, `buildDecorations finished successfully with size=${result.size}`);
            return result;
          } catch (err: any) {
            logDebug(pluginInstance.app, `ERROR in buildDecorations: ${err.message}\nStack: ${err.stack}`);
            return Decoration.none;
          }
        }
      },
        {
          decorations: (v) => v.decorations,
        }
      ),
      EditorView.domEventHandlers({
        click(event, view) {
          const colors = parseCharactersFromDoc(view.state.doc);
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos !== null && isPosInCharacterMatch(pos, view.state.doc, colors)) {
            event.preventDefault();
            event.stopPropagation();
            return true;
          }
          return false;
        }
      })
    ];
  }
}
