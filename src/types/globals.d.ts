/**
 * Global type definitions for IRC Notify configuration files
 * This file makes the define* helpers available without imports
 */

/// <reference types="./" />

import type { ConfigRegistry as CR } from "../config/registry.js";
import type {
  ConsoleMetadata,
  defineStrictConfig as DSC,
  defineStrictClient as DSCl,
  defineStrictEvent as DSE,
  defineStrictServer as DSS,
  defineStrictSink as DSSi,
  FileMetadata,
  HostMetadata,
  NtfyMetadata,
  SinkMetadataMap,
  WebhookMetadata,
} from "../config/strict-types.js";
import type {
  ClientConfig,
  EventConfig,
  IRCNotifyConfig,
  ServerConfig,
  SinkConfig,
} from "./index.ts";

// Make helpers globally available
declare global {
  // Standard helpers (basic validation)
  function defineConfig<T extends IRCNotifyConfig>(config: T): T;
  function defineClient<T extends ClientConfig>(config: T): T;
  function defineServer<T extends ServerConfig>(config: T): T;
  function defineEvent<T extends EventConfig>(config: T): T;
  function defineSink<T extends SinkConfig>(config: T): T;

  // Strict helpers (duplicate key prevention + full validation)
  const defineStrictEvent: typeof DSE;
  const defineStrictConfig: typeof DSC;
  const defineStrictClient: typeof DSCl;
  const defineStrictServer: typeof DSS;
  const defineStrictSink: typeof DSSi;

  // Type exports for strict mode
  type SinkMetadata = SinkMetadataMap;
  type NtfySinkMetadata = NtfyMetadata;
  type WebhookSinkMetadata = WebhookMetadata;
  type ConsoleSinkMetadata = ConsoleMetadata;
  type FileSinkMetadata = FileMetadata;
  type HostEventMetadata = HostMetadata;

  const ConfigRegistry: typeof CR;
}

export {};
