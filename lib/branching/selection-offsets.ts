export type TextSelectionSpan = {
  start: number;
  end: number;
};

type IncludeTextNode = (node: Text) => boolean;

function createBoundaryRange(
  container: Node,
  offset: number
): Range | null {
  const boundary = document.createRange();
  try {
    boundary.setStart(container, offset);
    boundary.collapse(true);
    return boundary;
  } catch {
    return null;
  }
}

function countCharsBeforeBoundary(
  root: HTMLElement,
  boundaryRange: Range,
  boundaryContainer: Node,
  boundaryOffset: number,
  includeTextNode?: IncludeTextNode
): number | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let total = 0;
  let current = walker.nextNode();

  while (current) {
    const textNode = current as Text;
    const fullLength = textNode.textContent?.length ?? 0;
    const includeNode = includeTextNode ? includeTextNode(textNode) : true;
    const includedLength = includeNode ? fullLength : 0;

    if (textNode === boundaryContainer) {
      if (!includeNode) {
        return null;
      }

      const clampedOffset = Math.max(0, Math.min(boundaryOffset, fullLength));
      return total + clampedOffset;
    }

    if (fullLength === 0) {
      current = walker.nextNode();
      continue;
    }

    let endCompare = 1;
    let startCompare = 1;
    try {
      // For a collapsed boundary range:
      // -1 means the compared point is before the boundary
      //  0 means equal to the boundary
      //  1 means after the boundary
      startCompare = boundaryRange.comparePoint(textNode, 0);
      endCompare = boundaryRange.comparePoint(textNode, fullLength);
    } catch {
      current = walker.nextNode();
      continue;
    }

    if (endCompare <= 0) {
      total += includedLength;
      current = walker.nextNode();
      continue;
    }

    if (startCompare === 1) {
      return total;
    }

    if (includeNode) {
      // Defensive fallback for boundary points that land within complex node trees.
      try {
        const partial = document.createRange();
        partial.setStart(textNode, 0);
        partial.setEnd(
          boundaryRange.startContainer,
          boundaryRange.startOffset
        );
        const partialLength = partial.toString().length;
        total += Math.max(0, Math.min(partialLength, fullLength));
      } catch {
        // Ignore and return best effort accumulated offset.
      }
    }

    return total;
  }

  return total;
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
  const startBoundary = createBoundaryRange(
    range.startContainer,
    range.startOffset
  );
  const endBoundary = createBoundaryRange(range.endContainer, range.endOffset);
  if (!startBoundary || !endBoundary) {
    return null;
  }

  const start = countCharsBeforeBoundary(
    root,
    startBoundary,
    range.startContainer,
    range.startOffset,
    includeTextNode
  );
  const end = countCharsBeforeBoundary(
    root,
    endBoundary,
    range.endContainer,
    range.endOffset,
    includeTextNode
  );
  if (start === null || end === null) {
    return null;
  }

  if (start > end) {
    return { start: end, end: start };
  }

  return { start, end };
}
