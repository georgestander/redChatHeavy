"use client";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, GitBranch, MoreHorizontal } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChatMenuItems } from "@/components/chat-menu-items";
import Link from "@/components/link";
import { ShareDialog } from "@/components/share-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useRouter } from "@/hooks/use-navigation";
import {
  buildChatBranchTree,
  flattenChatBranchTree,
  resolveActiveBranchId,
} from "@/lib/branching/client-tree";
import { cn } from "@/lib/utils";
import { chatKeys } from "@/lib/query-keys";
import type { ChatBranch } from "@/lib/db/schema";
import { getChatBranches } from "@/server/actions/chat";
import type { UIChat } from "@/lib/types/ui-chat";

const PureSidebarChatItem = ({
  chat,
  isActive,
  activeBranchId,
  compareMode,
  onDelete,
  onRename,
  onPin,
  setOpenMobile,
  prefetch = false,
}: {
  chat: UIChat;
  isActive: boolean;
  activeBranchId: string | null;
  compareMode: boolean;
  onDelete: (chatId: string) => void;
  onRename: (chatId: string, title: string) => void;
  onPin: (chatId: string, isPinned: boolean) => void;
  setOpenMobile: (open: boolean) => void;
  prefetch?: boolean;
}) => {
  const [isBranchTreeOpen, setIsBranchTreeOpen] = useState(false);
  const chatHref: `/project/${string}/chat/${string}` | `/chat/${string}` =
    chat.projectId
      ? `/project/${chat.projectId}/chat/${chat.id}`
      : `/chat/${chat.id}`;
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(chat.title);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  type SerializedChatBranch = Omit<ChatBranch, "createdAt" | "archivedAt"> & {
    createdAt: string | Date;
    archivedAt: string | Date | null;
  };

  const branchQuery = useQuery({
    queryKey: chatKeys.branches(chat.id),
    queryFn: async () => {
      const branches = await getChatBranches({ chatId: chat.id });
      return (branches as SerializedChatBranch[]).map((branch) => ({
        ...branch,
        createdAt:
          branch.createdAt instanceof Date
            ? branch.createdAt
            : new Date(branch.createdAt),
        archivedAt:
          branch.archivedAt instanceof Date
            ? branch.archivedAt
            : branch.archivedAt
              ? new Date(branch.archivedAt)
              : null,
      }));
    },
    enabled: isActive,
    staleTime: 30_000,
  });

  const branchTree = useMemo(
    () => buildChatBranchTree(branchQuery.data ?? []),
    [branchQuery.data]
  );
  const flattenedTree = useMemo(
    () => flattenChatBranchTree(branchTree),
    [branchTree]
  );
  const hasChildBranches = flattenedTree.some((node) => node.depth > 0);
  const resolvedActiveBranchId = useMemo(
    () => resolveActiveBranchId(branchQuery.data ?? [], activeBranchId),
    [activeBranchId, branchQuery.data]
  );

  useEffect(() => {
    if (!isActive) {
      setIsBranchTreeOpen(false);
    }
  }, [isActive]);

  const navigateToBranch = (branchId: string) => {
    const nextParams = new URLSearchParams();
    nextParams.set("branch", branchId);

    if (compareMode) {
      nextParams.set("compare", "1");
    }

    router.push(`${chatHref}?${nextParams.toString()}`);
    setOpenMobile(false);
  };

  const handleRename = async () => {
    if (editTitle.trim() === "" || editTitle === chat.title) {
      setIsEditing(false);
      setEditTitle(chat.title);
      return;
    }

    try {
      await onRename(chat.id, editTitle.trim());
      setIsEditing(false);
      toast.success("Chat renamed successfully");
    } catch (_error) {
      setEditTitle(chat.title);
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRename();
    } else if (e.key === "Escape") {
      setIsEditing(false);
      setEditTitle(chat.title);
    }
  };

  return (
    <SidebarMenuItem>
      {isEditing ? (
        <div className="flex w-full items-center gap-2 overflow-hidden rounded-md bg-background p-2 text-left text-sm">
          <Input
            autoFocus
            className="h-auto border-0 bg-transparent p-0 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
            maxLength={255}
            onBlur={handleRename}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            value={editTitle}
          />
        </div>
      ) : (
        <SidebarMenuButton asChild isActive={isActive}>
          <Link
            href={chatHref}
            onClick={(e) => {
              // Allow middle-click and ctrl+click to open in new tab
              if (e.button === 1 || e.ctrlKey || e.metaKey) {
                return;
              }
              e.preventDefault();
              router.push(chatHref);
              setOpenMobile(false);
            }}
            prefetch={prefetch}
          >
            <span>{chat.title}</span>
          </Link>
        </SidebarMenuButton>
      )}

      <DropdownMenu modal={true}>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction
            className="mr-0.5 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            showOnHover={!isActive}
          >
            <MoreHorizontal size={16} />
            <span className="sr-only">More</span>
          </SidebarMenuAction>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" side="bottom">
          <ChatMenuItems
            isPinned={chat.isPinned}
            onDelete={() => onDelete(chat.id)}
            onRename={() => {
              setIsEditing(true);
              setEditTitle(chat.title);
            }}
            onShare={() => setShareDialogOpen(true)}
            onTogglePin={() => onPin(chat.id, !chat.isPinned)}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      {shareDialogOpen && (
        <ShareDialog
          chatId={chat.id}
          onOpenChange={setShareDialogOpen}
          open={shareDialogOpen}
        />
      )}

      {isActive && hasChildBranches ? (
        <div className="mt-1 w-full px-2">
          <button
            className="flex w-full items-center gap-1 rounded px-1 py-1 text-left text-sidebar-foreground/70 text-xs transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={() => setIsBranchTreeOpen((open) => !open)}
            type="button"
          >
            {isBranchTreeOpen ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            )}
            <GitBranch className="h-3.5 w-3.5 shrink-0" />
            Branches
          </button>

          {isBranchTreeOpen ? (
            <div className="mt-1 border-sidebar-border/60 border-l pl-2">
              {flattenedTree.map((node) => {
                const isActiveBranch = node.branch.id === resolvedActiveBranchId;

                return (
                  <button
                    className={cn(
                      "flex w-full items-center rounded px-1.5 py-1 text-left text-xs transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      isActiveBranch &&
                        "bg-sidebar-accent text-sidebar-accent-foreground"
                    )}
                    key={node.branch.id}
                    onClick={() => navigateToBranch(node.branch.id)}
                    style={{ paddingLeft: `${node.depth * 10 + 6}px` }}
                    type="button"
                  >
                    <span className="truncate">{node.branch.title}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </SidebarMenuItem>
  );
};

export const SidebarChatItem = memo(
  PureSidebarChatItem,
  (prevProps, nextProps) => {
    if (prevProps.isActive !== nextProps.isActive) {
      return false;
    }
    if (prevProps.activeBranchId !== nextProps.activeBranchId) {
      return false;
    }
    if (prevProps.compareMode !== nextProps.compareMode) {
      return false;
    }
    if (prevProps.prefetch !== nextProps.prefetch) {
      return false;
    }
    if (prevProps.chat.id !== nextProps.chat.id) {
      return false;
    }
    if (prevProps.chat.title !== nextProps.chat.title) {
      return false;
    }
    if (prevProps.chat.isPinned !== nextProps.chat.isPinned) {
      return false;
    }
    return true;
  }
);
