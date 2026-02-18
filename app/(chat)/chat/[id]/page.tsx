import { Suspense } from "react";
import { ChatPage } from "./chat-page";

export default async function ChatPageRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await params;

  return (
    <Suspense>
      <ChatPage />
    </Suspense>
  );
}
