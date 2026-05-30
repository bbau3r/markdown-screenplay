import { Plugin, MarkdownView, TFile, App } from "obsidian";
import { RangeSetBuilder, Text } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";

function logDebug(app: App, msg: string) {
  try {
    const timestamp = new Date().toISOString();
    app.vault.adapter.append("screenplay-debug.log", `[${timestamp}] ${msg}\n`);
  } catch (e) { }
}

function cleanBOM(str: string): string {
  if (str && str.charCodeAt(0) === 0xFEFF) {
    return str.slice(1);
  }
  return str;
}

// Custom parser to extract frontmatter data when Obsidian's metadataCache isn't fully ready or available
function parseFrontmatterText(text: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return result;

  const firstLine = cleanBOM(lines[0].trim());
  if (firstLine !== "---") return result;

  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) return result;

  let currentKey = "";
  let inCharacters = false;
  let currentCharacterName = "";
  
  for (let i = 1; i < endIdx; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    const indent = line.length - line.trimStart().length;

    if (indent === 0) {
      const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*:(.*)$/);
      if (match) {
        currentKey = match[1].trim();
        const valuePart = match[2].trim();
        inCharacters = (currentKey === "characters");
        
        if (inCharacters) {
          result[currentKey] = {};
        } else if (valuePart) {
          result[currentKey] = parseScalarValue(valuePart);
        } else {
          result[currentKey] = null;
        }
        continue;
      }
    }

    if (inCharacters) {
      if (trimmed.startsWith("-")) {
        const item = trimmed.substring(1).trim();
        const colorMatch = item.match(/^(['"]?#?[a-fA-F0-9]{3,8}['"]?)\s+(.+)$/);
        if (colorMatch) {
          const color = colorMatch[1].replace(/^['"]|['"]$/g, '');
          const name = colorMatch[2].trim();
          result.characters[name] = { color };
        } else {
          result.characters[item] = {};
        }
      } else {
        const colonMatch = trimmed.match(/^([^:]+)\s*:(.*)$/);
        if (colonMatch) {
          const key = colonMatch[1].trim();
          const val = colonMatch[2].trim();
          
          if (indent === 2) {
            currentCharacterName = key;
            if (val) {
              result.characters[currentCharacterName] = parseScalarValue(val);
            } else {
              result.characters[currentCharacterName] = {};
            }
          } else if (indent > 2 && currentCharacterName) {
            if (key === "color") {
              const colorVal = val.replace(/^['"]|['"]$/g, '');
              if (typeof result.characters[currentCharacterName] !== "object") {
                result.characters[currentCharacterName] = {};
              }
              result.characters[currentCharacterName].color = colorVal;
            } else {
              if (typeof result.characters[currentCharacterName] !== "object") {
                result.characters[currentCharacterName] = {};
              }
              result.characters[currentCharacterName][key] = parseScalarValue(val);
            }
          }
        }
      }
    } else if (currentKey) {
      if (trimmed.startsWith("-")) {
        if (!Array.isArray(result[currentKey])) {
          result[currentKey] = [];
        }
        result[currentKey].push(parseScalarValue(trimmed.substring(1).trim()));
      } else {
        const match = trimmed.match(/^([^:]+)\s*:(.*)$/);
        if (match) {
          const subKey = match[1].trim();
          const subVal = match[2].trim();
          if (result[currentKey] === null || typeof result[currentKey] !== "object") {
            result[currentKey] = {};
          }
          result[currentKey][subKey] = parseScalarValue(subVal);
        }
      }
    }
  }

  return result;
}

function parseScalarValue(val: string): any {
  val = val.trim();
  if (!val) return "";
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1);
  }
  if (val.toLowerCase() === "true") return true;
  if (val.toLowerCase() === "false") return false;
  if (val.toLowerCase() === "null") return null;
  const num = Number(val);
  if (!isNaN(num)) return num;
  return val;
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
  } catch (e) { }

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
  } catch (e) { }
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

    // Register events to update CSS classes and custom properties panel
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.updateEditorClasses();
        setTimeout(() => this.setupPropertiesPanel(), 200);
      })
    );
    this.registerEvent(
      this.app.metadataCache.on("changed", () => {
        this.updateEditorClasses();
        if (!this.savingFrontmatter) {
          this.setupPropertiesPanel();
        }
      })
    );
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        setTimeout(() => this.setupPropertiesPanel(), 150);
      })
    );

    // Initial check
    this.app.workspace.onLayoutReady(() => {
      this.updateEditorClasses();
      setTimeout(() => this.setupPropertiesPanel(), 500);
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

        // Classify screenplay layout elements in Reading View
        el.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((headerEl) => {
          headerEl.classList.add("cm-mdsp-scene-heading");
        });

        el.querySelectorAll("blockquote").forEach((bqEl) => {
          let depth = 0;
          let current: HTMLElement | null = bqEl;
          while (current && current !== el) {
            if (current.nodeName.toLowerCase() === "blockquote") {
              depth++;
            }
            current = current.parentElement;
          }

          if (depth === 1) {
            bqEl.classList.add("cm-mdsp-dialog-heading");
          } else if (depth >= 2) {
            const text = bqEl.textContent?.trim() || "";
            if (text.startsWith("(")) {
              bqEl.classList.add("cm-mdsp-dialog-parenthetical");
            } else {
              bqEl.classList.add("cm-mdsp-dialog");
            }
          }
        });

        el.querySelectorAll("p").forEach((pEl) => {
          if (pEl.closest("blockquote")) {
            return;
          }

          const text = pEl.textContent?.trim() || "";
          if (text.startsWith(":")) {
            pEl.classList.add("cm-mdsp-scene-transition");
            const firstChild = pEl.firstChild;
            if (firstChild && firstChild.nodeType === Node.TEXT_NODE) {
              const val = firstChild.nodeValue || "";
              if (val.trimStart().startsWith(":")) {
                firstChild.nodeValue = val.trimStart().slice(1).trimStart();
              }
            }
          } else {
            pEl.classList.add("cm-mdsp-action");
          }
        });

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

  // --- Properties panel state ---
  private panelObservers: MutationObserver[] = [];
  private panelDebounce: ReturnType<typeof setTimeout> | null = null;
  private savingFrontmatter = false;

  onunload() {
    console.log("Unloading Screenplay MDSP Plugin...");
    this.teardownPanelObservers();
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof MarkdownView) {
        view.contentEl.classList.remove("mdsp-enabled");
        view.contentEl.querySelectorAll('.mdsp-props-panel').forEach((el: Element) => el.remove());
      }
    }
  }

  teardownPanelObservers() {
    for (const obs of this.panelObservers) obs.disconnect();
    this.panelObservers = [];
  }

  getFrontmatter(view: MarkdownView): Record<string, any> {
    try {
      const text = view.editor.getValue();
      if (text) {
        const fm = parseFrontmatterText(text);
        if (fm && Object.keys(fm).length > 0) {
          return fm;
        }
      }
    } catch (e) { }

    // Fallback to Obsidian cache
    const file = view.file;
    if (file) {
      const cache = this.app.metadataCache.getFileCache(file);
      return cache?.frontmatter || {};
    }
    return {};
  }

  setupPropertiesPanel() {
    logDebug(this.app, "setupPropertiesPanel called");
    this.teardownPanelObservers();

    const leaves = this.app.workspace.getLeavesOfType("markdown");
    logDebug(this.app, `setupPropertiesPanel found ${leaves.length} markdown leaves`);
    for (const leaf of leaves) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) {
        logDebug(this.app, `Leaf view is not MarkdownView: ${view ? view.getViewType() : "null"}`);
        continue;
      }
      const file = view.file;
      logDebug(this.app, `setupPropertiesPanel file: ${file ? file.path : "null"}`);
      if (!file || !this.isScreenplayFile(file)) {
        logDebug(this.app, `setupPropertiesPanel file is not screenplay: ${file ? file.path : "null"}`);
        continue;
      }

      const contentEl = view.contentEl;
      const fm = this.getFrontmatter(view);
      this.injectPropertiesPanel(contentEl, view, fm);

      // Observe so we re-inject after Obsidian rebuilds DOM
      const viewContent = contentEl.querySelector('.cm-editor')?.parentElement || contentEl;
      const observer = new MutationObserver(() => {
        if (this.savingFrontmatter) return;
        if (this.panelDebounce) clearTimeout(this.panelDebounce);
        this.panelDebounce = setTimeout(() => {
          const freshFm = this.getFrontmatter(view);
          this.injectPropertiesPanel(contentEl, view, freshFm);
        }, 120);
      });
      observer.observe(viewContent, { childList: true });
      this.panelObservers.push(observer);
    }
  }

  injectPropertiesPanel(contentEl: HTMLElement, view: MarkdownView, fm: Record<string, any>) {
    const file = view.file;
    if (!file) return;

    logDebug(this.app, `injectPropertiesPanel called for file: ${file.path}`);
    const existing = contentEl.querySelector('.mdsp-props-panel');
    if (existing) {
      if (existing.contains(document.activeElement)) {
        logDebug(this.app, `injectPropertiesPanel: panel exists and user is focusing/editing inside it, skipping rebuild`);
        return;
      }
      logDebug(this.app, `injectPropertiesPanel: removing existing panel for rebuild`);
      existing.remove();
    }

    logDebug(this.app, `injectPropertiesPanel: active frontmatter = ${JSON.stringify(fm)}`);

    const panel = document.createElement('div');
    panel.className = 'mdsp-props-panel';

    const hdr = document.createElement('div');
    hdr.className = 'mdsp-props-header';
    hdr.textContent = 'Properties';
    panel.appendChild(hdr);

    const body = document.createElement('div');
    body.className = 'mdsp-props-body';
    panel.appendChild(body);

    const skip = new Set(['position', 'cssclasses', 'cssclass', 'syntax', 'characters', 'authors']);

    for (const [key, value] of Object.entries(fm)) {
      if (skip.has(key)) continue;
      this.renderGenericProperty(body, view, key, value);
    }

    // Always render authors block
    this.renderAuthorsBlock(body, view, fm.authors);

    // Always render characters block
    this.renderCharactersBlock(body, view, fm.characters);

    const metaC = contentEl.querySelector('.metadata-container');
    if (metaC) {
      logDebug(this.app, `injectPropertiesPanel: found .metadata-container, inserting before it`);
      metaC.parentElement!.insertBefore(panel, metaC);
    } else {
      logDebug(this.app, `injectPropertiesPanel: NO .metadata-container found, prepending to contentEl`);
      contentEl.prepend(panel);
    }
  }

  renderGenericProperty(parent: HTMLElement, view: MarkdownView, key: string, value: any) {
    const row = document.createElement('div');
    row.className = 'mdsp-prop-row';

    const label = document.createElement('span');
    label.className = 'mdsp-prop-label';
    label.textContent = key;
    row.appendChild(label);

    if (Array.isArray(value)) {
      const tagsWrap = document.createElement('div');
      tagsWrap.className = 'mdsp-prop-tags';
      for (const item of value) {
        const tag = document.createElement('span');
        tag.className = 'mdsp-prop-tag';
        tag.textContent = String(item);
        tagsWrap.appendChild(tag);
      }
      row.appendChild(tagsWrap);
    } else {
      const valEl = document.createElement('span');
      valEl.className = 'mdsp-prop-value';
      valEl.textContent = String(value ?? '');
      valEl.contentEditable = 'true';
      valEl.spellcheck = false;
      valEl.addEventListener('blur', () => {
        const newVal = valEl.textContent?.trim() ?? '';
        if (newVal !== String(value)) {
          this.saveGenericProperty(view, key, newVal);
        }
      });
      valEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); valEl.blur(); }
      });
      row.appendChild(valEl);
    }

    parent.appendChild(row);
  }

  renderAuthorsBlock(parent: HTMLElement, view: MarkdownView, authorsVal: any) {
    const block = document.createElement('div');
    block.className = 'mdsp-authors-block';

    const hdr = document.createElement('div');
    hdr.className = 'mdsp-authors-label';
    hdr.textContent = 'authors';
    block.appendChild(hdr);

    const authors: string[] = [];
    if (Array.isArray(authorsVal)) {
      for (const item of authorsVal) {
        if (item) authors.push(String(item));
      }
    } else if (typeof authorsVal === 'string' && authorsVal.trim()) {
      authors.push(authorsVal.trim());
    }

    const list = document.createElement('div');
    list.className = 'mdsp-authors-list';
    block.appendChild(list);

    const self = this;

    const render = () => {
      list.innerHTML = '';

      for (let i = 0; i < authors.length; i++) {
        const author = authors[i];
        const row = document.createElement('div');
        row.className = 'mdsp-author-row';

        const nameEl = document.createElement('span');
        nameEl.className = 'mdsp-author-name';
        nameEl.textContent = author;
        nameEl.contentEditable = 'true';
        nameEl.spellcheck = false;
        nameEl.addEventListener('blur', () => {
          const n = nameEl.textContent?.trim() || '';
          if (n && n !== authors[i]) {
            authors[i] = n;
            self.saveAuthors(view, authors);
          }
        });
        nameEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            nameEl.blur();
          }
        });
        row.appendChild(nameEl);

        const del = document.createElement('span');
        del.className = 'mdsp-author-del';
        del.innerHTML = '&times;';
        del.title = 'Remove';
        del.addEventListener('click', () => {
          authors.splice(i, 1);
          self.saveAuthors(view, authors);
          render();
        });
        row.appendChild(del);

        list.appendChild(row);
      }

      const add = document.createElement('div');
      add.className = 'mdsp-author-add-btn';
      add.textContent = '+ Add author';
      add.addEventListener('click', () => {
        authors.push('NEW AUTHOR');
        self.saveAuthors(view, authors);
        render();
        const last = list.querySelector('.mdsp-author-row:last-of-type .mdsp-author-name') as HTMLElement;
        if (last) {
          last.focus();
          const r = document.createRange();
          r.selectNodeContents(last);
          const s = window.getSelection();
          s?.removeAllRanges();
          s?.addRange(r);
        }
      });
      list.appendChild(add);
    };

    render();
    parent.appendChild(block);
  }

  renderCharactersBlock(parent: HTMLElement, view: MarkdownView, charsObj: any) {
    const block = document.createElement('div');
    block.className = 'mdsp-chars-block';

    const hdr = document.createElement('div');
    hdr.className = 'mdsp-chars-label';
    hdr.textContent = 'characters';
    block.appendChild(hdr);

    const characters: { name: string; color: string }[] = [];
    if (typeof charsObj === 'object' && !Array.isArray(charsObj) && charsObj !== null) {
      for (const [key, val] of Object.entries(charsObj)) {
        if (val && typeof val === 'object' && (val as any).color) {
          characters.push({ name: key, color: String((val as any).color).replace(/^['"]|['"]$/g, '') });
        } else if (typeof val === 'string') {
          characters.push({ name: key, color: val.replace(/^['"]|['"]$/g, '') });
        } else {
          characters.push({ name: key, color: '' });
        }
      }
    }

    const list = document.createElement('div');
    list.className = 'mdsp-chars-list';
    block.appendChild(list);

    const self = this;

    const render = () => {
      list.innerHTML = '';

      for (let i = 0; i < characters.length; i++) {
        const c = characters[i];
        const row = document.createElement('div');
        row.className = 'mdsp-char-row';

        const bubble = document.createElement('span');
        bubble.className = 'mdsp-char-bubble';
        if (c.color) {
          bubble.style.backgroundColor = c.color;
        } else {
          bubble.classList.add('mdsp-char-bubble-empty');
        }

        const picker = document.createElement('input');
        picker.type = 'color';
        picker.className = 'mdsp-char-picker';
        let hex6 = '#808080';
        if (c.color?.startsWith('#')) hex6 = c.color.length >= 7 ? c.color.slice(0, 7) : c.color;
        picker.value = hex6;

        bubble.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); picker.click(); });
        picker.addEventListener('input', () => {
          bubble.style.backgroundColor = picker.value + (c.color?.length === 9 ? c.color.slice(7) : '7D');
        });
        picker.addEventListener('change', () => {
          let alpha = '7D';
          if (c.color?.startsWith('#') && c.color.length === 9) alpha = c.color.slice(7);
          characters[i].color = picker.value + alpha;
          self.saveCharacters(view, characters);
          bubble.style.backgroundColor = characters[i].color;
          bubble.classList.remove('mdsp-char-bubble-empty');
        });

        row.appendChild(bubble);
        row.appendChild(picker);

        const nameEl = document.createElement('span');
        nameEl.className = 'mdsp-char-name';
        nameEl.textContent = c.name;
        nameEl.contentEditable = 'true';
        nameEl.spellcheck = false;
        nameEl.addEventListener('blur', () => {
          const n = nameEl.textContent?.trim() || '';
          if (n && n !== c.name) { characters[i].name = n; self.saveCharacters(view, characters); }
        });
        nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); } });
        row.appendChild(nameEl);

        const del = document.createElement('span');
        del.className = 'mdsp-char-del';
        del.innerHTML = '&times;';
        del.title = 'Remove';
        del.addEventListener('click', () => {
          characters.splice(i, 1); self.saveCharacters(view, characters); render();
        });
        row.appendChild(del);

        list.appendChild(row);
      }

      const add = document.createElement('div');
      add.className = 'mdsp-char-add-btn';
      add.textContent = '+ Add character';
      add.addEventListener('click', () => {
        characters.push({ name: 'NEW CHARACTER', color: '' });
        self.saveCharacters(view, characters);
        render();
        const last = list.querySelector('.mdsp-char-row:last-of-type .mdsp-char-name') as HTMLElement;
        if (last) {
          last.focus();
          const r = document.createRange(); r.selectNodeContents(last);
          const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r);
        }
      });
      list.appendChild(add);
    };

    render();
    parent.appendChild(block);
  }

  saveFrontmatterToEditor(view: MarkdownView, fm: Record<string, any>) {
    try {
      const docText = view.editor.getValue();
      const lines = docText.split(/\r?\n/);
      
      let startIdx = -1;
      let endIdx = -1;
      
      if (lines.length > 0 && cleanBOM(lines[0].trim()) === "---") {
        startIdx = 0;
        for (let i = 1; i < lines.length; i++) {
          if (lines[i].trim() === "---") {
            endIdx = i;
            break;
          }
        }
      }
      
      const yamlLines: string[] = ["---"];
      for (const [key, value] of Object.entries(fm)) {
        if (key === "characters") {
          yamlLines.push("characters:");
          if (value && typeof value === "object") {
            for (const [charName, charInfo] of Object.entries(value)) {
              if (charInfo && typeof charInfo === "object" && (charInfo as any).color) {
                yamlLines.push(`  ${charName}:`);
                yamlLines.push(`    color: "${(charInfo as any).color}"`);
              } else if (typeof charInfo === "string") {
                yamlLines.push(`  ${charName}: "${charInfo}"`);
              } else {
                yamlLines.push(`  ${charName}:`);
              }
            }
          }
        } else if (key === "authors") {
          yamlLines.push("authors:");
          if (Array.isArray(value)) {
            for (const author of value) {
              yamlLines.push(`  - ${author}`);
            }
          }
        } else {
          if (typeof value === "string") {
            yamlLines.push(`${key}: "${value}"`);
          } else {
            yamlLines.push(`${key}: ${value}`);
          }
        }
      }
      yamlLines.push("---");
      
      const newFrontmatterText = yamlLines.join("\n");
      
      if (startIdx !== -1 && endIdx !== -1) {
        view.editor.replaceRange(newFrontmatterText + "\n", { line: 0, ch: 0 }, { line: endIdx + 1, ch: 0 });
      } else {
        view.editor.replaceRange(newFrontmatterText + "\n\n", { line: 0, ch: 0 });
      }
    } catch (e) {
      console.error("Failed to save frontmatter to editor:", e);
    }
  }

  saveGenericProperty(view: MarkdownView, key: string, newValue: any) {
    const fm = this.getFrontmatter(view);
    fm[key] = newValue;
    this.saveFrontmatterToEditor(view, fm);
  }

  saveCharacters(view: MarkdownView, characters: { name: string; color: string }[]) {
    const fm = this.getFrontmatter(view);
    const obj: Record<string, any> = {};
    for (const c of characters) {
      obj[c.name] = c.color ? { color: c.color } : {};
    }
    fm.characters = obj;
    this.saveFrontmatterToEditor(view, fm);
  }

  saveAuthors(view: MarkdownView, authors: string[]) {
    const fm = this.getFrontmatter(view);
    fm.authors = authors;
    this.saveFrontmatterToEditor(view, fm);
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
              } catch (e) { }

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
