import type { CSSProperties } from "react";
import type { LayoutProps } from "rwsdk/router";
import { ChatProviders } from "@/app/(chat)/chat-providers";
import { getChatModels } from "@/app/actions/get-chat-models";
import { AppSidebar } from "@/components/app-sidebar";
import { DevAutoLogin } from "@/components/dev-auto-login";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { AppModelId } from "@/lib/ai/app-model-id";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/app-models";
import type { AppRequestInfo } from "@/lib/request-info";
import { ANONYMOUS_LIMITS } from "@/lib/types/anonymous";
import { ChatModelsProvider } from "@/providers/chat-models-provider";
import { DefaultModelProvider } from "@/providers/default-model-provider";
import { ReactQueryProvider } from "@/providers/react-query-provider";
import { SessionProvider } from "@/providers/session-provider";

function supportsDevAutoLogin(databaseUrl: string | undefined): boolean {
  return process.env.NODE_ENV === "development" && Boolean(databaseUrl);
}

function getCookieValue(
  cookieHeader: string | null,
  name: string
): string | undefined {
  if (!cookieHeader) {
    return;
  }

  const cookie = cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`));

  if (!cookie) {
    return;
  }

  const rawValue = cookie.slice(name.length + 1);
  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
}

export async function ChatLayout({
  children,
  requestInfo,
}: LayoutProps<AppRequestInfo>) {
  const session = requestInfo?.ctx?.session ?? null;
  const cookieHeader = requestInfo?.request?.headers.get("cookie") ?? null;
  const shouldAutoDevLogin = supportsDevAutoLogin(process.env.DATABASE_URL);

  const isCollapsed = getCookieValue(cookieHeader, "sidebar:state") !== "true";
  const cookieModel = getCookieValue(cookieHeader, "chat-model") as
    | AppModelId
    | undefined;
  const isAnonymous = !session?.user;

  const chatModels = await getChatModels();
  const fallbackModel = (chatModels[0]?.id ?? DEFAULT_CHAT_MODEL) as AppModelId;

  let defaultModel = cookieModel ?? fallbackModel;
  if (cookieModel) {
    const modelExists = chatModels.some((model) => model.id === cookieModel);
    if (!modelExists) {
      defaultModel = fallbackModel;
    } else if (isAnonymous) {
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
                } as CSSProperties
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
