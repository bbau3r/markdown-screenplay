/**
 * Markdown reading-view post-processor for MDSP screenplay documents.
 *
 * In Obsidian's reading view (preview mode), the markdown is rendered as HTML.
 * This post-processor re-classifies the rendered elements and applies
 * screenplay-specific styling (scene headings, dialog blocks, transitions, etc.)
 * and character name highlighting.
 */

import { TFile } from "obsidian";
import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { LineClassification, CharacterColorMap } from "./types";
import { CLASSIFICATION_CSS_CLASS, CHARACTER_REF_REGEX } from "./types";
import { parseCharacterColorsFromCache } from "./frontmatter";
import { classifyFile } from "./classifier";
import { logDebug } from "./utils";

/** Cached classifications per file to avoid re-parsing on every render. */
interface ClassificationsCache {
  mtime: number;
  list: LineClassification[];
}

/**
 * Registers the markdown post-processor that applies screenplay formatting
 * to rendered content in Obsidian's reading view.
 */
export function createPostProcessor(
  app: App,
  isScreenplayFile: (file: TFile) => boolean,
  getClassifications: (file: TFile) => Promise<LineClassification[]>,
) {
  return async (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
    logDebug(app, `Markdown post-processor running for ${ctx.sourcePath}`);

    try {
      const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
      if (!(file instanceof TFile) || !isScreenplayFile(file)) {
        return;
      }

      const cache = app.metadataCache.getFileCache(file);
      const colors = parseCharacterColorsFromCache(cache?.frontmatter as Record<string, unknown>);

      // Apply line classifications to rendered elements
      const classifications = await getClassifications(file);
      applyClassificationsToRenderedHTML(el, ctx, classifications);

      logDebug(app, `Parsed Reading View YAML colors count: ${colors.size}`);
      if (colors.size === 0) return;

      // Highlight character references
      highlightCharacterLinks(el, colors);
      highlightCharacterAtRefs(el, colors);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logDebug(app, `ERROR in Reading View post-processor: ${msg}`);
    }
  };
}

// ─── Classification Application ──────────────────────────────────────────────

/**
 * Applies line classifications to the rendered HTML elements in reading view.
 * Walks through `<h1-h6>` and `<p>` elements and maps them to their classified types.
 */
function applyClassificationsToRenderedHTML(
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  classifications: LineClassification[],
): void {
  const info = ctx.getSectionInfo(el);
  if (!info) return;

  const childNodes = Array.from(el.childNodes);
  let currentLine = info.lineStart;

  for (const child of childNodes) {
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const childEl = child as HTMLElement;
    const nodeName = childEl.nodeName.toLowerCase();

    // Skip blank/frontmatter lines
    currentLine = skipNonContentLines(currentLine, info.lineEnd, classifications);
    if (currentLine > info.lineEnd || currentLine >= classifications.length) break;

    if (/^h[1-6]$/.test(nodeName)) {
      const type = classifications[currentLine].type;
      childEl.className = type === "scene-heading-sub" ? "cm-mdsp-scene-heading-sub" : "cm-mdsp-scene-heading";
      stripPrefixFromLineElement(childEl, type);
      currentLine++;
    } else if (nodeName === "p") {
      currentLine = processParagraph(childEl, currentLine, info.lineEnd, classifications);
    }
  }
}

/**
 * Processes a `<p>` element that may contain multiple lines separated by `<br>`.
 * Splits the paragraph into styled spans, one per classified line.
 */
function processParagraph(
  pEl: HTMLElement,
  currentLine: number,
  endLine: number,
  classifications: LineClassification[],
): number {
  const brCount = pEl.querySelectorAll("br").length;
  const lineTypes: string[] = [];

  for (let i = 0; i <= brCount; i++) {
    currentLine = skipNonContentLines(currentLine, endLine, classifications);
    if (currentLine <= endLine && currentLine < classifications.length) {
      lineTypes.push(classifications[currentLine].type);
      currentLine++;
    } else {
      lineTypes.push("action");
    }
  }

  const newEls = splitParagraphByBr(pEl, lineTypes);
  pEl.innerHTML = "";
  for (const newEl of newEls) {
    pEl.appendChild(newEl);
  }

  return currentLine;
}

/**
 * Advances the line counter past blank and frontmatter lines.
 */
function skipNonContentLines(
  currentLine: number,
  endLine: number,
  classifications: LineClassification[],
): number {
  while (
    currentLine <= endLine &&
    currentLine < classifications.length &&
    (classifications[currentLine].type === "blank" || classifications[currentLine].type === "frontmatter")
  ) {
    currentLine++;
  }
  return currentLine;
}

// ─── Line Element Helpers ────────────────────────────────────────────────────

/**
 * Strips MDSP formatting prefixes/suffixes from a rendered line element.
 * For example, removes `# ` from scene headings, `: ` from transitions, `@` from characters.
 */
function stripPrefixFromLineElement(lineEl: HTMLElement, type: string): void {
  const firstChild = lineEl.firstChild;
  if (firstChild && firstChild.nodeType === Node.TEXT_NODE) {
    const val = firstChild.nodeValue || "";

    if (type === "scene-heading" || type === "scene-heading-sub") {
      const match = val.match(/^#+\s*/);
      if (match) firstChild.nodeValue = val.slice(match[0].length);
    } else if (type === "scene-transition") {
      const match = val.match(/^:\s*/);
      if (match) firstChild.nodeValue = val.slice(match[0].length);
    } else if (type === "dialog-character") {
      if (val.startsWith("@")) firstChild.nodeValue = val.slice(1);
    } else if (type === "centered-action") {
      const match = val.match(/^>\s*/);
      if (match) firstChild.nodeValue = val.slice(match[0].length);
    }
  }

  // Also strip trailing less-than sign from centered actions
  if (type === "centered-action") {
    const lastChild = lineEl.lastChild;
    if (lastChild && lastChild.nodeType === Node.TEXT_NODE) {
      const val = lastChild.nodeValue || "";
      const match = val.match(/\s*<$/);
      if (match) lastChild.nodeValue = val.slice(0, -match[0].length);
    }
  }
}

/**
 * Splits a `<p>` element into individual styled `<span>` elements at each `<br>`.
 * Each resulting span gets a CSS class based on its line type.
 */
function splitParagraphByBr(pEl: HTMLElement, lineTypes: string[]): HTMLElement[] {
  const result: HTMLElement[] = [];
  let currentGroup: Node[] = [];
  let lineIdx = 0;

  for (const node of Array.from(pEl.childNodes)) {
    if (node.nodeName.toLowerCase() === "br") {
      result.push(createLineElement(currentGroup, lineTypes[lineIdx] || "action"));
      currentGroup = [];
      lineIdx++;
    } else {
      currentGroup.push(node);
    }
  }

  result.push(createLineElement(currentGroup, lineTypes[lineIdx] || "action"));
  return result;
}

/**
 * Creates a styled `<span>` element for a single classified line.
 */
function createLineElement(nodes: Node[], type: string): HTMLElement {
  const lineEl = document.createElement("span");
  lineEl.style.display = "block";
  lineEl.className = CLASSIFICATION_CSS_CLASS[type] || "cm-mdsp-action";

  for (const node of nodes) {
    lineEl.appendChild(node);
  }

  stripPrefixFromLineElement(lineEl, type);
  return lineEl;
}

// ─── Character Highlighting ──────────────────────────────────────────────────

/**
 * Styles internal links (`[alias](character)`) as non-clickable character highlights.
 */
function highlightCharacterLinks(el: HTMLElement, colors: CharacterColorMap): void {
  const links = el.querySelectorAll("a.internal-link");
  links.forEach((linkEl) => {
    const href = linkEl.getAttribute("data-href") || linkEl.getAttribute("href") || "";
    const color = colors.get(href.trim().toLowerCase());
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
}

/**
 * Finds and highlights `@Name` and `@(Name)` character references in text nodes.
 */
function highlightCharacterAtRefs(el: HTMLElement, colors: CharacterColorMap): void {
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
  const nodesToReplace: { node: globalThis.Text; parent: ParentNode; newNodes: Node[] }[] = [];
  const skipParents = new Set(["code", "pre", "a", "style", "script"]);

  let node: globalThis.Text | null;
  while ((node = walk.nextNode() as globalThis.Text)) {
    const parentName = node.parentNode?.nodeName.toLowerCase();
    if (parentName && skipParents.has(parentName)) continue;

    const text = node.nodeValue || "";
    const regex = /@\(([^)]+)\)|@(\w+)/g;
    if (!regex.test(text)) continue;

    regex.lastIndex = 0;
    const newNodes = buildReplacementNodes(text, regex, colors);
    if (newNodes.length > 0) {
      nodesToReplace.push({ node, parent: node.parentNode!, newNodes });
    }
  }

  // Apply replacements (after walking to avoid mutation during iteration)
  for (const { node: targetNode, parent, newNodes } of nodesToReplace) {
    if (parent.contains(targetNode)) {
      const fragment = document.createDocumentFragment();
      for (const n of newNodes) fragment.appendChild(n);
      parent.replaceChild(fragment, targetNode);
    }
  }
}

/**
 * Builds replacement DOM nodes for a text string containing @-references.
 * Returns the new nodes, or an empty array if no replacements are needed.
 */
function buildReplacementNodes(
  text: string,
  regex: RegExp,
  colors: CharacterColorMap,
): Node[] {
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  const newNodes: Node[] = [];

  while ((match = regex.exec(text)) !== null) {
    const characterName = match[1] || match[2] || "";
    const color = colors.get(characterName.trim().toLowerCase());
    if (!color) continue;

    // Text before this match
    if (match.index > lastIdx) {
      newNodes.push(document.createTextNode(text.substring(lastIdx, match.index)));
    }

    // Highlighted character span
    const span = document.createElement("span");
    span.className = "cm-mdsp-character-highlight";
    span.style.backgroundColor = color;
    span.textContent = characterName;
    newNodes.push(span);

    lastIdx = match.index + match[0].length;
  }

  // Trailing text
  if (lastIdx < text.length && newNodes.length > 0) {
    newNodes.push(document.createTextNode(text.substring(lastIdx)));
  }

  return newNodes;
}
