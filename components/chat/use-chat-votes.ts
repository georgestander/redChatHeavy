"use client";

import { useChatId } from "@ai-sdk-tools/store";
import { useQuery } from "@tanstack/react-query";
import { voteKeys } from "@/lib/query-keys";
import { useMessageIds } from "@/lib/stores/hooks-base";
import { useSession } from "@/providers/session-provider";
import { getVotes } from "@/server/actions/vote";

export function useChatVotes(
  chatId: string,
  { isReadonly }: { isReadonly: boolean }
) {
  const { data: session } = useSession();
  const isLoading = chatId !== useChatId();
  const messageIds = useMessageIds() as string[];

  return useQuery({
    queryKey: voteKeys.byChatId(chatId),
    queryFn: () => getVotes({ chatId }),
    enabled:
      messageIds.length >= 2 && !isReadonly && !!session?.user && !isLoading,
  });
}
