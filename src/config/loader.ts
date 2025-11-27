import * as fs from "fs";
import * as path from "path";
import { ClientConfig, EventConfig, IRCNotifyConfig, ServerConfig, SinkConfig } from "../types";
import { EnvSubstitution } from "../utils/env";
import { ConfigIO } from "./import-export";
import { ConfigValidator } from "./types";

/**
 * Configuration loader that loads from directory structure
 * All configs are JSON files
 * config/clients/<id>.json
 * config/servers/<id>.json
 * config/events/<id>.json
 * config/sinks/<id>.json
 */
export class ConfigLoader {
  // Track event file paths and original references to persist auto-fixes
  private static eventFileMap: Map<string, string> = new Map(); // eventId -> absolute file path (.json)
  private static eventServerIdsOriginal: Map<string, string[]> = new Map();
  private static eventSinkIdsOriginal: Map<string, string[]> = new Map();
  /**
   * Find main config file using standard resolution order
   * Prioritizes /config directory, falls back to config.default.json
   */
  static async findConfigFile(): Promise<string> {
    const candidates = [
      "config/config.json", // Primary location
      "config.json", // Legacy root location
      "config.dev.json",
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return path.resolve(candidate);
      }
    }

    // If no config found, check for config.default.json
    if (fs.existsSync("config.default.json")) {
      console.log("No configuration found. Initializing from config.default.json...");

      // Create config directory if it doesn't exist
      const configDir = "config";
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      // Copy default config to config/config.json
      const defaultContent = fs.readFileSync("config.default.json", "utf-8");
      fs.writeFileSync("config/config.json", defaultContent);
      console.log("✓ Created config/config.json from config.default.json");

      return path.resolve("config/config.json");
    }

    throw new Error(
      "No configuration file found. Looked for: " +
        candidates.join(", ") +
        "\n" +
        "Create config/config.json or place config.default.json in the root directory.",
    );
  }

  /**
   * Load main configuration and all referenced sub-configurations
   * If configPath is not provided, uses standard resolution order
   */
  static async load(configPath?: string): Promise<{
    config: IRCNotifyConfig;
    clients: ClientConfig[];
    servers: ServerConfig[];
    events: EventConfig[];
    sinks: SinkConfig[];
  }> {
    // Use standard resolution if no path provided
    if (!configPath) {
      configPath = await this.findConfigFile();
    }

    if (!fs.existsSync(configPath)) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }

    // Load as JSON
    const content = fs.readFileSync(configPath, "utf-8");
    let config: IRCNotifyConfig;
    try {
      config = JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to parse configuration file: ${error}`);
    }

    // Apply environment variable substitution
    config = EnvSubstitution.substituteObject(config);

    // Strip deprecated listing fields (always auto-discover)
    for (const key of ["clients", "servers", "events", "sinks"] as const) {
      if ((config as any)[key] !== undefined) {
        delete (config as any)[key];
      }
    }

    // Apply defaults
    config = this.applyDefaults(config);

    // Resolve config directory relative to config file if it's relative
    let configDir = config.global.configDirectory || path.dirname(configPath);
    if (!path.isAbsolute(configDir)) {
      configDir = path.resolve(path.dirname(configPath), configDir);
    }

    // Load configs in dependency order:
    // 1. Clients (no dependencies)
    // 2. Sinks (no dependencies, but needed by events)
    // 3. Servers (no dependencies, but needed by events)
    // 4. Events (depend on servers and sinks)
    // Note: All configs are JSON files
    // Always use discovery; ignore any root listing fields
    const clients = await this.loadClients([], configDir);
    const sinks = await this.loadSinks([], configDir);
    const servers = await this.loadServers([], configDir);
    const events = await this.loadEvents([], configDir);

    // Validate configurations

    // Final validation pass for JSON configs and cross-references
    ConfigValidator.validateMain(config);
    clients.forEach((c) => ConfigValidator.validateClient(c));
    servers.forEach((s) => ConfigValidator.validateServer(s));
    events.forEach((e) => ConfigValidator.validateEvent(e));
    sinks.forEach((s) => ConfigValidator.validateSink(s));
    ConfigValidator.validateReferences(config, clients, servers, events, sinks);

    // Persist any auto-fixes made during validation (e.g., pruning invalid IDs)
    await this.persistEventReferenceFixes(events);

    return { config, clients, servers, events, sinks };
  }

  /**
   * Load a single config file (JSON only)
   */
  private static async loadConfigFile<T>(filePath: string): Promise<T | null> {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      let config = JSON.parse(content);
      config = EnvSubstitution.substituteObject(config);
      return config;
    } catch (error: any) {
      console.error(`Failed to load config ${filePath}:`);
      console.error(`  Error: ${error.message || error}`);
      if (error.stack) {
        console.error(`  Stack: ${error.stack.split("\n")[0]}`);
      }
      return null;
    }
  }

  /**
   * Load client configurations
   * If refs is empty, discovers all configs in the clients directory
   */
  private static async loadClients(refs: string[], configDir: string): Promise<ClientConfig[]> {
    const clients: ClientConfig[] = [];

    // If no refs provided, discover all files in clients directory
    if (refs.length === 0) {
      const clientsDir = path.join(configDir, "clients");
      if (fs.existsSync(clientsDir)) {
        const files = fs
          .readdirSync(clientsDir)
          .filter((f) => f.endsWith(".json"))
          .map((f) => path.join(clientsDir, f));

        for (const filePath of files) {
          const client = await this.loadConfigFile<ClientConfig>(filePath);
          if (client) {
            if (!client.id) {
              client.id = path.basename(filePath).replace(/\.json$/, "");
            }
            clients.push(client);
          }
        }
      }
      return clients;
    }

    // Otherwise load specified refs
    for (const ref of refs) {
      const filePath = this.resolveConfigPath(ref, configDir, "clients");
      const client = await this.loadConfigFile<ClientConfig>(filePath);

      if (!client) {
        console.warn(`Client config not found: ${filePath}`);
        continue;
      }

      // Set ID from filename if not present
      if (!client.id) {
        client.id = path.basename(filePath).replace(/\.json$/, "");
      }

      clients.push(client);
    }

    return clients;
  }

  /**
   * Load server configurations
   * If refs is empty, discovers all configs in the servers directory
   */
  private static async loadServers(refs: string[], configDir: string): Promise<ServerConfig[]> {
    const servers: ServerConfig[] = [];

    // If no refs provided, discover all files in servers directory
    if (refs.length === 0) {
      const serversDir = path.join(configDir, "servers");
      if (fs.existsSync(serversDir)) {
        const files = fs
          .readdirSync(serversDir)
          .filter((f) => f.endsWith(".json"))
          .map((f) => path.join(serversDir, f));

        for (const filePath of files) {
          const server = await this.loadConfigFile<ServerConfig>(filePath);
          if (server) {
            if (!server.id) {
              server.id = path.basename(filePath).replace(/\.(ts|json)$/, "");
            }
            servers.push(server);
          }
        }
      }
      return servers;
    }

    // Otherwise load specified refs
    for (const ref of refs) {
      const filePath = this.resolveConfigPath(ref, configDir, "servers");
      const server = await this.loadConfigFile<ServerConfig>(filePath);

      if (!server) {
        console.warn(`Server config not found: ${filePath}`);
        continue;
      }

      if (!server.id) {
        server.id = path.basename(filePath).replace(/\.(ts|json)$/, "");
      }

      servers.push(server);
    }

    return servers;
  }

  /**
   * Load event configurations
   * If refs is empty, discovers all configs in the events directory
   */
  private static async loadEvents(refs: string[], configDir: string): Promise<EventConfig[]> {
    const events: EventConfig[] = [];
    // Reset tracking maps for a fresh load
    this.eventFileMap = new Map();
    this.eventServerIdsOriginal = new Map();
    this.eventSinkIdsOriginal = new Map();

    // If no refs provided, discover all files in events directory
    if (refs.length === 0) {
      const eventsDir = path.join(configDir, "events");
      if (fs.existsSync(eventsDir)) {
        const files = fs
          .readdirSync(eventsDir)
          .filter((f) => f.endsWith(".json"))
          .map((f) => path.join(eventsDir, f));

        for (const filePath of files) {
          const event = await this.loadConfigFile<EventConfig>(filePath);
          if (event) {
            if (!event.id) {
              event.id = path.basename(filePath).replace(/\.json$/, "");
            }
            // Track original references and file mapping
            this.eventFileMap.set(event.id, path.resolve(filePath));
            if (Array.isArray(event.serverIds)) {
              this.eventServerIdsOriginal.set(event.id, [...event.serverIds]);
            }
            if (Array.isArray(event.sinkIds)) {
              this.eventSinkIdsOriginal.set(event.id, [...event.sinkIds]);
            }
            events.push(event);
          }
        }
      }
      return events;
    }

    // Otherwise load specified refs
    for (const ref of refs) {
      const filePath = this.resolveConfigPath(ref, configDir, "events");
      const event = await this.loadConfigFile<EventConfig>(filePath);

      if (!event) {
        console.warn(`Event config not found: ${filePath}`);
        continue;
      }

      if (!event.id) {
        event.id = path.basename(filePath).replace(/\.json$/, "");
      }

      // Track original references and file mapping
      this.eventFileMap.set(event.id, path.resolve(filePath));
      if (Array.isArray(event.serverIds)) {
        this.eventServerIdsOriginal.set(event.id, [...event.serverIds]);
      }
      if (Array.isArray(event.sinkIds)) {
        this.eventSinkIdsOriginal.set(event.id, [...event.sinkIds]);
      }

      events.push(event);
    }

    return events;
  }

  /**
   * Load sink configurations
   * If refs is empty, discovers all configs in the sinks directory
   */
  private static async loadSinks(refs: string[], configDir: string): Promise<SinkConfig[]> {
    const sinks: SinkConfig[] = [];

    // If no refs provided, discover all files in sinks directory
    if (refs.length === 0) {
      const sinksDir = path.join(configDir, "sinks");
      if (fs.existsSync(sinksDir)) {
        const files = fs
          .readdirSync(sinksDir)
          .filter((f) => f.endsWith(".json"))
          .map((f) => path.join(sinksDir, f));

        for (const filePath of files) {
          const sink = await this.loadConfigFile<SinkConfig>(filePath);
          if (sink) {
            if (!sink.id) {
              sink.id = path.basename(filePath).replace(/\.json$/, "");
            }
            sinks.push(sink);
          }
        }
      }
      return sinks;
    }

    // Otherwise load specified refs
    for (const ref of refs) {
      const filePath = this.resolveConfigPath(ref, configDir, "sinks");
      const sink = await this.loadConfigFile<SinkConfig>(filePath);

      if (!sink) {
        console.warn(`Sink config not found: ${filePath}`);
        continue;
      }

      if (!sink.id) {
        sink.id = path.basename(filePath).replace(/\.json$/, "");
      }

      sinks.push(sink);
    }

    return sinks;
  }

  /**
   * Resolve a config reference to a file path
   * Only handles .json files
   */
  private static resolveConfigPath(ref: string, configDir: string, category: string): string {
    // If it's already a full path with extension, use it
    if ((ref.includes("/") || ref.includes("\\")) && ref.endsWith(".json")) {
      return path.resolve(configDir, ref);
    }

    // If it's a path without extension, add .json
    if (ref.includes("/") || ref.includes("\\")) {
      const jsonPath = path.resolve(configDir, `${ref}.json`);
      return jsonPath;
    }

    // Otherwise treat as ID and look for file in category directory
    const jsonPath = path.join(configDir, category, `${ref}.json`);
    return jsonPath;
  }

  /**
   * Apply default values to configuration
   */
  private static applyDefaults(config: IRCNotifyConfig): IRCNotifyConfig {
    config.global = config.global || {};
    config.global.pollInterval = config.global.pollInterval || 1000;
    config.global.debug = config.global.debug !== undefined ? config.global.debug : false;
    config.global.defaultLogDirectory = config.global.defaultLogDirectory || "/logs";
    config.global.configDirectory = config.global.configDirectory || "./config";

    return config;
  }

  /** Persist pruned serverIds/sinkIds back to their event files if they changed */
  private static async persistEventReferenceFixes(events: EventConfig[]): Promise<void> {
    for (const event of events) {
      const filePath = this.eventFileMap.get(event.id);
      if (!filePath) continue;

      const originalServers = this.eventServerIdsOriginal.get(event.id) || [];
      const originalSinks = this.eventSinkIdsOriginal.get(event.id) || [];
      const currentServers = Array.isArray(event.serverIds) ? event.serverIds : [];
      const currentSinks = Array.isArray(event.sinkIds) ? event.sinkIds : [];

      const serversChanged = originalServers.join("\u0000") !== currentServers.join("\u0000");
      const sinksChanged = originalSinks.join("\u0000") !== currentSinks.join("\u0000");

      if (serversChanged || sinksChanged) {
        try {
          const basePath = filePath.replace(/\.json$/, "");
          ConfigIO.writeConfigFile(basePath, JSON.stringify(event, null, 2), "events");
          console.log(
            `[validation] Saved updated references for event '${event.id}' → events/${path.basename(basePath)}.json`,
          );
        } catch (e) {
          console.warn(`[validation] Failed to persist fixes for event '${event.id}':`, e);
        }
      }
    }
  }
}
