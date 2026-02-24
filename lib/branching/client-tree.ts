import type { ChatBranch } from "@/lib/db/schema";

export type ChatBranchTreeNode = {
  branch: ChatBranch;
  depth: number;
  children: ChatBranchTreeNode[];
};

function sortBranches(left: ChatBranch, right: ChatBranch): number {
  const leftTime = left.createdAt instanceof Date ? left.createdAt.getTime() : 0;
  const rightTime =
    right.createdAt instanceof Date ? right.createdAt.getTime() : 0;

  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return left.id.localeCompare(right.id);
}

export function resolveActiveBranchId(
  branches: ChatBranch[],
  requestedBranchId: string | null
): string | null {
  if (requestedBranchId && branches.some((branch) => branch.id === requestedBranchId)) {
    return requestedBranchId;
  }

  const root = branches.find((branch) => branch.parentBranchId === null);
  return root?.id ?? branches[0]?.id ?? null;
}

export function buildChatBranchTree(branches: ChatBranch[]): ChatBranchTreeNode[] {
  if (branches.length === 0) {
    return [];
  }

  const branchById = new Map(branches.map((branch) => [branch.id, branch] as const));
  const childrenByParentId = new Map<string, ChatBranch[]>();
  const roots: ChatBranch[] = [];

  for (const branch of branches) {
    if (!branch.parentBranchId || !branchById.has(branch.parentBranchId)) {
      roots.push(branch);
      continue;
    }

    const siblings = childrenByParentId.get(branch.parentBranchId) ?? [];
    siblings.push(branch);
    childrenByParentId.set(branch.parentBranchId, siblings);
  }

  const buildNode = (branch: ChatBranch, depth: number): ChatBranchTreeNode => ({
    branch,
    depth,
    children: (childrenByParentId.get(branch.id) ?? [])
      .slice()
      .sort(sortBranches)
      .map((child) => buildNode(child, depth + 1)),
  });

  return roots.slice().sort(sortBranches).map((root) => buildNode(root, 0));
}

export function flattenChatBranchTree(nodes: ChatBranchTreeNode[]): ChatBranchTreeNode[] {
  const flattened: ChatBranchTreeNode[] = [];

  const visit = (node: ChatBranchTreeNode) => {
    flattened.push(node);
    for (const child of node.children) {
      visit(child);
    }
  };

  for (const node of nodes) {
    visit(node);
  }

  return flattened;
}
