"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ChatSystem } from "@/components/chat-system";
import { projectKeys } from "@/lib/query-keys";
import { useChatId } from "@/providers/chat-id-provider";
import { getById as getProjectById } from "@/server/actions/project";

export function ProjectPage({ projectId }: { projectId: string }) {
  const { id } = useChatId();

  const { data: project } = useSuspenseQuery({
    queryKey: projectKeys.byId(projectId),
    queryFn: () => getProjectById({ id: projectId }),
  });

  if (!project) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="text-muted-foreground">Project not found.</div>
      </div>
    );
  }

  return (
    <ChatSystem
      id={id}
      initialMessages={[]}
      isReadonly={false}
      projectId={project.id}
    />
  );
}
