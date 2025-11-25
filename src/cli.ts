#!/usr/bin/env bun
/**
 * CLI for IRC Notify configuration management
 */

import { ConfigIO } from "./config/import-export";
import { ConfigLoader } from "./config/loader";
import { migrateToTypeScript } from "./config/migrate";
import { cleanupDevData, generateDevData } from "./dev";

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

/**
 * Show usage information
 */
function showUsage() {
  console.log(`
IRC Notify Configuration CLI

Usage:
  bun src/cli.ts <command> [options]

Commands:
  export              Export all configs to JSON bundle
    -o, --output      Output file path (default: config-export-<date>.json.gz)
    -c, --config      Config file to export from (default: auto-detect)

  import              Import configs from JSON bundle (replace mode)
    -i, --input       Input file path (required)
    -t, --target      Target directory (default: auto-detect from existing config)
    --overwrite       Overwrite existing files
    --adjust-path     Adjust configDirectory to match existing config (default: true)
    --reload          Reload configuration after import

  merge               Merge configs from JSON bundle
    -i, --input       Input file path (required)
    -t, --target      Target directory (default: auto-detect)
    --overwrite       Prefer incoming over existing (default: prefer existing)

  validate            Validate configuration
    -c, --config      Config file to validate (default: auto-detect)

  migrate             Migrate JSON configs to TypeScript
    -d, --dir         Config directory (default: ./config)

  gen-dev             Generate development test data
    -n, --num         Number of messages to generate (default: 400)

  cleanup-dev         Remove all development test data

Examples:
  bun src/cli.ts export -o backup.json.gz
  bun src/cli.ts import -i backup.json.gz
  bun src/cli.ts import -i backup.json.gz --reload
  bun src/cli.ts merge -i new-config.json.gz --overwrite
  bun src/cli.ts validate
  bun src/cli.ts migrate
  bun src/cli.ts gen-dev -n 500
  bun src/cli.ts cleanup-dev
`);
}

/**
 * Parse command line options
 */
function parseOptions(args: string[]): Record<string, string | boolean> {
  const options: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];

      if (nextArg && !nextArg.startsWith("-")) {
        options[key] = nextArg;
        i++;
      } else {
        options[key] = true;
      }
    } else if (arg.startsWith("-")) {
      const key = arg.slice(1);
      const nextArg = args[i + 1];

      if (nextArg && !nextArg.startsWith("-")) {
        options[key] = nextArg;
        i++;
      } else {
        options[key] = true;
      }
    }
  }

  return options;
}

/**
 * Main CLI entry point
 */
async function main() {
  if (!command || command === "help" || command === "--help" || command === "-h") {
    showUsage();
    process.exit(0);
  }

  const options = parseOptions(args.slice(1));

  try {
    switch (command) {
      case "export": {
        const outputPath =
          ((options.o || options.output) as string) ||
          `config-export-${new Date().toISOString().split("T")[0]}.json.gz`;
        const configPath = (options.c || options.config) as string | undefined;

        await ConfigIO.exportConfigWithOptions({ outputPath, configPath });
        break;
      }

      case "import": {
        const inputPath = (options.i || options.input) as string;
        const targetDir = (options.t || options.target) as string | undefined;
        const overwrite = !!options.overwrite;
        const adjustConfigPath = options["adjust-path"] !== false;
        const reloadConfig = !!options.reload;

        if (!inputPath) {
          console.error("Error: --input is required for import command");
          process.exit(1);
        }

        const result = await ConfigIO.importConfigWithOptions({
          inputPath,
          targetDir,
          overwrite,
          adjustConfigPath,
          reloadConfig,
        });

        console.log(`\n✓ Import completed successfully`);
        console.log(`  Target directory: ${result.targetDir}`);
        if (result.mainConfigPath) {
          console.log(`  Main config: ${result.mainConfigPath}`);
        }
        break;
      }

      case "merge": {
        const inputPath = (options.i || options.input) as string;
        const targetDir = (options.t || options.target) as string | undefined;
        const preferIncoming = !!options.overwrite;

        if (!inputPath) {
          console.error("Error: --input is required for merge command");
          process.exit(1);
        }

        const result = await ConfigIO.mergeConfigWithOptions({
          inputPath,
          targetDir,
          preferIncoming,
        });

        console.log(`\n✓ Merge completed successfully`);
        console.log(`  Target directory: ${result.targetDir}`);
        break;
      }

      case "validate": {
        const configPath = (options.c || options.config) as string | undefined;

        console.log("Validating configuration...");

        // Ensure config directories exist
        const fs = await import("fs");
        const configDir = "./config";
        const categories = ["clients", "servers", "events", "sinks"];

        if (!fs.existsSync(configDir)) {
          fs.mkdirSync(configDir, { recursive: true });
          console.log(`Created config directory: ${configDir}`);
        }

        for (const category of categories) {
          const categoryDir = `${configDir}/${category}`;
          if (!fs.existsSync(categoryDir)) {
            fs.mkdirSync(categoryDir, { recursive: true });
            console.log(`Created subdirectory: ${categoryDir}`);
          }
        }

        const loaded = await ConfigLoader.load(configPath);

        console.log("✓ Configuration loaded successfully");
        console.log(`  - ${loaded.clients.length} clients`);
        console.log(`  - ${loaded.servers.length} servers`);
        console.log(`  - ${loaded.events.length} events`);
        console.log(`  - ${loaded.sinks.length} sinks`);

        // Validation already happens during load
        console.log("✓ All validations passed");
        break;
      }

      case "migrate": {
        const configDir = ((options.d || options.dir) as string) || "./config";
        await migrateToTypeScript({ configDir });
        break;
      }

      case "gen-dev": {
        const numMessages = parseInt(((options.n || options.num) as string) || "400");
        await generateDevData({ numMessages });
        break;
      }

      case "cleanup-dev": {
        await cleanupDevData();
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        showUsage();
        process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

// Run if this is the main module
if (import.meta.main) {
  main();
}
