import { Suspense } from "react";
import { ProjectChatPage } from "@/app/(chat)/project/[projectId]/chat/[chatId]/project-chat-page";

export default function ProjectChatRoutePage({
  projectId,
}: {
  projectId: string;
}) {
  return (
    <>
      <title>Project Chat</title>
      <Suspense>
        <ProjectChatPage projectId={projectId} />
      </Suspense>
    </>
  );
}
