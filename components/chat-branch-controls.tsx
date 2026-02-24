"use client";

import {
  Check,
  ChevronDown,
  Columns2,
  GitBranch,
  PanelLeft,
  PencilLine,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useRenameChatBranch } from "@/hooks/chat-sync-hooks";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useBranchState } from "@/providers/branch-state-provider";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";

export function ChatBranchControls({ isReadonly }: { isReadonly: boolean }) {
  const {
    activeBranch,
    activeBranchId,
    compareMode,
    compareSheetOpen,
    flattenedTree,
    setCompareSheetOpen,
    setActiveBranchId,
    setCompareMode,
  } = useBranchState();
  const { mutateAsync: renameBranch, isPending: isRenaming } =
    useRenameChatBranch();
  const isMobile = useIsMobile();

  const [renameOpen, setRenameOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  useEffect(() => {
    if (renameOpen) {
      setTitleDraft(activeBranch?.title ?? "");
    }
  }, [activeBranch?.title, renameOpen]);

  if (!activeBranchId || flattenedTree.length === 0) {
    return null;
  }

  const canShowCompare =
    compareMode ||
    Boolean(
      activeBranch?.parentBranchId ||
        activeBranch?.createdFromExcerpt ||
        activeBranch?.createdFromMessageId
    );

  return (
    <>
      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="h-8 max-w-56 px-2" size="sm" variant="ghost">
              <GitBranch className="h-4 w-4" />
              <span className="truncate">{activeBranch?.title ?? "Branch"}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>Branches</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {flattenedTree.map((node) => {
              const isActive = node.branch.id === activeBranchId;

              return (
                <DropdownMenuItem
                  className={cn(
                    "group flex items-center gap-2",
                    isActive && "bg-accent"
                  )}
                  key={node.branch.id}
                  onSelect={() => {
                    setActiveBranchId(node.branch.id, { history: "push" });
                  }}
                >
                  <span
                    className="inline-flex min-w-0 flex-1 items-center gap-2"
                    style={{ paddingLeft: `${node.depth * 12}px` }}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full bg-muted-foreground/60",
                        isActive && "bg-foreground"
                      )}
                    />
                    <span className="truncate">{node.branch.title}</span>
                  </span>

                  {isActive ? <Check className="h-3.5 w-3.5" /> : null}
                </DropdownMenuItem>
              );
            })}

            {!isReadonly ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    setRenameOpen(true);
                  }}
                >
                  <PencilLine className="h-4 w-4" />
                  Rename Active Branch
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>

        {canShowCompare ? (
          <Button
            className="h-8 px-2"
            onClick={() => {
              const nextCompareMode = !compareMode;
              setCompareMode(nextCompareMode);
              if (isMobile) {
                setCompareSheetOpen(nextCompareMode);
              }
            }}
            size="sm"
            variant={compareMode ? "secondary" : "ghost"}
          >
            <Columns2 className="h-4 w-4" />
            Compare
          </Button>
        ) : null}

        {isMobile && compareMode ? (
          <Button
            className="h-8 px-2"
            onClick={() => setCompareSheetOpen(!compareSheetOpen)}
            size="sm"
            variant={compareSheetOpen ? "secondary" : "ghost"}
          >
            <PanelLeft className="h-4 w-4" />
            Parent
          </Button>
        ) : null}
      </div>

      <Dialog onOpenChange={setRenameOpen} open={renameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Branch</DialogTitle>
            <DialogDescription>
              Give this branch a clearer title for faster navigation.
            </DialogDescription>
          </DialogHeader>

          <Input
            autoFocus
            maxLength={60}
            onChange={(event) => setTitleDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") {
                return;
              }

              event.preventDefault();
              if (isRenaming || !activeBranchId) {
                return;
              }

              const trimmed = titleDraft.trim();
              if (!trimmed) {
                return;
              }

              renameBranch({ branchId: activeBranchId, title: trimmed })
                .then(() => {
                  toast.success("Branch renamed");
                  setRenameOpen(false);
                })
                .catch(() => {
                  toast.error("Failed to rename branch");
                });
            }}
            placeholder="Branch title"
            value={titleDraft}
          />

          <DialogFooter>
            <Button onClick={() => setRenameOpen(false)} variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={isRenaming || !titleDraft.trim() || !activeBranchId}
              onClick={() => {
                if (!activeBranchId) {
                  return;
                }

                const trimmed = titleDraft.trim();
                if (!trimmed) {
                  return;
                }

                renameBranch({ branchId: activeBranchId, title: trimmed })
                  .then(() => {
                    toast.success("Branch renamed");
                    setRenameOpen(false);
                  })
                  .catch(() => {
                    toast.error("Failed to rename branch");
                  });
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
