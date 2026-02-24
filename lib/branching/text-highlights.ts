export type BranchTextHighlight = {
  start: number;
  end: number;
  branchId: string;
  messageId?: string | null;
  isActive?: boolean;
  className?: string;
};

type HastNode = HastTextNode | HastElementNode | HastRootNode;

type HastTextNode = {
  type: "text";
  value: string;
};

type HastElementNode = {
  type: "element";
  tagName: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

type HastRootNode = {
  type: "root";
  children?: HastNode[];
};

type HastNodeWithChildren = (HastElementNode | HastRootNode) & {
  children: HastNode[];
};

type HighlightTraversalState = {
  offset: number;
  nextHighlightIndex: number;
};

function hasChildren(node: HastNode): node is HastNodeWithChildren {
  return "children" in node && Array.isArray(node.children);
}

function isTextNode(node: HastNode): node is HastTextNode {
  return node.type === "text";
}

function toNormalizedOffset(value: number): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.floor(value));
}

export function normalizeBranchTextHighlights(
  highlights: readonly BranchTextHighlight[]
): BranchTextHighlight[] {
  const candidates = highlights
    .map((highlight) => {
      const start = toNormalizedOffset(highlight.start);
      const end = toNormalizedOffset(highlight.end);
      const branchId = highlight.branchId.trim();

      if (start === null || end === null || !branchId || start >= end) {
        return null;
      }

      return {
        ...highlight,
        start,
        end,
        branchId,
      } satisfies BranchTextHighlight;
    })
    .filter((highlight): highlight is BranchTextHighlight => highlight !== null)
    .sort(
      (left, right) =>
        left.start - right.start ||
        left.end - right.end ||
        left.branchId.localeCompare(right.branchId)
    );

  const normalized: BranchTextHighlight[] = [];

  for (const candidate of candidates) {
    const previous = normalized.at(-1);
    if (!previous) {
      normalized.push(candidate);
      continue;
    }

    if (candidate.start >= previous.end) {
      normalized.push(candidate);
      continue;
    }

    if (candidate.end <= previous.end) {
      continue;
    }

    normalized.push({
      ...candidate,
      start: previous.end,
    });
  }

  return normalized;
}

function createHighlightNode(
  value: string,
  highlight: BranchTextHighlight
): HastElementNode {
  const classNames = ["branch-highlight"];
  if (highlight.className) {
    classNames.push(highlight.className);
  }

  const properties: Record<string, string | string[]> = {
    className: classNames,
    "data-branch-highlight": "true",
    "data-branch-id": highlight.branchId,
  };

  if (highlight.messageId) {
    properties["data-message-id"] = highlight.messageId;
  }

  if (highlight.isActive) {
    properties["data-branch-active"] = "true";
  }

  return {
    type: "element",
    tagName: "mark",
    properties,
    children: [{ type: "text", value }],
  };
}

function nextHighlightIndexAfterNode(
  highlights: readonly BranchTextHighlight[],
  startIndex: number,
  nodeEndOffset: number
): number {
  let index = startIndex;
  while (index < highlights.length && highlights[index].end <= nodeEndOffset) {
    index += 1;
  }
  return index;
}

function splitTextNodeByHighlights(
  node: HastTextNode,
  state: HighlightTraversalState,
  highlights: readonly BranchTextHighlight[]
): HastNode[] | null {
  const value = node.value;
  if (!value) {
    return null;
  }

  const nodeStart = state.offset;
  const nodeEnd = nodeStart + value.length;
  state.offset = nodeEnd;

  let index = state.nextHighlightIndex;
  while (index < highlights.length && highlights[index].end <= nodeStart) {
    index += 1;
  }

  state.nextHighlightIndex = index;

  if (index >= highlights.length || highlights[index].start >= nodeEnd) {
    return null;
  }

  const fragments: HastNode[] = [];
  let localCursor = 0;
  let activeIndex = index;

  while (activeIndex < highlights.length) {
    const highlight = highlights[activeIndex];
    if (highlight.start >= nodeEnd) {
      break;
    }

    const highlightStart = Math.max(highlight.start, nodeStart) - nodeStart;
    const highlightEnd = Math.min(highlight.end, nodeEnd) - nodeStart;

    if (highlightEnd <= highlightStart) {
      activeIndex += 1;
      continue;
    }

    if (highlightStart > localCursor) {
      fragments.push({
        type: "text",
        value: value.slice(localCursor, highlightStart),
      });
    }

    fragments.push(
      createHighlightNode(value.slice(highlightStart, highlightEnd), highlight)
    );
    localCursor = highlightEnd;

    if (highlight.end <= nodeEnd) {
      activeIndex += 1;
      continue;
    }

    break;
  }

  if (localCursor < value.length) {
    fragments.push({ type: "text", value: value.slice(localCursor) });
  }

  state.nextHighlightIndex = nextHighlightIndexAfterNode(
    highlights,
    index,
    nodeEnd
  );

  return fragments;
}

function applyHighlightsToChildren(
  children: HastNode[],
  state: HighlightTraversalState,
  highlights: readonly BranchTextHighlight[]
) {
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (!child) {
      continue;
    }

    if (isTextNode(child)) {
      const fragments = splitTextNodeByHighlights(child, state, highlights);
      if (!fragments) {
        continue;
      }

      children.splice(index, 1, ...fragments);
      index += fragments.length - 1;
      continue;
    }

    if (hasChildren(child)) {
      applyHighlightsToChildren(child.children, state, highlights);
    }
  }
}

export function applyBranchTextHighlightsToHastTree(
  tree: HastNode,
  highlights: readonly BranchTextHighlight[]
) {
  if (!hasChildren(tree)) {
    return;
  }

  const normalized = normalizeBranchTextHighlights(highlights);
  if (normalized.length === 0) {
    return;
  }

  applyHighlightsToChildren(tree.children, { offset: 0, nextHighlightIndex: 0 }, normalized);
}

export function createBranchTextHighlightsRehypePlugin(
  highlights: readonly BranchTextHighlight[]
) {
  const normalized = normalizeBranchTextHighlights(highlights);

  return () => (tree: HastNode) => {
    if (normalized.length === 0) {
      return;
    }

    applyBranchTextHighlightsToHastTree(tree, normalized);
  };
}
