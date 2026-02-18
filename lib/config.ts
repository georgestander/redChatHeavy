import userConfig from "@/chat.config";
import { configSchema } from "./config-schema";

/**
 * Parsed configuration with defaults applied.
 * Import this for runtime access to config values.
 *
 * @example
 * import { config } from "@/lib/config";
 * console.log(config.appName);
 */
export const config = configSchema.parse(userConfig);

export type { Config } from "./config-schema";
