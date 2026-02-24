"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { updateSearchParams, useSearchParams } from "@/hooks/use-navigation";
import {
  buildChatBranchTree,
  type ChatBranchTreeNode,
  flattenChatBranchTree,
  resolveActiveBranchId,
} from "@/lib/branching/client-tree";
import type { ChatBranch } from "@/lib/db/schema";

type BranchHistoryMode = "push" | "replace";

type BranchStateContextType = {
  branches: ChatBranch[];
  tree: ChatBranchTreeNode[];
  flattenedTree: ChatBranchTreeNode[];
  activeBranchId: string | null;
  activeBranch: ChatBranch | null;
  compareMode: boolean;
  compareSheetOpen: boolean;
  setActiveBranchId: (
    branchId: string,
    options?: { history?: BranchHistoryMode }
  ) => void;
  setCompareMode: (
    enabled: boolean,
    options?: { history?: BranchHistoryMode }
  ) => void;
  setCompareSheetOpen: (open: boolean) => void;
};

const BranchStateContext = createContext<BranchStateContextType | undefined>(
  undefined
);

export function BranchStateProvider({
  children,
  branches,
  activeBranchId,
}: {
  children: ReactNode;
  branches: ChatBranch[];
  activeBranchId?: string | null;
}) {
  const searchParams = useSearchParams();
  const [compareSheetOpen, setCompareSheetOpen] = useState(false);

  const resolvedActiveBranchId = useMemo(
    () => resolveActiveBranchId(branches, activeBranchId ?? null),
    [activeBranchId, branches]
  );

  const activeBranch = useMemo(
    () =>
      branches.find((branch) => branch.id === resolvedActiveBranchId) ?? null,
    [branches, resolvedActiveBranchId]
  );

  const compareMode = searchParams.get("compare") === "1";

  useEffect(() => {
    if (!compareMode) {
      setCompareSheetOpen(false);
    }
  }, [compareMode]);

  const setActiveBranchId = useCallback(
    (branchId: string, options?: { history?: BranchHistoryMode }) => {
      const nextParams = new URLSearchParams(
        typeof window === "undefined"
          ? searchParams.toString()
          : window.location.search
      );
      nextParams.set("branch", branchId);
      updateSearchParams(nextParams, { history: options?.history ?? "replace" });
    },
    [searchParams]
  );

  const setCompareMode = useCallback(
    (enabled: boolean, options?: { history?: BranchHistoryMode }) => {
      const nextParams = new URLSearchParams(
        typeof window === "undefined"
          ? searchParams.toString()
          : window.location.search
      );

      if (enabled) {
        nextParams.set("compare", "1");
      } else {
        nextParams.delete("compare");
      }

      updateSearchParams(nextParams, { history: options?.history ?? "replace" });
    },
    [searchParams]
  );

  const tree = useMemo(() => buildChatBranchTree(branches), [branches]);
  const flattenedTree = useMemo(() => flattenChatBranchTree(tree), [tree]);

  const value = useMemo<BranchStateContextType>(
    () => ({
      branches,
      tree,
      flattenedTree,
      activeBranchId: resolvedActiveBranchId,
      activeBranch,
      compareMode,
      compareSheetOpen,
      setActiveBranchId,
      setCompareMode,
      setCompareSheetOpen,
    }),
    [
      branches,
      tree,
      flattenedTree,
      resolvedActiveBranchId,
      activeBranch,
      compareMode,
      compareSheetOpen,
      setActiveBranchId,
      setCompareMode,
    ]
  );

  return (
    <BranchStateContext.Provider value={value}>
      {children}
    </BranchStateContext.Provider>
  );
}

export function useBranchState() {
  const context = useContext(BranchStateContext);
  if (!context) {
    throw new Error("useBranchState must be used within BranchStateProvider");
  }

  return context;
}
