import * as path from "path";
import { GenericClientAdapter } from "./adapters/generic";
import { ConfigApiServer } from "./api/server";
import { ConfigLoader } from "./config/loader";
import { EventProcessor } from "./events/processor";
import { SinkFactory } from "./sinks/factory";
import {
  ClientAdapter,
  ClientConfig,
  EventConfig,
  IRCNotifyConfig,
  MessageContext,
  ServerConfig,
  Sink,
  SinkConfig,
} from "./types";
import { LogWatcher } from "./watcher/log-watcher";

/**
 * Main orchestrator for the IRC notification system
 */
export class IRCNotifyOrchestrator {
  private config!: IRCNotifyConfig;
  private clientConfigs!: ClientConfig[];
  private serverConfigs!: ServerConfig[];
  private eventConfigs!: EventConfig[];
  private sinkConfigs!: SinkConfig[];
  private clients: Map<string, ClientAdapter> = new Map();
  private sinks: Map<string, Sink> = new Map();
  private watchers: LogWatcher[] = [];
  private watcherPositions: Map<string, Map<string, number>> = new Map(); // clientId -> filePositions
  private eventProcessor!: EventProcessor;
  private configPath?: string;
  private configDir!: string;
  private running: boolean = false;
  private reloading: boolean = false;
  private apiServer?: ConfigApiServer;

  constructor(configPath?: string) {
    this.configPath = configPath;
  }

  /**
   * Initialize the system
   */
  async initialize(): Promise<void> {
    console.log("Initializing IRC Notification System...");

    // Ensure config directories exist
    await this.ensureConfigDirectories();

    // Check for and auto-import backups if no config exists
    await this.autoImportBackup();

    // Load configuration (uses standard resolution if no path provided)
    const loaded = await ConfigLoader.load(this.configPath);
    this.config = loaded.config;
    this.clientConfigs = loaded.clients;
    this.serverConfigs = loaded.servers;
    this.eventConfigs = loaded.events;
    this.sinkConfigs = loaded.sinks;

    const actualPath = this.configPath || (await ConfigLoader.findConfigFile());

    // Resolve absolute config directory path
    let configDir = this.config.global.configDirectory || path.dirname(actualPath);
    if (!path.isAbsolute(configDir)) {
      configDir = path.resolve(path.dirname(actualPath), configDir);
    }
    this.configDir = configDir;

    console.log(`Loaded configuration from ${actualPath}`);

    const enabledClients = this.clientConfigs.filter((c) => c.enabled).length;
    const enabledServers = this.serverConfigs.filter((s) => s.enabled).length;
    const enabledEvents = this.eventConfigs.filter((e) => e.enabled).length;
    const enabledSinks = this.sinkConfigs.filter((s) => s.enabled).length;

    console.log(`  - ${this.clientConfigs.length} clients (${enabledClients} enabled)`);
    console.log(`  - ${this.serverConfigs.length} servers (${enabledServers} enabled)`);
    console.log(`  - ${this.eventConfigs.length} events (${enabledEvents} enabled)`);
    console.log(`  - ${this.sinkConfigs.length} sinks (${enabledSinks} enabled)`);

    // Initialize clients
    await this.initializeClients();

    // Initialize sinks
    await this.initializeSinks();

    // Initialize event processor
    this.eventProcessor = new EventProcessor(
      this.eventConfigs,
      this.serverConfigs,
      this.config.global.debug || false,
    );

    console.log("Initialization complete");
  }

  /**
   * Initialize all client adapters
   */
  private async initializeClients(): Promise<void> {
    for (const clientConfig of this.clientConfigs) {
      if (!clientConfig.enabled) {
        if (this.config.global.debug) {
          console.log(`Skipping disabled client: ${clientConfig.name} (${clientConfig.id})`);
        }
        continue;
      }

      try {
        const adapter = new GenericClientAdapter(clientConfig, this.config.global.debug || false);

        await adapter.initialize();
        this.clients.set(clientConfig.id, adapter);

        console.log(`Initialized client: ${clientConfig.name} (${clientConfig.type})`);
      } catch (error) {
        console.error(`Failed to initialize client ${clientConfig.id}:`, error);
      }
    }
  }

  /**
   * Initialize all sinks
   */
  private async initializeSinks(): Promise<void> {
    for (const sinkConfig of this.sinkConfigs) {
      if (!sinkConfig.enabled) {
        if (this.config.global.debug) {
          console.log(`Skipping disabled sink: ${sinkConfig.name} (${sinkConfig.id})`);
        }
        continue;
      }

      try {
        const sink = SinkFactory.create(sinkConfig, this.config.global.debug || false);

        await sink.initialize();
        this.sinks.set(sinkConfig.id, sink);

        console.log(`Initialized sink: ${sinkConfig.name} (${sinkConfig.type})`);
      } catch (error) {
        console.error(`Failed to initialize sink ${sinkConfig.id}:`, error);
      }
    }
  }

  /**
   * Ensure config directories exist
   */
  private async ensureConfigDirectories(): Promise<void> {
    const fs = await import("fs");
    const path = await import("path");

    const configDir = "./config";
    const categories = ["clients", "servers", "events", "sinks"];

    // Create main config directory
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
      console.log(`Created config directory: ${configDir}`);
    }

    // Create category directories
    for (const category of categories) {
      const categoryDir = path.join(configDir, category);
      if (!fs.existsSync(categoryDir)) {
        fs.mkdirSync(categoryDir, { recursive: true });
        console.log(`Created config directory: ${categoryDir}`);
      }
    }

    // Create backups directory
    const backupsDir = "./backups";
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
      console.log(`Created backups directory: ${backupsDir}`);
    }
  }

  /**
   * Auto-import the most recent backup if no config exists
   */
  private async autoImportBackup(): Promise<void> {
    const fs = await import("fs");
    const path = await import("path");
    const { ConfigIO } = await import("./config/import-export");

    // Check if config already exists
    const configCandidates = ["config/config.json", "config.json"];

    const hasConfig = configCandidates.some((c) => fs.existsSync(c));

    if (hasConfig) {
      // Config exists, don't auto-import
      return;
    }

    // Check for backups
    const backupsDir = "./backups";
    if (!fs.existsSync(backupsDir)) {
      return;
    }

    const backupFiles = fs
      .readdirSync(backupsDir)
      .filter((f) => f.endsWith(".json.gz") || f.endsWith(".json"))
      .map((f) => path.join(backupsDir, f));

    if (backupFiles.length === 0) {
      console.log("No config found and no backups available");
      return;
    }

    // Read metadata from each backup to find the most recent
    let mostRecentBackup: { path: string; timestamp: Date } | null = null;

    for (const backupPath of backupFiles) {
      try {
        let jsonContent: string;

        if (backupPath.endsWith(".gz")) {
          const { createGunzip } = await import("zlib");
          const { pipeline } = await import("stream/promises");

          const chunks: Buffer[] = [];
          const readStream = fs.createReadStream(backupPath);
          const gunzipStream = createGunzip();

          await pipeline(readStream, gunzipStream, async function* (source) {
            for await (const chunk of source) {
              chunks.push(chunk as Buffer);
            }
          });

          jsonContent = Buffer.concat(chunks).toString("utf-8");
        } else {
          jsonContent = fs.readFileSync(backupPath, "utf-8");
        }

        const exportData = JSON.parse(jsonContent);
        const timestamp = new Date(exportData.timestamp);

        if (!mostRecentBackup || timestamp > mostRecentBackup.timestamp) {
          mostRecentBackup = { path: backupPath, timestamp };
        }
      } catch (error) {
        console.warn(`Failed to read backup ${backupPath}:`, error);
      }
    }

    if (!mostRecentBackup) {
      console.log("No valid backups found");
      return;
    }

    console.log(`\n🔄 No config found. Auto-importing most recent backup:`);
    console.log(
      `   ${path.basename(mostRecentBackup.path)} (${mostRecentBackup.timestamp.toISOString()})`,
    );
    console.log();

    try {
      await ConfigIO.mergeConfigWithOptions({
        inputPath: mostRecentBackup.path,
        targetDir: "./config",
        preferIncoming: true,
      });
      console.log("✓ Backup imported successfully\n");
    } catch (error) {
      console.error("Failed to import backup:", error);
      throw new Error("No configuration available and backup import failed");
    }
  }

  /**
   * Start the API server (optional)
   */
  /**
   * Get current configuration
   */
  getConfig(): IRCNotifyConfig {
    return this.config;
  }

  /**
   * Get all client configurations
   */
  getClientConfigs(): ClientConfig[] {
    return this.clientConfigs;
  }

  /**
   * Get all server configurations
   */
  getServerConfigs(): ServerConfig[] {
    return this.serverConfigs;
  }

  /**
   * Get all event configurations
   */
  getEventConfigs(): EventConfig[] {
    return this.eventConfigs;
  }

  /**
   * Get all sink configurations
   */
  getSinkConfigs(): SinkConfig[] {
    return this.sinkConfigs;
  }

  /**
   * Get all client adapter instances
   */
  getClientInstances(): Map<string, ClientAdapter> {
    return this.clients;
  }

  async startApi(options?: {
    port?: number;
    host?: string;
    authToken?: string;
    enableFileOps?: boolean;
  }): Promise<void> {
    if (this.apiServer) {
      console.warn("API server is already running");
      return;
    }

    this.apiServer = new ConfigApiServer({
      ...options,
      orchestrator: this,
    });

    await this.apiServer.start();
    console.log("API server started");
  }

  /**
   * Start the notification system
   */
  async start(): Promise<void> {
    if (this.running) {
      console.warn("System is already running");
      return;
    }

    console.log("Starting IRC Notification System...");
    this.running = true;

    // Start watching log files for each client
    for (const [clientId, adapter] of this.clients) {
      const watcher = new LogWatcher(
        adapter,
        (context) => this.handleMessage(context),
        this.config.global.debug || false,
        this.config.global.rescanLogsOnStartup || false,
      );

      await watcher.start();
      this.watchers.push(watcher);

      console.log(`Started log watcher for client: ${clientId}`);
    }

    // Periodically refresh watched files
    setInterval(async () => {
      for (const watcher of this.watchers) {
        await watcher.refresh();
      }
    }, this.config.global.pollInterval || 10000);

    console.log("System started successfully");
  }

  /**
   * Handle incoming message from log watcher
   */
  private async handleMessage(context: MessageContext): Promise<void> {
    try {
      if (this.config.global.debug) {
        console.log(
          `[handleMessage] Processing message from ${context.client.id}: ${context.message?.content?.substring(0, 50)}`,
        );
      }

      // Check if the client is enabled
      const clientConfig = this.clientConfigs.find((c) => c.id === context.client.id);
      if (!clientConfig || !clientConfig.enabled) {
        if (this.config.global.debug) {
          console.log(`Skipping message from disabled client: ${context.client.id}`);
        }
        return;
      }

      // Process message through event system
      const matchedEvents = this.eventProcessor.processMessage(context);

      // Send notifications for matched events
      for (const event of matchedEvents) {
        // Chain-drop: if any sink referenced by the event is disabled, drop the whole event
        const disabledSink = event.sinkIds.find((sid) => {
          const cfg = this.sinkConfigs.find((s) => s.id === sid);
          return !cfg || !cfg.enabled;
        });
        if (disabledSink) {
          if (this.config.global.debug) {
            console.log(
              `Dropping event '${event.id}' due to disabled sink in chain: ${disabledSink}`,
            );
          }
          continue;
        }

        for (const sinkId of event.sinkIds) {
          // Check if sink is enabled
          const sinkConfig = this.sinkConfigs.find((s) => s.id === sinkId);
          if (!sinkConfig || !sinkConfig.enabled) {
            if (this.config.global.debug) {
              console.log(`Skipping disabled sink: ${sinkId}`);
            }
            continue;
          }

          const sink = this.sinks.get(sinkId);
          if (!sink) {
            console.warn(`Sink not found: ${sinkId}`);
            continue;
          }

          try {
            await sink.send(context, event);
          } catch (error) {
            console.error(`Failed to send to sink ${sinkId}:`, error);
          }
        }
      }
    } catch (error) {
      console.error("Error handling message:", error);
    }
  }

  /**
   * Reload configuration
   */
  private async reload(): Promise<void> {
    try {
      if (this.reloading) {
        console.warn("Reload already in progress");
        return;
      }
      this.reloading = true;

      const wasRunning = this.running;
      if (wasRunning) {
        // Save file positions from all watchers before stopping
        for (let i = 0; i < this.watchers.length; i++) {
          const watcher = this.watchers[i];
          const clientId = Array.from(this.clients.keys())[i];
          if (clientId) {
            this.watcherPositions.set(clientId, watcher.getFilePositions());
          }
        }

        // Stop watchers only (keep instantiated clients/sinks until replaced)
        for (const watcher of this.watchers) {
          watcher.stop();
        }
        this.watchers = [];
      }

      // Validate and rename config files before reload
      const currentConfigDir = this.configDir || path.resolve("./config");
      try {
        const { ConfigIO } = await import("./config/import-export");
        await ConfigIO.validateAndRenameConfigFiles(currentConfigDir);
      } catch (e) {
        // Non-critical - continue with reload even if validation fails
        if (this.config?.global?.debug) {
          console.error("Config validation failed (non-critical):", e);
        }
      }

      // Clear Bun's module cache to ensure fresh imports
      // Note: Cache busting via query params (?t=timestamp) also helps
      if (this.config?.global?.debug) {
        console.log("Clearing module cache for reload...");
      }

      const loaded = await ConfigLoader.load(this.configPath);
      this.config = loaded.config;
      this.clientConfigs = loaded.clients;
      this.serverConfigs = loaded.servers;
      this.eventConfigs = loaded.events;
      this.sinkConfigs = loaded.sinks;

      // Update absolute config directory path
      const actualPath = this.configPath || (await ConfigLoader.findConfigFile());
      let configDir = this.config.global.configDirectory || path.dirname(actualPath);
      if (!path.isAbsolute(configDir)) {
        configDir = path.resolve(path.dirname(actualPath), configDir);
      }
      this.configDir = configDir;

      // Reinitialize clients (tear down removed, add new, keep unchanged if ids match)
      const newClientIds = new Set(this.clientConfigs.filter((c) => c.enabled).map((c) => c.id));
      for (const [id, adapter] of [...this.clients.entries()]) {
        if (!newClientIds.has(id)) {
          try {
            await adapter.destroy();
          } catch {}
          this.clients.delete(id);
        }
      }
      for (const cfg of this.clientConfigs) {
        if (!cfg.enabled) continue;
        if (!this.clients.has(cfg.id)) {
          try {
            const adapter = new GenericClientAdapter(cfg, this.config.global.debug || false);
            await adapter.initialize();
            this.clients.set(cfg.id, adapter);
          } catch (e) {
            console.error(`Failed to initialize client during reload: ${cfg.id}`, e);
          }
        }
      }

      // Reinitialize sinks similarly
      const newSinkIds = new Set(this.sinkConfigs.filter((s) => s.enabled).map((s) => s.id));
      for (const [id, sink] of [...this.sinks.entries()]) {
        if (!newSinkIds.has(id)) {
          try {
            await sink.destroy();
          } catch {}
          this.sinks.delete(id);
        }
      }
      for (const cfg of this.sinkConfigs) {
        if (!cfg.enabled) continue;
        if (!this.sinks.has(cfg.id)) {
          try {
            const sink = SinkFactory.create(cfg, this.config.global.debug || false);
            await sink.initialize();
            this.sinks.set(cfg.id, sink);
          } catch (e) {
            console.error(`Failed to initialize sink during reload: ${cfg.id}`, e);
          }
        }
      }

      if (!this.eventProcessor) {
        this.eventProcessor = new EventProcessor(
          this.eventConfigs,
          this.serverConfigs,
          this.config.global.debug || false,
        );
      } else {
        this.eventProcessor.updateEvents(this.eventConfigs);
        this.eventProcessor.updateServers(this.serverConfigs);
      }

      // Restart watchers if previously running
      if (wasRunning) {
        for (const [clientId, adapter] of this.clients) {
          const savedPositions = this.watcherPositions.get(clientId);
          const watcher = new LogWatcher(
            adapter,
            (context) => this.handleMessage(context),
            this.config.global.debug || false,
            false,
            savedPositions, // Restore previous positions
          );
          await watcher.start();
          this.watchers.push(watcher);
        }
      }

      console.log("Configuration fully reloaded");
    } catch (error) {
      console.error("Failed to reload configuration:", error);
    } finally {
      this.reloading = false;
    }
  }

  /**
   * Public full reload API
   */
  async reloadFull(): Promise<{ clients: number; sinks: number; events: number; servers: number }> {
    await this.reload();
    return {
      clients: this.clients.size,
      sinks: this.sinks.size,
      events: this.eventConfigs.filter((e) => e.enabled).length,
      servers: this.serverConfigs.filter((s) => s.enabled).length,
    };
  }

  /** Get currently loaded config directory path (absolute) */
  getConfigDirectory(): string {
    return this.configDir || path.resolve("./config");
  }

  /**
   * Stop the notification system
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    console.log("Stopping IRC Notification System...");
    this.running = false;

    // Stop API server if running
    if (this.apiServer) {
      await this.apiServer.stop();
      this.apiServer = undefined;
      console.log("API server stopped");
    }

    // Stop all watchers
    for (const watcher of this.watchers) {
      watcher.stop();
    }
    this.watchers = [];

    // Cleanup clients
    for (const [clientId, adapter] of this.clients) {
      await adapter.destroy();
    }
    this.clients.clear();

    // Cleanup sinks
    for (const [sinkId, sink] of this.sinks) {
      await sink.destroy();
    }
    this.sinks.clear();

    console.log("System stopped");
  }

  /**
   * Get system status
   */
  getStatus(): {
    running: boolean;
    reloading: boolean;
    clients: {
      total: number;
      enabled: number;
      list: Array<{ id: string; enabled: boolean; type: string }>;
    };
    servers: {
      total: number;
      enabled: number;
      list: Array<{ id: string; enabled: boolean; displayName: string }>;
    };
    sinks: {
      total: number;
      enabled: number;
      list: Array<{ id: string; enabled: boolean; type: string }>;
    };
    events: {
      total: number;
      enabled: number;
      list: Array<{
        id: string;
        enabled: boolean;
        serverIds: string[];
        sinkIds: string[];
        baseEvent: EventConfig["baseEvent"];
        priority?: number;
      }>;
    };
    watchers: number;
    configPath?: string;
    configDirectory: string;
  } {
    return {
      running: this.running,
      reloading: this.reloading,
      clients: {
        total: this.clientConfigs.length,
        enabled: this.clientConfigs.filter((c) => c.enabled).length,
        list: this.clientConfigs.map((c) => ({
          id: c.id,
          enabled: c.enabled,
          type: c.type || c.id,
        })),
      },
      servers: {
        total: this.serverConfigs.length,
        enabled: this.serverConfigs.filter((s) => s.enabled).length,
        list: this.serverConfigs.map((s) => ({
          id: s.id,
          enabled: s.enabled,
          displayName: s.displayName,
        })),
      },
      sinks: {
        total: this.sinkConfigs.length,
        enabled: this.sinkConfigs.filter((s) => s.enabled).length,
        list: this.sinkConfigs.map((s) => ({
          id: s.id,
          enabled: s.enabled,
          type: s.type,
        })),
      },
      events: {
        total: this.eventConfigs.length,
        enabled: this.eventConfigs.filter((e) => e.enabled).length,
        list: this.eventConfigs.map((e) => ({
          id: e.id,
          enabled: e.enabled,
          serverIds: e.serverIds,
          sinkIds: e.sinkIds,
          baseEvent: e.baseEvent,
          priority: e.priority,
        })),
      },
      watchers: this.watchers.length,
      configPath: this.configPath,
      configDirectory: this.configDir,
    };
  }
}

/**
 * Main entry point
 */
async function main() {
  // Use CONFIG_PATH env var if provided, otherwise use standard resolution
  const configPath = process.env.CONFIG_PATH;

  console.log("═══════════════════════════════════════════════════");
  console.log("  IRC Notification System");
  console.log("  Highly extensible IRC monitoring and alerting");
  console.log("═══════════════════════════════════════════════════");
  console.log();

  const orchestrator = new IRCNotifyOrchestrator(configPath);

  try {
    await orchestrator.initialize();
    await orchestrator.start();

    // Start API server if enabled in config or via environment variables
    const apiConfig = orchestrator.getConfig().api;
    const enableApi =
      apiConfig?.enabled || process.env.ENABLE_API === "true" || process.env.API_PORT !== undefined;

    if (enableApi) {
      console.log();
      console.log("Starting Config API server...");
      await orchestrator.startApi({
        port: process.env.API_PORT ? Number(process.env.API_PORT) : apiConfig?.port,
        host: process.env.API_HOST || apiConfig?.host,
        authToken: process.env.API_TOKEN || apiConfig?.authToken,
        enableFileOps:
          process.env.API_ENABLE_FILE_OPS !== "false" && (apiConfig?.enableFileOps ?? true),
      });
    }

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      console.log("\nReceived SIGINT, shutting down...");
      await orchestrator.stop();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      console.log("\nReceived SIGTERM, shutting down...");
      await orchestrator.stop();
      process.exit(0);
    });

    // Keep process alive
    await new Promise(() => {});
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

// Run if this is the main module
if (import.meta.main) {
  main();
}
