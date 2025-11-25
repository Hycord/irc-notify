import * as fs from "fs";
import * as path from "path";
import { ClientConfig, EventConfig, IRCNotifyConfig, ServerConfig, SinkConfig } from "../types";
import { EnvSubstitution } from "../utils/env";
import { ConfigRegistry } from "./registry";
import { ConfigValidator } from "./types";

/**
 * Configuration loader that loads from directory structure
 * Supports both .ts and .json config files
 * config/clients/<id>.ts|.json
 * config/servers/<id>.ts|.json
 * config/events/<id>.ts|.json
 * config/sinks/<id>.ts|.json
 */
export class ConfigLoader {
  /**
   * Find main config file using standard resolution order
   * Prioritizes /config directory, falls back to config.default.ts
   */
  static async findConfigFile(): Promise<string> {
    const candidates = [
      "config/config.ts", // Primary location
      "config/config.json",
      "config.ts", // Legacy root location
      "config.json",
      "config.dev.json",
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return path.resolve(candidate);
      }
    }

    // If no config found, check for config.default.ts and copy it to config/config.ts
    if (fs.existsSync("config.default.ts")) {
      console.log("No configuration found. Initializing from config.default.ts...");

      // Create config directory if it doesn't exist
      const configDir = "config";
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      // Copy default config to config/config.ts
      const defaultContent = fs.readFileSync("config.default.ts", "utf-8");
      // Update the import path in the copied file (from root to config/ subdirectory)
      const updatedContent = defaultContent.replace(
        'import { defineConfig } from "./src/config/types";',
        'import { defineConfig } from "../src/config/types";',
      );
      fs.writeFileSync("config/config.ts", updatedContent);
      console.log("✓ Created config/config.ts from config.default.ts");

      return path.resolve("config/config.ts");
    }

    throw new Error(
      "No configuration file found. Looked for: " +
        candidates.join(", ") +
        "\n" +
        "Create config/config.ts or place config.default.ts in the root directory.",
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

    let config: IRCNotifyConfig;

    // Check if it's a TypeScript file
    if (configPath.endsWith(".ts")) {
      // Ensure globals are loaded before importing main config
      await this.ensureGlobalHelpers();

      // Convert to absolute path with file:// protocol for dynamic import
      const absolutePath = path.isAbsolute(configPath) ? configPath : path.resolve(configPath);
      const fileUrl = `file://${absolutePath}`;
      const module = await import(fileUrl);
      config = module.default;
    } else {
      // Load as JSON
      const content = fs.readFileSync(configPath, "utf-8");
      try {
        config = JSON.parse(content);
      } catch (error) {
        throw new Error(`Failed to parse configuration file: ${error}`);
      }
    }

    // Apply environment variable substitution
    config = EnvSubstitution.substituteObject(config);

    // Apply defaults
    config = this.applyDefaults(config);

    // Resolve config directory relative to config file if it's relative
    let configDir = config.global.configDirectory || path.dirname(configPath);
    if (!path.isAbsolute(configDir)) {
      configDir = path.resolve(path.dirname(configPath), configDir);
    }

    // Clear registry before loading
    ConfigRegistry.clear();

    // Load configs in dependency order:
    // 1. Clients (no dependencies)
    // 2. Sinks (no dependencies, but needed by events)
    // 3. Servers (no dependencies, but needed by events)
    // 4. Events (depend on servers and sinks)
    // Note: Sub-configs are validated via registry during load if using .ts files
    const clients = await this.loadClients(config.clients, configDir);
    const sinks = await this.loadSinks(config.sinks, configDir);
    const servers = await this.loadServers(config.servers, configDir);
    const events = await this.loadEvents(config.events, configDir);

    // Register all loaded configs in the registry (needed for JSON configs)
    clients.forEach((c) => ConfigRegistry.registerClient(c));
    sinks.forEach((s) => ConfigRegistry.registerSink(s));
    servers.forEach((s) => ConfigRegistry.registerServer(s));
    ConfigRegistry.registerMainConfig(config);
    events.forEach((e) => ConfigRegistry.registerEvent(e));

    // Validate cross-references after all configs are registered
    ConfigRegistry.validateMainConfigReferences(config);

    // Final validation pass for JSON configs and cross-references
    ConfigValidator.validateMain(config);
    clients.forEach((c) => ConfigValidator.validateClient(c));
    servers.forEach((s) => ConfigValidator.validateServer(s));
    events.forEach((e) => ConfigValidator.validateEvent(e));
    sinks.forEach((s) => ConfigValidator.validateSink(s));
    ConfigValidator.validateReferences(config, clients, servers, events, sinks);

    return { config, clients, servers, events, sinks };
  }

  /**
   * Ensure global helpers are loaded
   * Made public for use by ConfigIO
   */
  private static globalHelpersLoaded = false;
  static async ensureGlobalHelpers(): Promise<void> {
    if (this.globalHelpersLoaded) return;

    try {
      // Try both possible locations for preload file
      const candidates = [
        path.resolve(__dirname, "../types/preload.ts"),
        path.resolve(__dirname, "../../config/preload.ts"),
      ];

      for (const preloadPath of candidates) {
        if (fs.existsSync(preloadPath)) {
          await import(`file://${preloadPath}`);
          break;
        }
      }
    } catch (error) {
      // Preload is optional
    }

    this.globalHelpersLoaded = true;
  }

  /**
   * Load a single config file (supports both .ts and .json)
   */
  private static async loadConfigFile<T>(filePath: string): Promise<T | null> {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      if (filePath.endsWith(".ts")) {
        // Ensure globals are loaded before importing TS configs
        await this.ensureGlobalHelpers();

        // Convert to absolute path with file:// protocol for dynamic import
        const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
        const fileUrl = `file://${absolutePath}`;
        const module = await import(fileUrl);
        return module.default;
      } else {
        const content = fs.readFileSync(filePath, "utf-8");
        let config = JSON.parse(content);
        config = EnvSubstitution.substituteObject(config);
        return config;
      }
    } catch (error) {
      console.error(`Failed to load config ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Load client configurations
   */
  private static async loadClients(refs: string[], configDir: string): Promise<ClientConfig[]> {
    const clients: ClientConfig[] = [];

    for (const ref of refs) {
      const filePath = this.resolveConfigPath(ref, configDir, "clients");
      const client = await this.loadConfigFile<ClientConfig>(filePath);

      if (!client) {
        console.warn(`Client config not found: ${filePath}`);
        continue;
      }

      // Set ID from filename if not present
      if (!client.id) {
        client.id = path.basename(filePath).replace(/\.(ts|json)$/, "");
      }

      clients.push(client);
    }

    return clients;
  }

  /**
   * Load server configurations
   */
  private static async loadServers(refs: string[], configDir: string): Promise<ServerConfig[]> {
    const servers: ServerConfig[] = [];

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
   */
  private static async loadEvents(refs: string[], configDir: string): Promise<EventConfig[]> {
    const events: EventConfig[] = [];

    for (const ref of refs) {
      const filePath = this.resolveConfigPath(ref, configDir, "events");
      const event = await this.loadConfigFile<EventConfig>(filePath);

      if (!event) {
        console.warn(`Event config not found: ${filePath}`);
        continue;
      }

      if (!event.id) {
        event.id = path.basename(filePath).replace(/\.(ts|json)$/, "");
      }

      events.push(event);
    }

    return events;
  }

  /**
   * Load sink configurations
   */
  private static async loadSinks(refs: string[], configDir: string): Promise<SinkConfig[]> {
    const sinks: SinkConfig[] = [];

    for (const ref of refs) {
      const filePath = this.resolveConfigPath(ref, configDir, "sinks");
      const sink = await this.loadConfigFile<SinkConfig>(filePath);

      if (!sink) {
        console.warn(`Sink config not found: ${filePath}`);
        continue;
      }

      if (!sink.id) {
        sink.id = path.basename(filePath).replace(/\.(ts|json)$/, "");
      }

      sinks.push(sink);
    }

    return sinks;
  }

  /**
   * Resolve a config reference to a file path
   * Checks for both .ts and .json extensions
   */
  private static resolveConfigPath(ref: string, configDir: string, category: string): string {
    // If it's already a full path with extension, use it
    if (
      (ref.includes("/") || ref.includes("\\")) &&
      (ref.endsWith(".ts") || ref.endsWith(".json"))
    ) {
      return path.resolve(configDir, ref);
    }

    // If it's a path without extension, try both
    if (ref.includes("/") || ref.includes("\\")) {
      const tsPath = path.resolve(configDir, `${ref}.ts`);
      const jsonPath = path.resolve(configDir, `${ref}.json`);

      if (fs.existsSync(tsPath)) return tsPath;
      if (fs.existsSync(jsonPath)) return jsonPath;
      return tsPath; // Default to .ts for error messages
    }

    // Otherwise treat as ID and look for file in category directory
    // Prefer .ts over .json
    const tsPath = path.join(configDir, category, `${ref}.ts`);
    const jsonPath = path.join(configDir, category, `${ref}.json`);

    if (fs.existsSync(tsPath)) return tsPath;
    if (fs.existsSync(jsonPath)) return jsonPath;
    return tsPath; // Default to .ts for error messages
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

    config.clients = config.clients || [];
    config.servers = config.servers || [];
    config.events = config.events || [];
    config.sinks = config.sinks || [];

    return config;
  }
}
