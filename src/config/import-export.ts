import * as fs from "fs";
import * as path from "path";
import { createGunzip, createGzip } from "zlib";
import { pipeline } from "stream/promises";
import { ClientConfig, EventConfig, IRCNotifyConfig, ServerConfig, SinkConfig } from "../types";
import { ConfigLoader } from "./loader";

/**
 * Export format for bundled configuration
 */
export interface ConfigExport {
  version: string;
  timestamp: string;
  metadata: {
    sourceConfigPath: string;
    sourceConfigDir: string;
    unpackConfigDir: string;
    unpackConfigPath: string;
  };
  config: IRCNotifyConfig;
  clients: ClientConfig[];
  servers: ServerConfig[];
  events: EventConfig[];
  sinks: SinkConfig[];
}

/**
 * Options for importing configuration
 */
export interface ImportOptions {
  /** Path to the import file */
  inputPath: string;
  /** Target directory for unpacking (default: auto-detect from existing config) */
  targetDir?: string;
  /** Whether to overwrite existing files */
  overwrite?: boolean;
  /** Whether to automatically adjust configDirectory path in main config */
  adjustConfigPath?: boolean;
  /** Whether to reload configuration after import */
  reloadConfig?: boolean;
}

/**
 * Options for exporting configuration
 */
export interface ExportOptions {
  /** Path for the output file */
  outputPath: string;
  /** Optional path to main config file (auto-detect if not provided) */
  configPath?: string;
}

/**
 * Options for merging configuration
 */
export interface MergeOptions extends ImportOptions {
  /** If true, incoming configs overwrite existing (default: prefer existing) */
  preferIncoming?: boolean;
}

/**
 * Result of an import operation
 */
export interface ImportResult {
  /** Number of files imported */
  imported: number;
  /** Number of files skipped */
  skipped: number;
  /** Target directory where files were imported */
  targetDir: string;
  /** Path to main config file (if created) */
  mainConfigPath?: string;
}

/**
 * Configuration import/export utilities
 */
export class ConfigIO {
  /**
   * Find main config file using standard resolution order
   * Prioritizes /config directory
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

    // Note: ConfigLoader.findConfigFile() handles the config.default.ts fallback
    throw new Error("No configuration file found. Looked for: " + candidates.join(", "));
  }

  /**
   * Discover ALL config files in a directory, regardless of whether they're referenced
   * @param category - The category directory (clients, servers, events, sinks)
   * @param configDir - The base config directory
   * @returns Array of config objects from all files found
   */
  private static async discoverAllConfigs<T extends { id: string; enabled?: boolean }>(
    category: string,
    configDir: string,
  ): Promise<T[]> {
    const categoryDir = path.join(configDir, category);

    if (!fs.existsSync(categoryDir)) {
      console.warn(`Category directory not found: ${categoryDir}`);
      return [];
    }

    const configs: T[] = [];
    const files = fs.readdirSync(categoryDir);

    for (const file of files) {
      // Skip non-config files and sensitive files
      if (!file.endsWith(".ts") && !file.endsWith(".json")) {
        continue;
      }
      // Never export auth token file
      if (file === "auth_token.txt") {
        continue;
      }

      const filePath = path.join(categoryDir, file);

      try {
        let config: T;

        if (file.endsWith(".ts")) {
          // Ensure globals are loaded before importing TS configs
          await ConfigLoader.ensureGlobalHelpers();

          const absolutePath = path.resolve(filePath);
          const fileUrl = `file://${absolutePath}`;
          const module = await import(fileUrl);
          config = module.default;
        } else {
          const content = fs.readFileSync(filePath, "utf-8");
          config = JSON.parse(content);
        }

        // Set ID from filename if not present
        if (!config.id) {
          config.id = path.basename(file).replace(/\.(ts|json)$/, "");
        }

        // Include ALL configs, even disabled ones
        // The filter happens during export based on enabled flag
        configs.push(config);
      } catch (error) {
        console.error(`Failed to load config ${filePath}:`, error);
      }
    }

    return configs;
  }

  /**
   * Export all configuration to a bundled JSON file (optionally compressed)
   * Exports ALL configs found in directories, excluding only those with enabled: false
   *
   * @param outputPath - Path for the output file (supports .json.gz or .json)
   * @param configPath - Optional path to main config file
   */
  static async exportConfig(outputPath: string, configPath?: string): Promise<void> {
    // Use standard resolution if no path provided
    if (!configPath) {
      configPath = await this.findConfigFile();
    }

    console.log(`Exporting configuration from ${configPath}...`);

    // Load main config
    const absoluteConfigPath = path.resolve(configPath);
    const configDir = path.dirname(absoluteConfigPath);

    let mainConfig: IRCNotifyConfig;

    if (configPath.endsWith(".ts")) {
      await ConfigLoader.ensureGlobalHelpers();
      const fileUrl = `file://${absoluteConfigPath}`;
      const module = await import(fileUrl);
      mainConfig = module.default;
    } else {
      const content = fs.readFileSync(absoluteConfigPath, "utf-8");
      mainConfig = JSON.parse(content);
    }

    // Determine the actual config directory
    const actualConfigDir = mainConfig.global?.configDirectory
      ? path.isAbsolute(mainConfig.global.configDirectory)
        ? mainConfig.global.configDirectory
        : path.resolve(configDir, mainConfig.global.configDirectory)
      : configDir;

    // Discover ALL configs in each category
    console.log("Discovering all configuration files...");
    const allClients = await this.discoverAllConfigs<ClientConfig>("clients", actualConfigDir);
    const allServers = await this.discoverAllConfigs<ServerConfig>("servers", actualConfigDir);
    const allEvents = await this.discoverAllConfigs<EventConfig>("events", actualConfigDir);
    const allSinks = await this.discoverAllConfigs<SinkConfig>("sinks", actualConfigDir);

    // Filter out ONLY configs with enabled: false
    const enabledClients = allClients.filter((c) => c.enabled !== false);
    const enabledServers = allServers.filter((s) => s.enabled !== false);
    const enabledEvents = allEvents.filter((e) => e.enabled !== false);
    const enabledSinks = allSinks.filter((s) => s.enabled !== false);

    console.log(`Found configs:`);
    console.log(
      `  - Clients: ${enabledClients.length} of ${allClients.length} (${allClients.length - enabledClients.length} disabled)`,
    );
    console.log(
      `  - Servers: ${enabledServers.length} of ${allServers.length} (${allServers.length - enabledServers.length} disabled)`,
    );
    console.log(
      `  - Events: ${enabledEvents.length} of ${allEvents.length} (${allEvents.length - enabledEvents.length} disabled)`,
    );
    console.log(
      `  - Sinks: ${enabledSinks.length} of ${allSinks.length} (${allSinks.length - enabledSinks.length} disabled)`,
    );

    // Update main config to reference all enabled configs
    const exportConfig: IRCNotifyConfig = {
      ...mainConfig,
      clients: enabledClients.map((c) => c.id),
      servers: enabledServers.map((s) => s.id),
      events: enabledEvents.map((e) => e.id),
      sinks: enabledSinks.map((s) => s.id),
    };

    // Create export bundle
    const exportData: ConfigExport = {
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      metadata: {
        sourceConfigPath: absoluteConfigPath,
        sourceConfigDir: actualConfigDir,
        unpackConfigDir: "./config",
        unpackConfigPath: "./config.ts",
      },
      config: exportConfig,
      clients: enabledClients,
      servers: enabledServers,
      events: enabledEvents,
      sinks: enabledSinks,
    };

    // Write to file
    const jsonContent = JSON.stringify(exportData, null, 2);

    if (outputPath.endsWith(".gz")) {
      // Write compressed
      const readStream = Buffer.from(jsonContent);
      const writeStream = fs.createWriteStream(outputPath);
      const gzipStream = createGzip();

      await pipeline(
        async function* () {
          yield readStream;
        },
        gzipStream,
        writeStream,
      );

      console.log(`✓ Exported configuration to ${outputPath} (compressed)`);
    } else {
      // Write uncompressed
      fs.writeFileSync(outputPath, jsonContent, "utf-8");
      console.log(`✓ Exported configuration to ${outputPath}`);
    }

    const stats = fs.statSync(outputPath);
    console.log(`  File size: ${(stats.size / 1024).toFixed(2)} KB`);
  }

  /**
   * Detect the target config directory from existing configuration
   */
  private static async detectTargetConfigDir(): Promise<string | null> {
    try {
      const configPath = await this.findConfigFile();
      const absoluteConfigPath = path.resolve(configPath);

      // Load main config to check for configDirectory setting
      let mainConfig: IRCNotifyConfig;

      if (configPath.endsWith(".ts")) {
        await ConfigLoader.ensureGlobalHelpers();
        const fileUrl = `file://${absoluteConfigPath}`;
        const module = await import(fileUrl);
        mainConfig = module.default;
      } else {
        const content = fs.readFileSync(absoluteConfigPath, "utf-8");
        mainConfig = JSON.parse(content);
      }

      // Get the config directory
      const configDir = path.dirname(absoluteConfigPath);
      const actualConfigDir = mainConfig.global?.configDirectory
        ? path.isAbsolute(mainConfig.global.configDirectory)
          ? mainConfig.global.configDirectory
          : path.resolve(configDir, mainConfig.global.configDirectory)
        : configDir;

      return actualConfigDir;
    } catch (error) {
      return null;
    }
  }

  /**
   * Import configuration from a bundled JSON file (with options)
   */
  static async importConfigWithOptions(options: ImportOptions): Promise<ImportResult> {
    const {
      inputPath,
      targetDir: providedTargetDir,
      overwrite = false,
      adjustConfigPath = true,
      reloadConfig = false,
    } = options;

    console.log(`Importing configuration from ${inputPath}...`);

    // Read and decompress if needed
    let jsonContent: string;

    if (inputPath.endsWith(".gz")) {
      const chunks: Buffer[] = [];
      const readStream = fs.createReadStream(inputPath);
      const gunzipStream = createGunzip();

      await pipeline(readStream, gunzipStream, async function* (source) {
        for await (const chunk of source) {
          chunks.push(chunk as Buffer);
        }
      });

      jsonContent = Buffer.concat(chunks).toString("utf-8");
    } else {
      jsonContent = fs.readFileSync(inputPath, "utf-8");
    }

    const exportData: ConfigExport = JSON.parse(jsonContent);

    console.log(`Import metadata:`);
    console.log(`  Version: ${exportData.version}`);
    console.log(`  Timestamp: ${exportData.timestamp}`);
    console.log(`  Source: ${exportData.metadata.sourceConfigPath}`);

    // Determine target directory
    let targetDir = providedTargetDir;
    if (!targetDir) {
      // Try to detect from existing config
      const detected = await this.detectTargetConfigDir();
      if (detected) {
        console.log(`  Detected existing config directory: ${detected}`);
        targetDir = detected;
      } else {
        // Use backup's recommendation
        targetDir = exportData.metadata.unpackConfigDir || "./config";
        console.log(`  Using backup's recommended directory: ${targetDir}`);
      }
    }

    // If adjustConfigPath is enabled and we have an existing config, update the backup's configDirectory
    let mainConfig = { ...exportData.config };
    if (adjustConfigPath) {
      const existingConfigDir = await this.detectTargetConfigDir();
      if (existingConfigDir) {
        // Adjust the configDirectory in the imported config to match existing
        if (!mainConfig.global) {
          mainConfig.global = {};
        }
        mainConfig.global.configDirectory =
          path.relative(path.dirname(targetDir), targetDir) || "./config";
        console.log(`  Adjusted configDirectory to: ${mainConfig.global.configDirectory}`);
      } else {
        // No existing config - determine based on where we're importing to
        if (!mainConfig.global) {
          mainConfig.global = {};
        }
        // If importing to config/ directory, the main config will be inside it
        // So configDirectory should be "." (current directory relative to config.json location)
        const normalizedTarget = path.normalize(targetDir);
        if (
          normalizedTarget === "config" ||
          normalizedTarget === "./config" ||
          path.basename(normalizedTarget) === "config"
        ) {
          mainConfig.global.configDirectory = ".";
          console.log(`  Set configDirectory to: . (config.json is inside config/ directory)`);
        } else {
          mainConfig.global.configDirectory = targetDir;
          console.log(`  Set configDirectory to: ${targetDir}`);
        }
      }
    }

    // Create target directories
    const categories = ["clients", "servers", "events", "sinks"];
    for (const category of categories) {
      const categoryDir = path.join(targetDir, category);
      if (!fs.existsSync(categoryDir)) {
        fs.mkdirSync(categoryDir, { recursive: true });
      }
    }

    let imported = 0;
    let skipped = 0;

    // Write configs
    for (const [category, configs] of [
      ["clients", exportData.clients],
      ["servers", exportData.servers],
      ["events", exportData.events],
      ["sinks", exportData.sinks],
    ] as const) {
      for (const config of configs) {
        const filePath = path.join(targetDir, category, `${config.id}.json`);

        if (fs.existsSync(filePath) && !overwrite) {
          console.log(`  ⊘ Skipped ${category}/${config.id}.json (already exists)`);
          skipped++;
          continue;
        }

        fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8");
        console.log(`  ✓ Wrote ${category}/${config.id}.json`);
        imported++;
      }
    }

    // Write main config
    const mainConfigPath = path.join(targetDir, "config.json");
    let finalMainConfigPath: string | undefined;

    if (fs.existsSync(mainConfigPath) && !overwrite) {
      console.log(`  ⊘ Skipped config.json (already exists)`);
      skipped++;
    } else {
      fs.writeFileSync(mainConfigPath, JSON.stringify(mainConfig, null, 2), "utf-8");
      console.log(`  ✓ Wrote config.json`);
      finalMainConfigPath = mainConfigPath;
      imported++;
    }

    // If the imported config is in config/config.json and there's a root config.ts, remove it
    if (
      targetDir === "./config" ||
      targetDir === "config" ||
      path.basename(targetDir) === "config"
    ) {
      const rootConfigTs = path.join(process.cwd(), "config.ts");
      const rootConfigJson = path.join(process.cwd(), "config.json");

      if (fs.existsSync(rootConfigTs)) {
        console.log(`  🗑️  Removing root config.ts (using config/config.json instead)`);
        fs.unlinkSync(rootConfigTs);
      }

      // Also remove root config.json if it exists and we're importing to config/
      if (fs.existsSync(rootConfigJson) && mainConfigPath !== rootConfigJson) {
        console.log(`  🗑️  Removing root config.json (using config/config.json instead)`);
        fs.unlinkSync(rootConfigJson);
      }
    }

    console.log(`\n✓ Import complete: ${imported} files written, ${skipped} skipped`);

    // Auto-migrate JSON configs to TypeScript after import
    console.log("\n🔄 Auto-migrating JSON configs to TypeScript...");
    try {
      const { migrateToTypeScript } = await import("./migrate");
      const migrateResult = await migrateToTypeScript({ configDir: targetDir });

      if (migrateResult.converted > 0) {
        console.log(`✓ Migrated ${migrateResult.converted} config(s) to TypeScript`);
      }
    } catch (error) {
      console.warn("⚠️  Auto-migration failed (non-critical):", error);
    }

    if (reloadConfig) {
      console.log("\n🔄 Reloading configuration...");
      try {
        await ConfigLoader.load(finalMainConfigPath);
        console.log("✓ Configuration reloaded successfully");
      } catch (error) {
        console.error("Failed to reload configuration:", error);
      }
    }

    return {
      imported,
      skipped,
      targetDir,
      mainConfigPath: finalMainConfigPath,
    };
  }

  /**
   * Import configuration from a bundled JSON file (legacy method)
   *
   * @param inputPath - Path to the input file (supports .json.gz or .json)
   * @param targetDir - Directory to unpack configs to (default: ./config)
   * @param overwrite - Whether to overwrite existing files
   */
  static async importConfig(
    inputPath: string,
    targetDir: string = "./config",
    overwrite: boolean = false,
  ): Promise<void> {
    await this.importConfigWithOptions({ inputPath, targetDir, overwrite });
  }

  /**
   * Merge configuration from a bundled JSON file (with options)
   */
  static async mergeConfigWithOptions(options: MergeOptions): Promise<ImportResult> {
    const { preferIncoming = false, ...importOpts } = options;

    console.log(`Merging configuration from ${options.inputPath}...`);
    console.log(`Mode: ${preferIncoming ? "Prefer incoming" : "Prefer existing"}`);

    return await this.importConfigWithOptions({
      ...importOpts,
      overwrite: preferIncoming,
    });
  }

  /**
   * Merge configuration from a bundled JSON file (legacy method)
   * By default, prefers existing configs on conflict
   *
   * @param inputPath - Path to the input file
   * @param targetDir - Directory to merge configs into
   * @param overwrite - If true, incoming configs overwrite existing ones
   */
  static async mergeConfig(
    inputPath: string,
    targetDir: string = "./config",
    overwrite: boolean = false,
  ): Promise<void> {
    await this.mergeConfigWithOptions({
      inputPath,
      targetDir,
      preferIncoming: overwrite,
    });
  }

  /**
   * Export configuration with options (unified interface)
   */
  static async exportConfigWithOptions(options: ExportOptions): Promise<void> {
    await this.exportConfig(options.outputPath, options.configPath);
  }
}
