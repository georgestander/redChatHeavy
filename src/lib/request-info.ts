import type { RequestInfo } from "rwsdk/worker";
import type { Session } from "@/lib/auth";

export type AppContext = {
  session: Session | null;
};

export type AppRequestInfo = RequestInfo<any, AppContext>;
