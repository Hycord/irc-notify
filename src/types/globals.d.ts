/**
 * Global type definitions for IRC Notify
 * Note: TypeScript config support removed - JSON only
 */

/// <reference types="./" />

import type {
  ClientConfig,
  EventConfig,
  IRCNotifyConfig,
  ServerConfig,
  SinkConfig,
} from "./index.ts";

// Type exports for JSON configs
declare global {
  // Config type references (for documentation)
  type IRCNotifyConfigType = IRCNotifyConfig;
  type ClientConfigType = ClientConfig;
  type ServerConfigType = ServerConfig;
  type EventConfigType = EventConfig;
  type SinkConfigType = SinkConfig;
  type FileSinkMetadata = FileMetadata;
  type HostEventMetadata = HostMetadata;

  const ConfigRegistry: typeof CR;
}

export {};
