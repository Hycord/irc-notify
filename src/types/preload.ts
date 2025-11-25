/**
 * Bun preload script for config directory
 * Makes define* helpers globally available with registry validation
 */

import { ConfigRegistry } from "../config/registry";
import {
  defineStrictClient,
  defineStrictConfig,
  defineStrictEvent,
  defineStrictServer,
  defineStrictSink,
} from "../config/strict-types";
import { defineClient, defineConfig, defineEvent, defineServer, defineSink } from "../config/types";

// Create registry-aware wrappers
const defineClientWithRegistry = <T extends Parameters<typeof defineClient>[0]>(config: T) => {
  const validated = defineClient(config);
  return ConfigRegistry.registerClient(validated);
};

const defineServerWithRegistry = <T extends Parameters<typeof defineServer>[0]>(config: T) => {
  const validated = defineServer(config);
  return ConfigRegistry.registerServer(validated);
};

const defineEventWithRegistry = <T extends Parameters<typeof defineEvent>[0]>(config: T) => {
  const validated = defineEvent(config);
  return ConfigRegistry.registerEvent(validated);
};

const defineSinkWithRegistry = <T extends Parameters<typeof defineSink>[0]>(config: T) => {
  const validated = defineSink(config);
  return ConfigRegistry.registerSink(validated);
};

const defineConfigWithRegistry = <T extends Parameters<typeof defineConfig>[0]>(config: T) => {
  const validated = defineConfig(config);
  return ConfigRegistry.registerMainConfig(validated);
};

// Attach to global object
(globalThis as any).defineConfig = defineConfigWithRegistry;
(globalThis as any).defineClient = defineClientWithRegistry;
(globalThis as any).defineServer = defineServerWithRegistry;
(globalThis as any).defineEvent = defineEventWithRegistry;
(globalThis as any).defineSink = defineSinkWithRegistry;
(globalThis as any).ConfigRegistry = ConfigRegistry;

// Attach strict helpers (no registry wrapping - they do their own validation)
(globalThis as any).defineStrictConfig = defineStrictConfig;
(globalThis as any).defineStrictClient = defineStrictClient;
(globalThis as any).defineStrictServer = defineStrictServer;
(globalThis as any).defineStrictEvent = defineStrictEvent;
(globalThis as any).defineStrictSink = defineStrictSink;
