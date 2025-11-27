import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { ConfigIO } from "../../src/config/import-export";

const TEST_DIR = path.join(__dirname, "../tmp/import-export-test");

describe("ConfigIO Import/Export", () => {
  beforeEach(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("exports configuration to compressed bundle", async () => {
    // Create minimal config
    fs.mkdirSync(path.join(TEST_DIR, "clients"), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, "sinks"), { recursive: true });

    fs.writeFileSync(
      path.join(TEST_DIR, "config.json"),
      JSON.stringify({
        global: { debug: false },
        configDirectory: TEST_DIR,
      }),
    );

    fs.writeFileSync(
      path.join(TEST_DIR, "clients", "test.json"),
      JSON.stringify({ id: "test", enabled: true }),
    );

    const exportPath = path.join(TEST_DIR, "export.json.gz");
    await ConfigIO.exportConfigWithOptions({
      outputPath: exportPath,
      configPath: path.join(TEST_DIR, "config.json"),
    });

    expect(fs.existsSync(exportPath)).toBe(true);
    const stats = fs.statSync(exportPath);
    expect(stats.size).toBeGreaterThan(0);
  });

  it("imports configuration from bundle", async () => {
    // Create export bundle
    const sourceDir = path.join(TEST_DIR, "source");
    const targetDir = path.join(TEST_DIR, "target");

    fs.mkdirSync(path.join(sourceDir, "clients"), { recursive: true });
    fs.mkdirSync(targetDir, { recursive: true });

    fs.writeFileSync(
      path.join(sourceDir, "config.json"),
      JSON.stringify({
        global: { debug: false },
        configDirectory: sourceDir,
      }),
    );

    fs.writeFileSync(
      path.join(sourceDir, "clients", "imported.json"),
      JSON.stringify({ id: "imported", name: "Imported", enabled: true }),
    );

    const exportPath = path.join(TEST_DIR, "bundle.json.gz");
    await ConfigIO.exportConfigWithOptions({
      outputPath: exportPath,
      configPath: path.join(sourceDir, "config.json"),
    });

    // Import to target
    fs.writeFileSync(
      path.join(targetDir, "config.json"),
      JSON.stringify({
        global: { debug: false },
        configDirectory: targetDir,
      }),
    );

    await ConfigIO.importConfigWithOptions({
      inputPath: exportPath,
      targetDir,
      overwrite: true,
      adjustConfigPath: true,
    });

    // Check imported files
    expect(fs.existsSync(path.join(targetDir, "clients", "imported.json"))).toBe(true);
  });

  it("merges configurations without overwriting", async () => {
    const sourceDir = path.join(TEST_DIR, "source");
    const targetDir = path.join(TEST_DIR, "target");

    fs.mkdirSync(path.join(sourceDir, "clients"), { recursive: true });
    fs.mkdirSync(path.join(targetDir, "clients"), { recursive: true });

    fs.writeFileSync(
      path.join(sourceDir, "config.json"),
      JSON.stringify({ global: { debug: false }, configDirectory: sourceDir }),
    );

    fs.writeFileSync(
      path.join(targetDir, "config.json"),
      JSON.stringify({ global: { debug: true }, configDirectory: targetDir }),
    );

    // Source has new client
    fs.writeFileSync(
      path.join(sourceDir, "clients", "new.json"),
      JSON.stringify({ id: "new", enabled: true }),
    );

    // Target has existing client with same ID
    fs.writeFileSync(
      path.join(targetDir, "clients", "new.json"),
      JSON.stringify({ id: "new", enabled: false }),
    );

    const exportPath = path.join(TEST_DIR, "merge-bundle.json.gz");
    await ConfigIO.exportConfigWithOptions({
      outputPath: exportPath,
      configPath: path.join(sourceDir, "config.json"),
    });

    await ConfigIO.mergeConfigWithOptions({
      inputPath: exportPath,
      targetDir,
      preferIncoming: false,
    });

    // Existing file should not be overwritten
    const content = JSON.parse(
      fs.readFileSync(path.join(targetDir, "clients", "new.json"), "utf-8"),
    );
    expect(content.enabled).toBe(false);
  });

  it("writes and deletes config files", () => {
    const filePath = path.join(TEST_DIR, "test-config");
    const content = JSON.stringify({ id: "test", enabled: true });

    // Write
    const result = ConfigIO.writeConfigFile(filePath, content, "clients");
    expect(result.uploadFormat).toBe("json");
    expect(fs.existsSync(filePath + ".json")).toBe(true);

    // Delete
    const deleted = ConfigIO.deleteConfigFile(filePath);
    expect(deleted).toBe(true);
    expect(fs.existsSync(filePath + ".json")).toBe(false);
  });
});
