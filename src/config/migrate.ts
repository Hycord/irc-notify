/**
 * Migration utilities for converting JSON configs to TypeScript
 */

import * as fs from "fs";
import * as path from "path";

/**
 * Options for migration
 */
export interface MigrateOptions {
  /** Config directory to migrate (default: ./config) */
  configDir?: string;
}

/**
 * Result of a migration operation
 */
export interface MigrateResult {
  /** Number of files converted */
  converted: number;
  /** Number of files skipped */
  skipped: number;
  /** Number of files that failed */
  failed: number;
}

/**
 * Migrate JSON configs to TypeScript
 */
export async function migrateToTypeScript(options: MigrateOptions = {}): Promise<MigrateResult> {
  const { configDir = "./config" } = options;

  const categoryMap = {
    clients: "defineClient",
    servers: "defineServer",
    events: "defineEvent",
    sinks: "defineSink",
  };

  function convertJsonToTs(jsonPath: string, category: keyof typeof categoryMap): boolean {
    const tsPath = jsonPath.replace(".json", ".ts");

    // Skip if .ts already exists
    if (fs.existsSync(tsPath)) {
      console.log(`⏭️  Skipping ${path.basename(jsonPath)} (already has .ts version)`);
      return false;
    }

    try {
      // Read JSON
      const content = fs.readFileSync(jsonPath, "utf-8");
      const config = JSON.parse(content);

      // Generate TS content
      const defineFunc = categoryMap[category];
      const tsContent = `export default ${defineFunc}(${JSON.stringify(config, null, 2)});\n`;

      // Write TS file
      fs.writeFileSync(tsPath, tsContent);

      // Delete JSON file
      fs.unlinkSync(jsonPath);

      console.log(`✅ Converted ${path.basename(jsonPath)} -> ${path.basename(tsPath)}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to convert ${jsonPath}:`, (error as Error).message);
      return false;
    }
  }

  function convertMainConfigToTs(jsonPath: string): boolean {
    const tsPath = jsonPath.replace(".json", ".ts");

    // Skip if .ts already exists
    if (fs.existsSync(tsPath)) {
      console.log(`⏭️  Skipping ${path.basename(jsonPath)} (already has .ts version)`);
      return false;
    }

    try {
      // Read JSON
      const content = fs.readFileSync(jsonPath, "utf-8");
      const config = JSON.parse(content);

      // Determine import path based on location
      const isInConfigDir = jsonPath.includes("config/config.json");
      const importPath = isInConfigDir ? "../src/config/types" : "./src/config/types";

      // Generate TS content with proper import
      const tsContent = `import { defineConfig } from '${importPath}';\n\nexport default defineConfig(${JSON.stringify(config, null, 2)});\n`;

      // Write TS file
      fs.writeFileSync(tsPath, tsContent);

      // Delete JSON file
      fs.unlinkSync(jsonPath);

      console.log(`✅ Converted ${path.basename(jsonPath)} -> ${path.basename(tsPath)}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to convert ${jsonPath}:`, (error as Error).message);
      return false;
    }
  }

  console.log("🔄 Converting JSON configs to TypeScript...\n");

  let converted = 0;
  let skipped = 0;
  let failed = 0;

  // Process main config files (root level and config/ directory)
  console.log("\n📄 Main Config Files");
  const mainConfigCandidates = ["config.json", "config/config.json"];

  for (const candidate of mainConfigCandidates) {
    if (fs.existsSync(candidate)) {
      try {
        const result = convertMainConfigToTs(candidate);
        if (result) {
          converted++;
        } else {
          skipped++;
        }
      } catch (error) {
        failed++;
        console.error(`❌ Error processing ${candidate}:`, error);
      }
    }
  }

  // Process each category
  for (const [category, _] of Object.entries(categoryMap)) {
    const categoryDir = path.join(configDir, category);

    if (!fs.existsSync(categoryDir)) {
      continue;
    }

    console.log(`\n📁 ${category}/`);

    const files = fs.readdirSync(categoryDir).filter((f) => f.endsWith(".json"));

    if (files.length === 0) {
      console.log("  No JSON files found");
      continue;
    }

    for (const file of files) {
      const jsonPath = path.join(categoryDir, file);
      try {
        const result = convertJsonToTs(jsonPath, category as keyof typeof categoryMap);

        if (result) {
          converted++;
        } else {
          skipped++;
        }
      } catch (error) {
        failed++;
        console.error(`❌ Error processing ${file}:`, error);
      }
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log(`✨ Converted: ${converted}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
  }
  console.log("=".repeat(50));

  if (converted > 0) {
    console.log('\n💡 Tip: Run "bun src/cli.ts validate" to verify your configs');
  }

  return { converted, skipped, failed };
}
