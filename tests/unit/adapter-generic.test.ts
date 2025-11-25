import { describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { GenericClientAdapter } from "../../src/adapters/generic";
import { ClientConfig } from "../../src/types";

const tmpDir = path.join(process.cwd(), "tests", "tmp", "adapter");
fs.mkdirSync(tmpDir, { recursive: true });
const logDir = tmpDir;

const clientConfig: ClientConfig = {
  id: "test-client",
  type: "textual",
  name: "Test Client",
  enabled: true,
  logDirectory: logDir,
  discovery: {
    patterns: { channels: "**/*.txt" },
    pathExtraction: { channelPattern: "/([^/]+).txt$/", channelGroup: 1 },
  },
  serverDiscovery: { type: "static", servers: [{ hostname: "example.org" }] },
  fileType: { type: "text" },
  parserRules: [
    {
      name: "privmsg",
      pattern: "^\\[(?<timestamp>[^\\]]+)\\]\\s+<(?<nickname>[^>]+)>\\s+(?<content>.+)$",
      messageType: "privmsg",
      captures: { timestamp: "timestamp", nickname: "nickname", content: "content" },
      priority: 10,
    },
  ],
};

describe("GenericClientAdapter", () => {
  it("parses a log line into MessageContext", async () => {
    const adapter = new GenericClientAdapter(clientConfig, true);
    await adapter.initialize();
    const filePath = path.join(logDir, "channel.txt");
    fs.writeFileSync(filePath, "");
    const contextFromPath = adapter.extractContextFromPath(filePath);
    const line = "[2025-11-24 10:00:00] <alice> hello world";
    const ctx = adapter.parseLine(line, contextFromPath);
    expect(ctx).toBeTruthy();
    expect(ctx!.message!.content).toBe("hello world");
    expect(ctx!.sender!.nickname).toBe("alice");
  });
});
