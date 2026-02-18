import { SharedChatPage } from "@/app/(chat)/share/[id]/shared-chat-page";

export function SharePage({ id }: { id: string }) {
  return (
    <>
      <title>Shared Chat</title>
      <SharedChatPage id={id} />
    </>
  );
}
