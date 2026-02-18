import { SharedChatPage } from "./shared-chat-page";

export default async function SharedChatPageRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <SharedChatPage id={id} />;
}
