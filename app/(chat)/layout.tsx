import { cookies, headers } from "next/headers";
import { getChatModels } from "@/app/actions/get-chat-models";
import { AppSidebar } from "@/components/app-sidebar";
import { DevAutoLogin } from "@/components/dev-auto-login";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { AppModelId } from "@/lib/ai/app-model-id";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/app-models";
import { ANONYMOUS_LIMITS } from "@/lib/types/anonymous";
import { ChatModelsProvider } from "@/providers/chat-models-provider";
import { DefaultModelProvider } from "@/providers/default-model-provider";
import { ReactQueryProvider } from "@/providers/react-query-provider";
import { SessionProvider } from "@/providers/session-provider";
import { getServerSession } from "../../lib/auth";
import { ChatProviders } from "./chat-providers";

function supportsDevAutoLogin(databaseUrl: string | undefined): boolean {
  return process.env.NODE_ENV === "development" && Boolean(databaseUrl);
}

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const session = await getServerSession(await headers());
  const isCollapsed = cookieStore.get("sidebar:state")?.value !== "true";
  const shouldAutoDevLogin = supportsDevAutoLogin(process.env.DATABASE_URL);

  const cookieModel = cookieStore.get("chat-model")?.value as AppModelId;
  const isAnonymous = !session?.user;

  // Always fetch chat models - needed for ChatModelsProvider and cookie validation
  const chatModels = await getChatModels();
  const fallbackModel = (chatModels[0]?.id ?? DEFAULT_CHAT_MODEL) as AppModelId;

  // Check if the model from cookie exists in available models
  let defaultModel = cookieModel ?? fallbackModel;

  if (cookieModel) {
    const modelExists = chatModels.some((m) => m.id === cookieModel);
    if (!modelExists) {
      // Model doesn't exist in available models, fall back to default
      defaultModel = fallbackModel;
    } else if (isAnonymous) {
      // For anonymous users, also check if the model is in their allowed list
      const isModelAvailable = ANONYMOUS_LIMITS.AVAILABLE_MODELS.includes(
        cookieModel as (typeof ANONYMOUS_LIMITS.AVAILABLE_MODELS)[number]
      );
      if (!isModelAvailable) {
        defaultModel = fallbackModel;
      }
    }
  }

  return (
    <ReactQueryProvider>
      <SessionProvider initialSession={session}>
        <DevAutoLogin enabled={shouldAutoDevLogin} />
        <ChatProviders>
          <SidebarProvider defaultOpen={!isCollapsed}>
            <AppSidebar />
            <SidebarInset
              style={
                {
                  "--header-height": "calc(var(--spacing) * 13)",
                } as React.CSSProperties
              }
            >
              <ChatModelsProvider models={chatModels}>
                <DefaultModelProvider defaultModel={defaultModel}>
                  <KeyboardShortcuts />

                  {children}
                </DefaultModelProvider>
              </ChatModelsProvider>
            </SidebarInset>
          </SidebarProvider>
        </ChatProviders>
      </SessionProvider>
    </ReactQueryProvider>
  );
}
