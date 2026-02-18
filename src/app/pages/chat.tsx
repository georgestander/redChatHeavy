import { Suspense } from "react";
import { ChatPage } from "@/app/(chat)/chat/[id]/chat-page";

export default function ChatRoutePage() {
  return (
    <>
      <title>Chat</title>
      <Suspense>
        <ChatPage />
      </Suspense>
    </>
  );
}
