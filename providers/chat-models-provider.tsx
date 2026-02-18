"use client";

import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from "react";
import {
  type AppModelDefinition,
  getDefaultEnabledModels,
} from "@/lib/ai/app-models";
import { settingsKeys } from "@/lib/query-keys";
import { useSession } from "@/providers/session-provider";
import { getModelPreferences } from "@/server/actions/settings";

type ChatModelsContextType = {
  models: AppModelDefinition[];
  allModels: AppModelDefinition[];
  getModelById: (modelId: string) => AppModelDefinition | undefined;
};

const ChatModelsContext = createContext<ChatModelsContextType | undefined>(
  undefined
);

export function ChatModelsProvider({
  children,
  models,
}: {
  children: ReactNode;
  models: AppModelDefinition[];
}) {
  const { data: session } = useSession();
  const isAuthenticated = !!session?.user;

  const { data: preferences } = useQuery({
    queryKey: settingsKeys.modelPreferences,
    queryFn: getModelPreferences,
    enabled: isAuthenticated,
  });

  const allModelsMap = useMemo(() => {
    const map = new Map<string, AppModelDefinition>();
    for (const model of models) {
      map.set(model.id, model);
    }
    return map;
  }, [models]);

  const enabledModelsSet = useMemo(() => {
    const enabled = getDefaultEnabledModels(models);
    for (const pref of preferences ?? []) {
      if (pref.enabled) {
        enabled.add(pref.modelId);
      } else {
        enabled.delete(pref.modelId);
      }
    }
    return enabled;
  }, [models, preferences]);

  const filteredModels = useMemo(
    () => models.filter((model) => enabledModelsSet.has(model.id)),
    [models, enabledModelsSet]
  );

  const getModelById = useCallback(
    (modelId: string) => allModelsMap.get(modelId),
    [allModelsMap]
  );

  return (
    <ChatModelsContext.Provider
      value={{ models: filteredModels, allModels: models, getModelById }}
    >
      {children}
    </ChatModelsContext.Provider>
  );
}

export function useChatModels() {
  const context = useContext(ChatModelsContext);
  if (context === undefined) {
    throw new Error("useChatModels must be used within a ChatModelsProvider");
  }
  return context;
}
