import { describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { IRCNotifyOrchestrator } from "../../src/index";
import { SinkFactory } from "../../src/sinks/factory";
import { TestCaptureSink, buildTestSinkConfig } from "../../src/sinks/test-capture";

SinkFactory.register("custom", TestCaptureSink); // override custom sink for tests

const fixtureRoot = path.join(process.cwd(), "tests", "fixtures", "e2e");
const configDir = fixtureRoot;
const logsDir = path.join(fixtureRoot, "logs");
fs.mkdirSync(logsDir, { recursive: true });

const clientConfig = {
  id: "test-client",
  type: "textual",
  name: "Test Client",
  enabled: true,
  logDirectory: path.join(logsDir, "textual"),
  discovery: {
    patterns: { channels: "**/Channels/**/*.txt" },
    pathExtraction: {
      serverPattern: "/([^/]+)\\s+\\([^)]+\\)/",
      serverGroup: 1,
      channelPattern: "/Channels/([^/]+)/",
      channelGroup: 1,
      consolePattern: "/Console/",
    },
  },
  serverDiscovery: { type: "static", servers: [{ hostname: "test.server.local" }] },
  fileType: { type: "text" },
  parserRules: [
    {
      name: "privmsg",
      pattern: "^\\[(?<timestamp>[^\\]]+)\\]\\s+<(?<nickname>[^>]+)>\\s+(?<content>.+)$",
      messageType: "privmsg",
      captures: { timestamp: "timestamp", nickname: "nickname", content: "content" },
      priority: 50,
    },
  ],
};
const serverConfig = {
  id: "test-server",
  hostname: "test.server.local",
  displayName: "TestServer",
  clientNickname: "tester",
  enabled: true,
};
const eventConfig = {
  id: "test-event",
  name: "Alert Phrase",
  enabled: true,
  baseEvent: "message",
  serverIds: ["*"],
  sinkIds: ["test-sink"],
  priority: 10,
  filters: {
    operator: "AND",
    filters: [{ field: "message.content", operator: "contains", value: "alert" }],
  },
};
const sinkConfig = buildTestSinkConfig("test-sink");
const mainConfig = {
  global: { pollInterval: 500, debug: true, configDirectory: "." },
  clients: ["test-client"],
  servers: ["test-server"],
  events: ["test-event"],
  sinks: ["test-sink"],
};

function writeJSON(rel: string, obj: any) {
  const full = path.join(configDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(obj, null, 2));
}

// Store as JSON; pass explicit path to loader
writeJSON("config.json", mainConfig);
writeJSON("clients/test-client.json", clientConfig);
writeJSON("servers/test-server.json", serverConfig);
writeJSON("events/test-event.json", eventConfig);
writeJSON("sinks/test-sink.json", sinkConfig);

// Ensure client log directory exists before orchestrator initialization
fs.mkdirSync(clientConfig.logDirectory, { recursive: true });

describe("IRCNotifyOrchestrator end-to-end", () => {
  it("processes appended log lines and triggers sink", async () => {
    TestCaptureSink.clear();
    const orchestrator = new IRCNotifyOrchestrator(path.join(configDir, "config.json"));

    // Prepare log file BEFORE start so watcher attaches, then append after
    const channelDir = path.join(logsDir, "textual", "TestServer (AAAA)", "Channels", "#general");
    fs.mkdirSync(channelDir, { recursive: true });
    const logFile = path.join(channelDir, `${new Date().toISOString().slice(0, 10)}.txt`);
    fs.writeFileSync(logFile, "");

    await orchestrator.initialize();
    await orchestrator.start();

    // Append after start so watcher reads new line
    const line = "[2025-11-24 10:00:00] <alice> alert something happened";
    fs.appendFileSync(logFile, line + "\n");
    await new Promise((r) => setTimeout(r, 1800));
    const notifications = TestCaptureSink.all();
    expect(notifications.length).toBeGreaterThan(0);
    const last = notifications[notifications.length - 1];
    expect(last.body).toContain("alert");
    expect(last.context.sender!.nickname).toBe("alice");
    await orchestrator.stop();
  });
});
