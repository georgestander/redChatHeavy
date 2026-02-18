import { ProjectChatPage } from "./project-chat-page";

export default async function ProjectChatPageRoute({
  params,
}: {
  params: Promise<{ projectId: string; chatId: string }>;
}) {
  const { projectId } = await params;

  return <ProjectChatPage projectId={projectId} />;
}
