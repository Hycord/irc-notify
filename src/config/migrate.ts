/**
 * Migration utilities for converting between JSON and TypeScript configs
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
 * @deprecated This function is no longer supported. Configs are stored as JSON only.
 * Use migrateToJson() to convert TypeScript configs to JSON.
 */
export async function migrateToTypeScript(options: MigrateOptions = {}): Promise<MigrateResult> {
  console.error("❌ Error: TypeScript config migration is no longer supported.");
  console.error("   All configs are now stored as JSON only.");
  console.error("   Use 'migrate:json' to convert TypeScript configs to JSON.");
  return { converted: 0, skipped: 0, failed: 0 };
}

/**
 * Migrate TypeScript configs to JSON (reverse migration)
 */
export async function migrateToJson(options: MigrateOptions = {}): Promise<MigrateResult> {
  const { configDir = "./config" } = options;

  const categories = ["clients", "servers", "events", "sinks"];

  async function convertTsToJson(tsPath: string): Promise<boolean> {
    const jsonPath = tsPath.replace(".ts", ".json");

    // Skip if .json already exists
    if (fs.existsSync(jsonPath)) {
      console.log(`⏭️  Skipping ${path.basename(tsPath)} (already has .json version)`);
      return false;
    }

    try {
      // Read the TS file
      const content = fs.readFileSync(tsPath, "utf-8");

      // Extract the JSON object from defineX(...) wrapper
      // Pattern: export default defineX({...}); or export default defineX(...)
      const match = content.match(/export\s+default\s+define\w+\s*\(\s*(\{[\s\S]*\})\s*\)/);

      if (!match) {
        throw new Error("Could not extract config object from TypeScript file");
      }

      // Parse the extracted JSON
      const config = eval(`(${match[1]})`);

      // Write JSON file
      fs.writeFileSync(jsonPath, JSON.stringify(config, null, 2) + "\n");

      // Delete TS file
      fs.unlinkSync(tsPath);

      console.log(`✅ Converted ${path.basename(tsPath)} -> ${path.basename(jsonPath)}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to convert ${tsPath}:`, (error as Error).message);
      return false;
    }
  }

  async function convertMainConfigTsToJson(tsPath: string): Promise<boolean> {
    const jsonPath = tsPath.replace(".ts", ".json");

    // Skip if .json already exists
    if (fs.existsSync(jsonPath)) {
      console.log(`⏭️  Skipping ${path.basename(tsPath)} (already has .json version)`);
      return false;
    }

    try {
      // Read the TS file
      const content = fs.readFileSync(tsPath, "utf-8");

      // Extract the JSON object from defineConfig(...) wrapper
      const match = content.match(/export\s+default\s+defineConfig\s*\(\s*(\{[\s\S]*\})\s*\)/);

      if (!match) {
        throw new Error("Could not extract config object from TypeScript file");
      }

      // Parse the extracted JSON
      const config = eval(`(${match[1]})`);

      // Write JSON file
      fs.writeFileSync(jsonPath, JSON.stringify(config, null, 2) + "\n");

      // Delete TS file
      fs.unlinkSync(tsPath);

      console.log(`✅ Converted ${path.basename(tsPath)} -> ${path.basename(jsonPath)}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to convert ${tsPath}:`, (error as Error).message);
      return false;
    }
  }

  console.log("🔄 Converting TypeScript configs to JSON...\n");

  let converted = 0;
  let skipped = 0;
  let failed = 0;

  // Process main config files (root level and config/ directory)
  console.log("\n📄 Main Config Files");
  const mainConfigCandidates = ["config.ts", "config/config.ts"];

  for (const candidate of mainConfigCandidates) {
    if (fs.existsSync(candidate)) {
      try {
        const result = await convertMainConfigTsToJson(candidate);
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
  for (const category of categories) {
    const categoryDir = path.join(configDir, category);

    if (!fs.existsSync(categoryDir)) {
      continue;
    }

    console.log(`\n📁 ${category}/`);

    const files = fs.readdirSync(categoryDir).filter((f) => f.endsWith(".ts"));

    if (files.length === 0) {
      console.log("  No TypeScript files found");
      continue;
    }

    for (const file of files) {
      const tsPath = path.join(categoryDir, file);
      try {
        const result = await convertTsToJson(tsPath);

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
