import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { ConfigLoader } from "../../src/config/loader";

const TEST_DIR = path.join(__dirname, "../tmp/config-loader-test");

describe("ConfigLoader", () => {
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

  it("loads configuration from directory", async () => {
    // Create minimal config structure
    fs.mkdirSync(path.join(TEST_DIR, "clients"), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, "servers"), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, "events"), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, "sinks"), { recursive: true });

    // Main config
    fs.writeFileSync(
      path.join(TEST_DIR, "config.json"),
      JSON.stringify({
        global: {
          debug: false,
          pollInterval: 1000,
          configDirectory: ".",
        },
      }),
    );

    // Client config
    fs.writeFileSync(
      path.join(TEST_DIR, "clients", "test-client.json"),
      JSON.stringify({
        id: "test-client",
        name: "Test Client",
        enabled: true,
        type: "textual",
        logDirectory: "./logs",
        discovery: {
          patterns: { channels: "**/*.txt" },
          pathExtraction: {
            serverPattern: "/([^/]+)/",
            serverGroup: 1,
          },
        },
        serverDiscovery: { type: "static" },
        fileType: { type: "text", pollInterval: 1000 },
        parserRules: [
          {
            name: "test",
            pattern: "^(.*)$",
            priority: 100,
            captures: { content: 1 },
          },
        ],
      }),
    );

    // Server config
    fs.writeFileSync(
      path.join(TEST_DIR, "servers", "test-server.json"),
      JSON.stringify({
        id: "test-server",
        hostname: "test.local",
        displayName: "Test",
        clientNickname: "bot",
        enabled: true,
      }),
    );

    // Event config
    fs.writeFileSync(
      path.join(TEST_DIR, "events", "test-event.json"),
      JSON.stringify({
        id: "test-event",
        name: "Test Event",
        enabled: true,
        baseEvent: "message",
        serverIds: ["*"],
        sinkIds: ["test-sink"],
      }),
    );

    // Sink config
    fs.writeFileSync(
      path.join(TEST_DIR, "sinks", "test-sink.json"),
      JSON.stringify({
        id: "test-sink",
        type: "console",
        name: "Test Sink",
        enabled: true,
        config: {},
      }),
    );

    const result = await ConfigLoader.load(path.join(TEST_DIR, "config.json"));

    expect(result.config.global.debug).toBe(false);
    expect(result.clients).toHaveLength(1);
    expect(result.clients[0].id).toBe("test-client");
    expect(result.servers).toHaveLength(1);
    expect(result.servers[0].id).toBe("test-server");
    expect(result.events).toHaveLength(1);
    expect(result.events[0].id).toBe("test-event");
    expect(result.sinks).toHaveLength(1);
    expect(result.sinks[0].id).toBe("test-sink");
  });

  it("prunes invalid cross-references without throwing", async () => {
    // Create config with invalid event reference
    fs.mkdirSync(path.join(TEST_DIR, "clients"), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, "servers"), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, "events"), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, "sinks"), { recursive: true });

    fs.writeFileSync(
      path.join(TEST_DIR, "config.json"),
      JSON.stringify({
        global: { debug: false, configDirectory: "." },
      }),
    );

    // Event references non-existent sink
    fs.writeFileSync(
      path.join(TEST_DIR, "events", "bad-event.json"),
      JSON.stringify({
        id: "bad-event",
        name: "Bad Event",
        enabled: true,
        baseEvent: "message",
        serverIds: ["*"],
        sinkIds: ["non-existent-sink"],
      }),
    );

    const result = await ConfigLoader.load(path.join(TEST_DIR, "config.json"));
    const badEvent = result.events.find((e) => e.id === "bad-event");
    expect(badEvent).toBeDefined();
    // SinkIds should be pruned to empty array
    expect(Array.isArray(badEvent!.sinkIds)).toBe(true);
    expect(badEvent!.sinkIds.length).toBe(0);
    // ServerIds preserved
    expect(badEvent!.serverIds).toEqual(["*"]);
  });

  it("auto-discovers config files", async () => {
    fs.mkdirSync(path.join(TEST_DIR, "clients"), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, "servers"), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, "events"), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, "sinks"), { recursive: true });

    fs.writeFileSync(
      path.join(TEST_DIR, "config.json"),
      JSON.stringify({
        global: { debug: false, configDirectory: "." },
      }),
    );

    // Create multiple client configs
    for (let i = 1; i <= 3; i++) {
      fs.writeFileSync(
        path.join(TEST_DIR, "clients", `client${i}.json`),
        JSON.stringify({
          id: `client${i}`,
          name: `Client ${i}`,
          enabled: true,
          type: "textual",
          logDirectory: "./logs",
          discovery: {
            patterns: { channels: "**/*.txt" },
            pathExtraction: {
              serverPattern: "/([^/]+)/",
              serverGroup: 1,
            },
          },
          serverDiscovery: { type: "static" },
          fileType: { type: "text", pollInterval: 1000 },
          parserRules: [
            {
              name: "test",
              pattern: "^(.*)$",
              priority: 100,
              captures: { content: 1 },
            },
          ],
        }),
      );
    }

    const result = await ConfigLoader.load(path.join(TEST_DIR, "config.json"));
    expect(result.clients).toHaveLength(3);
  });
});
