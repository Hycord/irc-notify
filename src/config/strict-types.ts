/**
 * Strict TypeScript types for IRC Notify configuration
 *
 * Rebuilt from ground up based on CONFIG_TYPE_SYSTEM.md
 * Provides full autocomplete and type safety for all config properties
 */

import type {
  EventConfig as BaseEventConfig,
  ClientConfig,
  FilterGroup,
  IRCNotifyConfig,
  ServerConfig,
  SinkConfig,
} from "../types";

// ============================================================================
// Sink Metadata Type Definitions (from CONFIG_TYPE_SYSTEM.md Section 7)
// ============================================================================

/**
 * Ntfy sink metadata
 * Based on src/sinks/ntfy.ts implementation
 */
export interface NtfyMetadata {
  /** Override title template */
  title?: string;
  /** Override body template */
  body?: string;
  /** Notification priority */
  priority?: "max" | "urgent" | "high" | "default" | "low" | "min";
  /** Emoji tags (string or array) */
  tags?: string | string[];
  /** Additional HTTP headers */
  headers?: Record<string, string>;
}

/**
 * Webhook sink metadata
 * Based on src/sinks/webhook.ts implementation
 */
export interface WebhookMetadata {
  /** Override title template */
  title?: string;
  /** Override body template */
  body?: string;
  /** Additional JSON fields in webhook payload */
  fields?: Record<string, any>;
  /** Additional HTTP headers */
  headers?: Record<string, string>;
}

/**
 * Console sink metadata
 * Based on src/sinks/console.ts implementation
 * Inherits title/body from BaseSink
 */
export interface ConsoleMetadata {
  /** Override title template */
  title?: string;
  /** Override body template */
  body?: string;
  /** Output format */
  format?: "text" | "json";
  /** Terminal color (if supported) */
  color?: string;
}

/**
 * File sink metadata
 * Based on src/sinks/file.ts implementation
 * Inherits title/body from BaseSink
 */
export interface FileMetadata {
  /** Override title template */
  title?: string;
  /** Override body template */
  body?: string;
}

// ============================================================================
// Host Metadata (for event-level server/host overrides)
// ============================================================================

/**
 * Host metadata for event configurations
 * Allows events to override server-related display values in templates
 * These values will be merged into context.server before template processing
 */
export interface HostMetadata {
  /** Override server hostname */
  hostname?: string;
  /** Override server display name */
  displayName?: string;
  /** Override network name */
  network?: string;
  /** Override port number */
  port?: number;
  /** Additional custom metadata */
  [key: string]: any;
}

// ============================================================================
// Sink Type Registry
// ============================================================================

/**
 * Registry mapping sink types to their metadata interfaces
 * This is the single source of truth for sink type validation
 */
export interface SinkTypeRegistry {
  ntfy: NtfyMetadata;
  webhook: WebhookMetadata;
  console: ConsoleMetadata;
  file: FileMetadata;
}

/**
 * Union of all known sink types
 */
export type KnownSinkType = keyof SinkTypeRegistry;

/**
 * Get metadata type for a specific sink type
 */
export type MetadataForSinkType<T extends string> = T extends KnownSinkType
  ? SinkTypeRegistry[T]
  : Record<string, any>; // Unknown sink types allow any metadata

// ============================================================================
// Strict Event Configuration Types
// ============================================================================

/**
 * Extract literal types from readonly array
 * This preserves "ntfy" and "console" as literal types instead of string
 */
type ArrayToUnion<T extends readonly string[]> = T[number];

/**
 * Convert array of sink IDs to a mapped type
 * ['ntfy', 'console'] => { ntfy: 'ntfy', console: 'console' }
 */
type SinkIdsToMap<T extends readonly string[]> = {
  [K in ArrayToUnion<T>]: K;
};

/**
 * Sink metadata with proper type inference
 * Maps sink IDs to their corresponding metadata types
 */
export type StrictSinkMetadata<TSinkIds extends readonly string[]> = {
  [K in ArrayToUnion<TSinkIds>]?: MetadataForSinkType<K>;
};

/**
 * Strict event metadata with type-safe sink configuration
 */
export interface StrictEventMetadata<TSinkIds extends readonly string[]> {
  /** Event description */
  description?: string;
  /** Host/server display overrides for templates */
  host?: HostMetadata;
  /** Sink-specific metadata overrides */
  sink?: StrictSinkMetadata<TSinkIds>;
  /** Allow additional custom metadata */
  [key: string]: any;
}

/**
 * Strict event configuration with full type safety
 *
 * Generic parameter TSinkIds is a readonly array of literal strings
 * ['ntfy', 'console'] as const
 */
export interface StrictEventConfig<TSinkIds extends readonly string[]>
  extends Omit<BaseEventConfig, "metadata" | "sinkIds"> {
  /** Sink IDs that this event routes to - MUST use 'as const' for autocomplete */
  sinkIds: TSinkIds;
  /** Event metadata with type-safe sink overrides */
  metadata?: StrictEventMetadata<TSinkIds>;
}

// ============================================================================
// Builder Function - Provides Autocomplete
// ============================================================================

/**
 * Create a type-safe event configuration with autocomplete
 *
 * CRITICAL: sinkIds must use 'as const' for autocomplete to work!
 *
 * Usage:
 * ```typescript
 * export default defineStrictEvent({
 *   id: 'my-event',
 *   sinkIds: ['ntfy', 'console'] as const,  // <-- 'as const' is REQUIRED
 *   metadata: {
 *     sink: {
 *       ntfy: { priority: 'high' }, // Full autocomplete!
 *       console: { format: 'json' }  // Full autocomplete!
 *     }
 *   }
 * });
 * ```
 */
export function defineStrictEvent<TSinkIds extends readonly string[]>(
  eventConfig: StrictEventConfig<TSinkIds>,
): BaseEventConfig {
  // Runtime validation
  if (eventConfig.metadata?.sink) {
    for (const [sinkId, metadata] of Object.entries(eventConfig.metadata.sink)) {
      // Assume sink type matches sink ID by default
      const sinkType = sinkId;

      // Validate metadata keys for known sink types
      if (metadata && typeof metadata === "object") {
        const allowedKeys = getMetadataKeysForSinkType(sinkType);
        if (allowedKeys) {
          const metadataKeys = Object.keys(metadata);
          for (const key of metadataKeys) {
            if (!allowedKeys.includes(key)) {
              throw new Error(
                `Event '${eventConfig.id}' has metadata.sink.${sinkId}.${key} but sink type '${sinkType}' ` +
                  `does not allow metadata key '${key}'. Allowed keys: ${allowedKeys.join(", ")}`,
              );
            }
          }
        }
      }
    }
  }

  // Convert to runtime EventConfig
  return {
    ...eventConfig,
    sinkIds: [...eventConfig.sinkIds] as string[],
  };
}

/**
 * Get allowed metadata keys for a sink type
 * Returns null for custom/unknown sink types (allows any keys)
 */
function getMetadataKeysForSinkType(sinkType: string): string[] | null {
  const knownTypes: Record<string, string[]> = {
    ntfy: ["title", "body", "priority", "tags", "headers"],
    webhook: ["title", "body", "fields", "headers"],
    console: ["title", "body", "format", "color"],
    file: ["title", "body"],
  };

  return knownTypes[sinkType] || null;
}

// ============================================================================
// Standard Builder Functions (for non-event configs)
// ============================================================================

export function defineStrictConfig<T extends IRCNotifyConfig>(config: T): IRCNotifyConfig {
  return config;
}

export function defineStrictClient<T extends ClientConfig>(config: T): ClientConfig {
  return config;
}

export function defineStrictServer<T extends ServerConfig>(config: T): ServerConfig {
  return config;
}

export function defineStrictSink<T extends SinkConfig>(config: T): SinkConfig {
  return config;
}

// Types are already exported via their declarations above
