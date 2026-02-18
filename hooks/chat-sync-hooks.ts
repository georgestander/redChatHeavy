"use client";

// Hooks for chat data fetching and mutations
// For authenticated users only - anonymous users don't persist data

import {
  type QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import type { ChatMessage } from "@/lib/ai/types";
import { getAnonymousSession } from "@/lib/anonymous-session-client";
import type { Document, Project } from "@/lib/db/schema";
import {
  chatKeys,
  creditsKeys,
  documentKeys,
  projectKeys,
} from "@/lib/query-keys";
import { ANONYMOUS_LIMITS } from "@/lib/types/anonymous";
import type { UIChat } from "@/lib/types/ui-chat";
import { useChatId } from "@/providers/chat-id-provider";
import { useSession } from "@/providers/session-provider";
import {
  cloneSharedChat,
  deleteChat as deleteChatAction,
  deleteTrailingMessages,
  getAllChats,
  getChatById as getChatByIdAction,
  getChatMessages,
  getPublicChatMessages,
  renameChat,
  setIsPinned,
  setVisibility,
} from "@/server/actions/chat";
import { getAvailableCredits } from "@/server/actions/credits";
import {
  getDocuments,
  getPublicDocuments,
  saveDocument as saveDocumentAction,
} from "@/server/actions/document";
import {
  getById as getProjectById,
  update as updateProject,
} from "@/server/actions/project";

// Query key for anonymous credits - allows invalidation after messages
const ANONYMOUS_CREDITS_KEY = ["anonymousCredits"] as const;

type SerializedChat = Omit<UIChat, "createdAt" | "updatedAt"> & {
  createdAt: string | Date;
  updatedAt: string | Date;
};

type SerializedProject = Omit<Project, "createdAt" | "updatedAt"> & {
  createdAt: string | Date;
  updatedAt: string | Date;
};

type SerializedChatMessage = Omit<ChatMessage, "metadata"> & {
  metadata: Omit<ChatMessage["metadata"], "createdAt"> & {
    createdAt: string | Date;
  };
};

function hydrateChatDates(chat: SerializedChat): UIChat {
  return {
    ...chat,
    createdAt:
      chat.createdAt instanceof Date
        ? chat.createdAt
        : new Date(chat.createdAt),
    updatedAt:
      chat.updatedAt instanceof Date
        ? chat.updatedAt
        : new Date(chat.updatedAt),
  };
}

function hydrateProjectDates(project: SerializedProject): Project {
  return {
    ...project,
    createdAt:
      project.createdAt instanceof Date
        ? project.createdAt
        : new Date(project.createdAt),
    updatedAt:
      project.updatedAt instanceof Date
        ? project.updatedAt
        : new Date(project.updatedAt),
  };
}

function hydrateMessageDates(message: SerializedChatMessage): ChatMessage {
  return {
    ...message,
    metadata: {
      ...message.metadata,
      createdAt:
        message.metadata.createdAt instanceof Date
          ? message.metadata.createdAt
          : new Date(message.metadata.createdAt),
    },
  };
}

function snapshotAllChatsQueries(
  qc: ReturnType<typeof useQueryClient>,
  key: QueryKey
) {
  return qc.getQueriesData<UIChat[]>({ queryKey: key });
}

function restoreAllChatsQueries(
  qc: ReturnType<typeof useQueryClient>,
  snapshot: [QueryKey, UIChat[] | undefined][]
) {
  for (const [k, data] of snapshot) {
    qc.setQueryData(k, data);
  }
}

function updateAllChatsQueries(
  qc: ReturnType<typeof useQueryClient>,
  key: QueryKey,
  updater: (old: UIChat[] | undefined) => UIChat[] | undefined
) {
  const entries = qc.getQueriesData<UIChat[]>({ queryKey: key });
  for (const [k] of entries) {
    qc.setQueryData<UIChat[] | undefined>(k, updater);
  }
}

export function useProject(
  projectId: string | null,
  { enabled }: { enabled?: boolean } = {}
) {
  const { data: session } = useSession();

  return useQuery({
    queryKey: projectKeys.byId(projectId ?? ""),
    queryFn: async () => {
      const project = await getProjectById({ id: projectId ?? "" });
      return hydrateProjectDates(project as SerializedProject);
    },
    enabled: (enabled ?? true) && !!session?.user && !!projectId,
  });
}

export function useGetChatMessagesQueryOptions() {
  const { data: session } = useSession();
  const { id: chatId, isPersisted, source } = useChatId();
  const isShared = source === "share";

  const queryKey = isShared
    ? chatKeys.publicMessages(chatId || "")
    : chatKeys.messages(chatId || "");

  return {
    queryKey,
    queryFn: async () => {
      const messages = isShared
        ? await getPublicChatMessages({ chatId: chatId || "" })
        : await getChatMessages({ chatId: chatId || "" });
      return (messages as SerializedChatMessage[]).map(hydrateMessageDates);
    },
    enabled: !!chatId && isPersisted && (isShared || !!session?.user),
  };
}

export function useDeleteChat() {
  const { data: session } = useSession();
  const isAuthenticated = !!session?.user;
  const qc = useQueryClient();
  const allChatsKey = chatKeys.allChats(null).slice(0, 2) as QueryKey;

  const deleteMutation = useMutation({
    mutationFn: ({ chatId }: { chatId: string }) =>
      deleteChatAction({ chatId }),
    onMutate: async ({
      chatId,
    }): Promise<{
      previousAllChats?: [QueryKey, UIChat[] | undefined][];
    }> => {
      if (!isAuthenticated) {
        return { previousAllChats: undefined };
      }
      const snapshot = snapshotAllChatsQueries(qc, allChatsKey);
      await qc.cancelQueries({ queryKey: allChatsKey, exact: false });
      updateAllChatsQueries(
        qc,
        allChatsKey,
        (old) => old?.filter((c) => c.id !== chatId) ?? old
      );
      return { previousAllChats: snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previousAllChats) {
        restoreAllChatsQueries(qc, ctx.previousAllChats);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: allChatsKey, exact: false });
    },
  });

  const deleteChatHandler = useCallback(
    async (
      chatId: string,
      options?: { onSuccess?: () => void; onError?: (error: Error) => void }
    ) => {
      if (!isAuthenticated) {
        return;
      }
      try {
        await deleteMutation.mutateAsync({ chatId });
        options?.onSuccess?.();
      } catch (error) {
        const err = error instanceof Error ? error : new Error("Unknown error");
        options?.onError?.(err);
        throw err;
      }
    },
    [deleteMutation, isAuthenticated]
  );

  return { deleteChat: deleteChatHandler };
}

export function useRenameChat() {
  const { data: session } = useSession();
  const isAuthenticated = !!session?.user;
  const qc = useQueryClient();
  const allChatsKey = chatKeys.allChats(null).slice(0, 2) as QueryKey;

  return useMutation({
    mutationFn: ({ chatId, title }: { chatId: string; title: string }) =>
      renameChat({ chatId, title }),
    onMutate: async ({
      chatId,
      title,
    }): Promise<{
      previousAllChats?: [QueryKey, UIChat[] | undefined][];
      previousChatById?: UIChat | null;
    }> => {
      if (!isAuthenticated) {
        return { previousAllChats: undefined, previousChatById: undefined };
      }
      const byIdKey = chatKeys.byId(chatId);

      await Promise.all([
        qc.cancelQueries({ queryKey: allChatsKey, exact: false }),
        qc.cancelQueries({ queryKey: byIdKey }),
      ]);

      const previousAllChats = snapshotAllChatsQueries(qc, allChatsKey);
      const previousChatById = qc.getQueryData<UIChat | null>(byIdKey);

      updateAllChatsQueries(
        qc,
        allChatsKey,
        (old) => old?.map((c) => (c.id === chatId ? { ...c, title } : c)) ?? old
      );
      if (previousChatById) {
        qc.setQueryData<UIChat | null>(byIdKey, { ...previousChatById, title });
      }

      return { previousAllChats, previousChatById };
    },
    onError: (_err, { chatId }, ctx) => {
      if (ctx?.previousAllChats) {
        restoreAllChatsQueries(qc, ctx.previousAllChats);
      }
      if (ctx?.previousChatById !== undefined) {
        qc.setQueryData(
          chatKeys.byId(chatId),
          ctx.previousChatById ?? undefined
        );
      }
      toast.error("Failed to rename chat");
    },
    onSettled: async (_data, _error, { chatId }) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: allChatsKey, exact: false }),
        qc.invalidateQueries({
          queryKey: chatKeys.byId(chatId),
        }),
      ]);
    },
  });
}

export function useRenameProject() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (variables: { id: string; updates: Partial<Project> }) =>
      updateProject({ id: variables.id, updates: variables.updates }),
    onMutate: async (variables) => {
      const listKey = projectKeys.list;
      await qc.cancelQueries({ queryKey: listKey });
      const previous = qc.getQueryData<Project[]>(listKey);
      const nextName =
        typeof variables.updates.name === "string"
          ? variables.updates.name
          : undefined;
      if (nextName) {
        qc.setQueryData<Project[] | undefined>(listKey, (old) =>
          old?.map((p) =>
            p.id === variables.id ? { ...p, name: nextName } : p
          )
        );
      }
      return { previous };
    },
    onError: (_error, _variables, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(projectKeys.list, ctx.previous);
      }
      toast.error("Failed to rename project");
    },
    onSuccess: () => toast.success("Project renamed"),
    onSettled: () => qc.invalidateQueries({ queryKey: projectKeys.list }),
  });
}

export function usePinChat() {
  const { data: session } = useSession();
  const isAuthenticated = !!session?.user;
  const qc = useQueryClient();
  const allChatsKey = chatKeys.allChats(null).slice(0, 2) as QueryKey;

  return useMutation({
    mutationFn: ({ chatId, isPinned }: { chatId: string; isPinned: boolean }) =>
      setIsPinned({ chatId, isPinned }),
    onMutate: async ({
      chatId,
      isPinned,
    }): Promise<{
      previousAllChats?: [QueryKey, UIChat[] | undefined][];
    }> => {
      if (!isAuthenticated) {
        return { previousAllChats: undefined };
      }
      const snapshot = snapshotAllChatsQueries(qc, allChatsKey);
      await qc.cancelQueries({ queryKey: allChatsKey, exact: false });
      updateAllChatsQueries(
        qc,
        allChatsKey,
        (old) =>
          old?.map((c) => (c.id === chatId ? { ...c, isPinned } : c)) ?? old
      );
      return { previousAllChats: snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previousAllChats) {
        restoreAllChatsQueries(qc, ctx.previousAllChats);
      }
      toast.error("Failed to pin chat");
    },
    onSettled: async (_data, _error, { chatId }) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: allChatsKey, exact: false }),
        qc.invalidateQueries({
          queryKey: chatKeys.byId(chatId),
        }),
      ]);
    },
  });
}

function _useDeleteTrailingMessages() {
  const { data: session } = useSession();
  const isAuthenticated = !!session?.user;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ messageId }: { messageId: string; chatId: string }) =>
      deleteTrailingMessages({ messageId }),
    onMutate: async ({
      messageId,
      chatId,
    }): Promise<{ previousMessages?: ChatMessage[]; chatId: string }> => {
      if (!isAuthenticated) {
        return { previousMessages: undefined, chatId };
      }
      const key = chatKeys.messages(chatId);
      await qc.cancelQueries({ queryKey: key });
      const previousMessages = qc.getQueryData<ChatMessage[]>(key);
      qc.setQueryData<ChatMessage[] | undefined>(key, (old) => {
        if (!old) {
          return old;
        }
        const idx = old.findIndex((msg) => msg.id === messageId);
        return idx === -1 ? old : old.slice(0, idx);
      });
      return { previousMessages, chatId };
    },
    onError: (_err, { chatId }, ctx) => {
      if (ctx?.previousMessages) {
        qc.setQueryData(chatKeys.messages(chatId), ctx.previousMessages);
      }
      toast.error("Failed to delete messages");
    },
    onSuccess: (_data, { chatId }) => {
      qc.invalidateQueries({
        queryKey: chatKeys.messages(chatId),
      });
      toast.success("Messages deleted");
    },
  });
}

export function useCloneChat() {
  const qc = useQueryClient();
  const allChatsKey = chatKeys.allChats(null).slice(0, 2) as QueryKey;

  return useMutation({
    mutationFn: ({ chatId }: { chatId: string }) => cloneSharedChat({ chatId }),
    onSettled: () => qc.refetchQueries({ queryKey: allChatsKey, exact: false }),
    onError: (error) => console.error("Failed to copy chat:", error),
  });
}

export function useSaveMessageMutation() {
  const { data: session } = useSession();
  const isAuthenticated = !!session?.user;
  const qc = useQueryClient();
  const allChatsKey = chatKeys.allChats(null).slice(0, 2) as QueryKey;

  return useMutation({
    // Message is saved in the backend by another route. This doesn't need to actually mutate
    mutationFn: (_: { message: ChatMessage; chatId: string }) =>
      Promise.resolve({ success: true } as const),
    onMutate: async ({ message, chatId }) => {
      const key = chatKeys.messages(chatId);
      await qc.cancelQueries({ queryKey: key });
      const previousMessages = qc.getQueryData<ChatMessage[]>(key);
      qc.setQueryData<ChatMessage[]>(key, (old) =>
        old ? [...old, message] : [message]
      );
      return { previousMessages, chatId };
    },
    onSuccess: async (_data, { message, chatId }) => {
      if (message.role === "assistant") {
        if (isAuthenticated) {
          qc.invalidateQueries({
            queryKey: creditsKeys.available,
          });
          await Promise.all([
            qc.invalidateQueries({
              queryKey: allChatsKey,
              exact: false,
            }),
            qc.invalidateQueries({
              queryKey: chatKeys.byId(chatId),
            }),
          ]);
        } else {
          // Refresh anonymous credits from cookie
          qc.invalidateQueries({ queryKey: ANONYMOUS_CREDITS_KEY });
        }
      }
    },
  });
}

export function useSetVisibility() {
  const qc = useQueryClient();
  const allChatsKey = chatKeys.allChats(null).slice(0, 2) as QueryKey;

  return useMutation({
    mutationFn: ({
      chatId,
      visibility,
    }: {
      chatId: string;
      visibility: "private" | "public";
    }) => setVisibility({ chatId, visibility }),
    onError: () => toast.error("Failed to update chat visibility"),
    onSettled: () =>
      qc.invalidateQueries({
        queryKey: allChatsKey,
        exact: false,
      }),
    onSuccess: (_data, { visibility }) => {
      toast.success(
        visibility === "public"
          ? "Chat is now public - anyone with the link can access it"
          : "Chat is now private - only you can access it"
      );
    },
  });
}

export function useSaveDocument(
  _documentId: string,
  messageId: string,
  options?: {
    onSettled?: (result: unknown, error: unknown, params: unknown) => void;
  }
) {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const userId = session?.user?.id;

  return useMutation({
    mutationFn: saveDocumentAction,
    onMutate: async (newDoc): Promise<{ previousDocuments: Document[] }> => {
      const key = documentKeys.byMessageId(newDoc.id);
      await qc.cancelQueries({ queryKey: key });
      const previousDocuments = qc.getQueryData<Document[]>(key) ?? [];
      qc.setQueryData(key, [
        ...previousDocuments,
        {
          id: newDoc.id,
          createdAt: new Date(),
          title: newDoc.title,
          content: newDoc.content,
          kind: newDoc.kind,
          userId: userId || "",
          messageId,
        } as Document,
      ]);
      return { previousDocuments };
    },
    onError: (_err, newDoc, ctx) => {
      if (ctx?.previousDocuments) {
        qc.setQueryData(
          documentKeys.byMessageId(newDoc.id),
          ctx.previousDocuments
        );
      }
    },
    onSettled: (result, error, params) => {
      qc.invalidateQueries({
        queryKey: documentKeys.byMessageId(params.id as string),
      });
      options?.onSettled?.(result, error, params);
    },
  });
}

export function useDocuments(id: string, disable: boolean) {
  const { source } = useChatId();
  const isShared = source === "share";
  const { data: session } = useSession();

  return useQuery({
    queryKey: isShared
      ? documentKeys.publicByMessageId(id)
      : documentKeys.byMessageId(id),
    queryFn: () =>
      isShared ? getPublicDocuments({ id }) : getDocuments({ id }),
    enabled: !disable && !!id && (isShared || !!session?.user),
  });
}

export function useGetAllChats(opts?: {
  projectId?: string | null;
  limit?: number;
}) {
  const { data: session } = useSession();
  const { projectId, limit } = opts ?? {};

  return useQuery({
    queryKey: chatKeys.allChats(projectId ?? null),
    queryFn: async () => {
      const chats = await getAllChats({ projectId: projectId ?? null });
      return (chats as SerializedChat[]).map(hydrateChatDates);
    },
    enabled: !!session?.user,
    select: limit ? (data: UIChat[]) => data.slice(0, limit) : undefined,
  });
}

export function useGetChatByIdQueryOptions(chatId: string) {
  const { data: session } = useSession();

  return {
    queryKey: chatKeys.byId(chatId),
    queryFn: async () => {
      const chat = await getChatByIdAction({ chatId });
      return hydrateChatDates(chat as SerializedChat);
    },
    enabled: !!chatId && !!session?.user,
  };
}

export function useGetChatById(
  chatId: string,
  { enabled }: { enabled?: boolean } = {}
) {
  const options = useGetChatByIdQueryOptions(chatId);
  return useQuery({
    ...options,
    enabled: (enabled ?? true) && (options.enabled ?? true),
  });
}

export function useGetCredits() {
  const { data: session } = useSession();
  const isAuthenticated = !!session?.user;

  const { data: creditsData, isLoading: isLoadingCredits } = useQuery({
    queryKey: creditsKeys.available,
    queryFn: getAvailableCredits,
    enabled: isAuthenticated,
  });

  // Use a query for anonymous credits so we can invalidate it
  const { data: anonymousCredits } = useQuery({
    queryKey: ANONYMOUS_CREDITS_KEY,
    queryFn: () => {
      const anonymousSession = getAnonymousSession();
      return anonymousSession?.remainingCredits ?? ANONYMOUS_LIMITS.CREDITS;
    },
    enabled: !isAuthenticated,
    staleTime: 0,
  });

  if (!isAuthenticated) {
    return {
      credits: anonymousCredits ?? ANONYMOUS_LIMITS.CREDITS,
      isLoadingCredits: false,
    };
  }

  return {
    credits: creditsData?.credits,
    isLoadingCredits,
  };
}
