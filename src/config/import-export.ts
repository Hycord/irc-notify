import * as fs from "fs";
import * as path from "path";
import { Readable } from "stream";
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
  /** If true, wipe existing config set before importing */
  replace?: boolean;
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
      "config/config.json", // Primary location
      "config.json", // Legacy root location
      "config.dev.json",
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return path.resolve(candidate);
      }
    }

    // Note: ConfigLoader.findConfigFile() handles the config.default.json fallback
    throw new Error("No configuration file found. Looked for: " + candidates.join(", "));
  }

  /**
   * Check and rename config files if their ID doesn't match the filename
   * Also removes duplicate files with the same ID
   * @param configDir - The base config directory
   */
  static async validateAndRenameConfigFiles(configDir: string): Promise<void> {
    const categories = ["clients", "servers", "events", "sinks"];
    let renamed = 0;
    let deleted = 0;

    for (const category of categories) {
      const categoryDir = path.join(configDir, category);

      if (!fs.existsSync(categoryDir)) {
        continue;
      }

      const files = fs.readdirSync(categoryDir).filter((f) => f.endsWith(".json"));
      const seenIds = new Map<string, string>(); // id -> filename

      for (const file of files) {
        const filePath = path.join(categoryDir, file);
        const expectedFilename = path.basename(file, ".json");

        try {
          const content = fs.readFileSync(filePath, "utf-8");
          const config = JSON.parse(content);

          if (!config.id) {
            continue;
          }

          // Check if we've already seen this ID
          const existingFile = seenIds.get(config.id);
          if (existingFile) {
            // Duplicate ID found - delete this file if it's not the correctly named one
            if (expectedFilename !== config.id) {
              fs.unlinkSync(filePath);
              console.log(
                `  🗑️  Deleted duplicate ${category}/${file} (ID already exists in ${existingFile})`,
              );
              deleted++;
              continue;
            } else {
              // This file has the correct name, delete the other one
              const existingPath = path.join(categoryDir, existingFile);
              fs.unlinkSync(existingPath);
              console.log(
                `  🗑️  Deleted duplicate ${category}/${existingFile} (keeping correctly named ${file})`,
              );
              deleted++;
              seenIds.set(config.id, file);
              continue;
            }
          }

          // Check if ID exists and doesn't match filename
          if (config.id !== expectedFilename) {
            const newFilePath = path.join(categoryDir, `${config.id}.json`);

            // Check if target file already exists
            if (fs.existsSync(newFilePath)) {
              // Read the existing file to compare
              const existingContent = fs.readFileSync(newFilePath, "utf-8");
              const existingConfig = JSON.parse(existingContent);

              if (existingConfig.id === config.id) {
                // Delete the old incorrectly named file
                fs.unlinkSync(filePath);
                console.log(
                  `  🗑️  Deleted ${category}/${file} (correctly named version exists as ${config.id}.json)`,
                );
                deleted++;
                seenIds.set(config.id, `${config.id}.json`);
                continue;
              }
            }

            // Rename the file (this automatically deletes the old file)
            fs.renameSync(filePath, newFilePath);
            console.log(`  ✓ Renamed ${category}/${file} → ${config.id}.json`);
            renamed++;
            seenIds.set(config.id, `${config.id}.json`);
          } else {
            seenIds.set(config.id, file);
          }
        } catch (error) {
          console.error(`Failed to validate config ${filePath}:`, error);
        }
      }
    }

    if (renamed > 0 || deleted > 0) {
      const actions = [];
      if (renamed > 0) actions.push(`renamed ${renamed}`);
      if (deleted > 0) actions.push(`deleted ${deleted} duplicate(s)`);
      console.log(`\n✓ Config file cleanup: ${actions.join(", ")}`);
    }
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
      if (!file.endsWith(".json")) {
        continue;
      }
      // Never export auth token file
      if (file === "auth_token.txt") {
        continue;
      }

      const filePath = path.join(categoryDir, file);

      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const config: T = JSON.parse(content);

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
   * Exports ALL configs found in directories, including disabled ones
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

    const content = fs.readFileSync(absoluteConfigPath, "utf-8");
    mainConfig = JSON.parse(content);

    // Determine the actual config directory
    const actualConfigDir = mainConfig.global?.configDirectory
      ? path.isAbsolute(mainConfig.global.configDirectory)
        ? mainConfig.global.configDirectory
        : path.resolve(configDir, mainConfig.global.configDirectory)
      : configDir;

    // Validate and rename config files before export
    console.log("Validating config file names...");
    await this.validateAndRenameConfigFiles(actualConfigDir);

    // Discover ALL configs in each category
    console.log("Discovering all configuration files...");
    const allClients = await this.discoverAllConfigs<ClientConfig>("clients", actualConfigDir);
    const allServers = await this.discoverAllConfigs<ServerConfig>("servers", actualConfigDir);
    const allEvents = await this.discoverAllConfigs<EventConfig>("events", actualConfigDir);
    const allSinks = await this.discoverAllConfigs<SinkConfig>("sinks", actualConfigDir);

    // Count disabled configs for reporting
    const disabledClients = allClients.filter((c) => c.enabled === false).length;
    const disabledServers = allServers.filter((s) => s.enabled === false).length;
    const disabledEvents = allEvents.filter((e) => e.enabled === false).length;
    const disabledSinks = allSinks.filter((s) => s.enabled === false).length;

    console.log(`Found configs:`);
    console.log(`  - Clients: ${allClients.length} total (${disabledClients} disabled)`);
    console.log(`  - Servers: ${allServers.length} total (${disabledServers} disabled)`);
    console.log(`  - Events: ${allEvents.length} total (${disabledEvents} disabled)`);
    console.log(`  - Sinks: ${allSinks.length} total (${disabledSinks} disabled)`);

    // Update main config to reference all configs (including disabled)
    const exportConfig: IRCNotifyConfig = {
      ...mainConfig,
      clients: allClients.map((c) => c.id),
      servers: allServers.map((s) => s.id),
      events: allEvents.map((e) => e.id),
      sinks: allSinks.map((s) => s.id),
    };

    // Create export bundle
    const exportData: ConfigExport = {
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      metadata: {
        sourceConfigPath: absoluteConfigPath,
        sourceConfigDir: actualConfigDir,
        unpackConfigDir: "./config",
        unpackConfigPath: "./config.json",
      },
      config: exportConfig,
      clients: allClients,
      servers: allServers,
      events: allEvents,
      sinks: allSinks,
    };

    // Write to file
    const jsonContent = JSON.stringify(exportData, null, 2);

    if (outputPath.endsWith(".gz")) {
      // Write compressed
      const readStream = Readable.from(Buffer.from(jsonContent));
      const writeStream = fs.createWriteStream(outputPath);
      const gzipStream = createGzip();

      await pipeline(readStream, gzipStream, writeStream);

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

      const content = fs.readFileSync(absoluteConfigPath, "utf-8");
      mainConfig = JSON.parse(content);

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
      replace = false,
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

    // Always set configDirectory to '.' to prevent nested config/config
    let mainConfig = { ...exportData.config };
    if (!mainConfig.global) {
      mainConfig.global = {};
    }
    mainConfig.global.configDirectory = ".";
    console.log(`  Forced configDirectory to: . (config.json is inside config/ directory)`);

    // Create target directories
    const categories = ["clients", "servers", "events", "sinks"];
    for (const category of categories) {
      const categoryDir = path.join(targetDir, category);
      if (!fs.existsSync(categoryDir)) {
        fs.mkdirSync(categoryDir, { recursive: true });
      }
    }

    // If replace mode, wipe existing JSON config files before import
    if (replace) {
      console.log("\n🧹 Replace mode: wiping existing configuration files...");
      // Remove category JSON files (but keep non-JSON files like auth_token.txt)
      for (const category of categories) {
        const categoryDir = path.join(targetDir, category);
        if (fs.existsSync(categoryDir)) {
          for (const file of fs.readdirSync(categoryDir)) {
            if (file.endsWith(".json")) {
              const filePath = path.join(categoryDir, file);
              try {
                fs.unlinkSync(filePath);
                console.log(`  🗑️  Deleted ${category}/${file}`);
              } catch (err) {
                console.warn(`  ⚠️ Failed to delete ${category}/${file}:`, err);
              }
            }
          }
        }
      }
      // Remove main config.json in targetDir if present
      const existingMain = path.join(targetDir, "config.json");
      if (fs.existsSync(existingMain)) {
        try {
          fs.unlinkSync(existingMain);
          console.log("  🗑️  Deleted config.json");
        } catch (err) {
          console.warn("  ⚠️ Failed to delete config.json:", err);
        }
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

    // If the imported config is in config/config.json and there's a root config.json, remove it
    if (
      targetDir === "./config" ||
      targetDir === "config" ||
      path.basename(targetDir) === "config"
    ) {
      const rootConfigJson = path.join(process.cwd(), "config.json");

      // Remove root config.json if it exists and we're importing to config/
      if (fs.existsSync(rootConfigJson) && mainConfigPath !== rootConfigJson) {
        console.log(`  🗑️  Removing root config.json (using config/config.json instead)`);
        fs.unlinkSync(rootConfigJson);
      }
    }

    console.log(`\n✓ Import complete: ${imported} files written, ${skipped} skipped`);

    // Validate and rename config files if IDs don't match filenames
    console.log("\n🔍 Validating config file names...");
    await this.validateAndRenameConfigFiles(targetDir);

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

  /**
   * Read config file (JSON only)
   * @param filePath - Base file path (without extension)
   * @param category - Config category (clients, servers, events, sinks)
   * @param format - Requested output format (always "json")
   * @returns Promise with content and source format
   */
  static async readConfigFileAsync(
    filePath: string,
    category: string,
    format: "json" | "ts",
  ): Promise<{ content: string; sourceFormat: string }> {
    const jsonPath = filePath + ".json";

    if (!fs.existsSync(jsonPath)) {
      throw new Error("File not found");
    }

    const jsonContent = fs.readFileSync(jsonPath, "utf-8");
    return { content: jsonContent, sourceFormat: "json" };
  }

  /**
   * Write config file (JSON only)
   * @param filePath - Base file path (without extension)
   * @param content - Config content (JSON string)
   * @param category - Config category (clients, servers, events, sinks)
   * @returns Object with upload format and stored format
   */
  static writeConfigFile(
    filePath: string,
    content: string,
    category: string,
  ): { uploadFormat: string; storedFormat: string } {
    // Always store as JSON
    const targetPath = filePath + ".json";
    const tmpPath = targetPath + ".tmp";

    try {
      // Parse to validate
      JSON.parse(content);

      // Write to temp file
      fs.writeFileSync(tmpPath, content, "utf-8");

      // Move temp to final location
      fs.renameSync(tmpPath, targetPath);

      return {
        uploadFormat: "json",
        storedFormat: "json",
      };
    } catch (error) {
      // Clean up temp file on error
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
      throw error;
    }
  }

  /**
   * Delete config file (removes both .ts and .json versions if they exist)
   * @param filePath - Base file path (without extension)
   * @returns True if any files were deleted
   */
  static deleteConfigFile(filePath: string): boolean {
    const tsPath = filePath + ".ts";
    const jsonPath = filePath + ".json";
    let deleted = false;

    if (fs.existsSync(tsPath)) {
      fs.unlinkSync(tsPath);
      deleted = true;
    }
    if (fs.existsSync(jsonPath)) {
      fs.unlinkSync(jsonPath);
      deleted = true;
    }

    return deleted;
  }
}
