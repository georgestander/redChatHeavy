export type TextSelectionSpan = {
  start: number;
  end: number;
};

function toTextNode(node: Node): Text | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return node as Text;
  }

  return null;
}

export function computeSelectionOffsets(
  root: HTMLElement,
  range: Range,
  options?: {
    includeTextNode?: (node: Text) => boolean;
  }
): TextSelectionSpan | null {
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return null;
  }

  const includeTextNode = options?.includeTextNode;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  let offset = 0;
  let start: number | null = null;
  let end: number | null = null;
  let node: Node | null = walker.nextNode();

  while (node) {
    const textNode = toTextNode(node);
    if (!textNode) {
      node = walker.nextNode();
      continue;
    }

    const includeNode = includeTextNode ? includeTextNode(textNode) : true;
    const textLength = includeNode ? textNode.textContent?.length ?? 0 : 0;

    if (node === range.startContainer) {
      if (!includeNode) {
        return null;
      }
      start = offset + range.startOffset;
    }

    if (node === range.endContainer) {
      if (!includeNode) {
        return null;
      }
      end = offset + range.endOffset;
      break;
    }

    offset += textLength;
    node = walker.nextNode();
  }

  if (start === null || end === null) {
    return null;
  }

  if (start > end) {
    return { start: end, end: start };
  }

  return { start, end };
}
