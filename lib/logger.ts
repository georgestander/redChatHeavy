import pino, { type Logger, type LoggerOptions, stdTimeFunctions } from "pino";
import { config } from "@/lib/config";

// Prefer JSON in production; pretty in development.
// We also add base bindings so child loggers inherit app metadata.
const isWorkersRuntime = "WebSocketPair" in globalThis;
const shouldUsePrettyTransport =
  process.env.NODE_ENV !== "production" && !isWorkersRuntime;
const workerDestination = {
  write(message: string) {
    console.log(message.trimEnd());
  },
};

const baseOptions: LoggerOptions = {
  base: { app: config.appPrefix },
  timestamp: stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "password",
      "headers.authorization",
      "headers.cookie",
      "cookies",
      "token",
    ],
    remove: false,
  },
};

const defaultLevel = process.env.NODE_ENV === "production" ? "info" : "debug";

let logger: Logger;
if (shouldUsePrettyTransport) {
  logger = pino({
    level: "debug",
    ...baseOptions,
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
        singleLine: false,
      },
    },
  });
} else if (isWorkersRuntime) {
  logger = pino(
    {
      level: defaultLevel,
      ...baseOptions,
    },
    workerDestination
  );
} else {
  logger = pino({
    level: defaultLevel,
    ...baseOptions,
  });
}

export function createModuleLogger(moduleName: string): Logger {
  return logger.child({ module: moduleName });
}
