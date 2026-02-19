"use client";

import { ArrowUpRightFromSquare } from "lucide-react";
import { useMemo } from "react";
import { useBranchState } from "@/providers/branch-state-provider";
import { Button } from "./ui/button";

export function BranchParentContext() {
  const { activeBranch, branches, compareMode, setCompareMode } =
    useBranchState();

  const parentBranch = useMemo(() => {
    if (!activeBranch?.parentBranchId) {
      return null;
    }

    return branches.find((branch) => branch.id === activeBranch.parentBranchId) ?? null;
  }, [activeBranch?.parentBranchId, branches]);

  if (!compareMode || !activeBranch) {
    return null;
  }

  const excerpt = activeBranch.createdFromExcerpt?.trim() ?? "";
  const hasContext = Boolean(parentBranch || excerpt.length > 0);

  if (!hasContext) {
    return null;
  }

  return (
    <div className="mx-auto w-full px-2 pt-2 md:max-w-3xl md:px-4">
      <div className="rounded-lg border bg-muted/30 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-medium text-sm">
              <ArrowUpRightFromSquare className="h-3.5 w-3.5" />
              Parent Context
            </div>
            <p className="mt-1 text-muted-foreground text-xs">
              {parentBranch
                ? `Comparing "${activeBranch.title}" with parent "${parentBranch.title}".`
                : `Comparing context for "${activeBranch.title}".`}
            </p>
          </div>

          <Button
            className="h-7 px-2 text-xs"
            onClick={() => setCompareMode(false)}
            size="sm"
            variant="ghost"
          >
            Hide
          </Button>
        </div>

        {excerpt.length > 0 ? (
          <blockquote className="mt-2 border-l-2 pl-3 text-muted-foreground text-xs">
            {excerpt}
          </blockquote>
        ) : null}
      </div>
    </div>
  );
}
