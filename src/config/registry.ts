import { ClientConfig, EventConfig, IRCNotifyConfig, ServerConfig, SinkConfig } from "../types";

/**
 * Registry for tracking loaded configs and validating cross-references
 * Used during TypeScript config loading to validate references at load time
 */
export class ConfigRegistry {
  private static clients: Map<string, ClientConfig> = new Map();
  private static servers: Map<string, ServerConfig> = new Map();
  private static events: Map<string, EventConfig> = new Map();
  private static sinks: Map<string, SinkConfig> = new Map();
  private static mainConfig: IRCNotifyConfig | null = null;

  /**
   * Clear all registered configs
   */
  static clear(): void {
    this.clients.clear();
    this.servers.clear();
    this.events.clear();
    this.sinks.clear();
    this.mainConfig = null;
  }

  /**
   * Register a client config
   */
  static registerClient(config: ClientConfig): ClientConfig {
    if (this.clients.has(config.id)) {
      console.warn(`Warning: Client '${config.id}' is already registered. Overwriting.`);
    }
    this.clients.set(config.id, config);
    return config;
  }

  /**
   * Register a server config
   */
  static registerServer(config: ServerConfig): ServerConfig {
    if (this.servers.has(config.id)) {
      console.warn(`Warning: Server '${config.id}' is already registered. Overwriting.`);
    }
    this.servers.set(config.id, config);
    return config;
  }

  /**
   * Register an event config and validate sink metadata
   */
  static registerEvent(config: EventConfig): EventConfig {
    if (this.events.has(config.id)) {
      console.warn(`Warning: Event '${config.id}' is already registered. Overwriting.`);
    }

    // Validate sink metadata keys if sinks are registered
    if (config.metadata?.sink) {
      for (const [sinkId, sinkMetadata] of Object.entries(config.metadata.sink)) {
        const sink = this.sinks.get(sinkId);

        if (
          sink &&
          sink.allowedMetadata &&
          typeof sinkMetadata === "object" &&
          sinkMetadata !== null
        ) {
          const metadataKeys = Object.keys(sinkMetadata);
          const invalidKeys = metadataKeys.filter((key) => !sink.allowedMetadata!.includes(key));

          if (invalidKeys.length > 0) {
            throw new Error(
              `Event '${config.id}' has metadata.sink.${sinkId}.${invalidKeys.join(", ")} but sink '${sinkId}' does not allow these metadata keys. ` +
                `Allowed keys: ${sink.allowedMetadata.join(", ")}`,
            );
          }
        }
      }
    }

    this.events.set(config.id, config);
    return config;
  }

  /**
   * Register a sink config
   */
  static registerSink(config: SinkConfig): SinkConfig {
    if (this.sinks.has(config.id)) {
      console.warn(`Warning: Sink '${config.id}' is already registered. Overwriting.`);
    }
    this.sinks.set(config.id, config);
    return config;
  }

  /**
   * Register the main config
   */
  static registerMainConfig(config: IRCNotifyConfig): IRCNotifyConfig {
    if (this.mainConfig) {
      console.warn("Warning: Main config is already registered. Overwriting.");
    }
    this.mainConfig = config;
    return config;
  }

  /**
   * Validate that all IDs referenced in main config exist
   */
  static validateMainConfigReferences(config: IRCNotifyConfig): void {
    const errors: string[] = [];

    // Validate client references
    for (const clientId of config.clients) {
      if (!this.clients.has(clientId)) {
        errors.push(`Main config references unknown client: '${clientId}'`);
      }
    }

    // Validate server references
    for (const serverId of config.servers) {
      if (!this.servers.has(serverId)) {
        errors.push(`Main config references unknown server: '${serverId}'`);
      }
    }

    // Validate event references
    for (const eventId of config.events) {
      if (!this.events.has(eventId)) {
        errors.push(`Main config references unknown event: '${eventId}'`);
      }
    }

    // Validate sink references
    for (const sinkId of config.sinks) {
      if (!this.sinks.has(sinkId)) {
        errors.push(`Main config references unknown sink: '${sinkId}'`);
      }
    }

    if (errors.length > 0) {
      throw new Error("Main config validation failed:\n  - " + errors.join("\n  - "));
    }
  }

  /**
   * Get all registered configs (for debugging)
   */
  static getAll() {
    return {
      clients: Array.from(this.clients.values()),
      servers: Array.from(this.servers.values()),
      events: Array.from(this.events.values()),
      sinks: Array.from(this.sinks.values()),
      mainConfig: this.mainConfig,
    };
  }

  /**
   * Get a specific config by ID
   */
  static getClient(id: string): ClientConfig | undefined {
    return this.clients.get(id);
  }

  static getServer(id: string): ServerConfig | undefined {
    return this.servers.get(id);
  }

  static getEvent(id: string): EventConfig | undefined {
    return this.events.get(id);
  }

  static getSink(id: string): SinkConfig | undefined {
    return this.sinks.get(id);
  }

  static getMainConfig(): IRCNotifyConfig | null {
    return this.mainConfig;
  }
}
