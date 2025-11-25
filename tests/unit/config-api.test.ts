import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { ConfigApiServer } from "../../src/api/server";
import { IRCNotifyOrchestrator } from "../../src/index";

let orchestrator: IRCNotifyOrchestrator;
let api: ConfigApiServer;
let authToken: string;

describe("Config API Server", () => {
  beforeAll(async () => {
    // Use fixture config (TypeScript) if present, else fall back to default resolution
    const configPath = "tests/fixtures/e2e/config.json";
    orchestrator = new IRCNotifyOrchestrator(configPath);
    await orchestrator.initialize();
    await orchestrator.start();
    api = new ConfigApiServer({ orchestrator, port: 3123 });
    await api.start();

    // Read the generated auth token
    const authTokenPath = join("tests/fixtures/e2e", "auth_token.txt");
    authToken = readFileSync(authTokenPath, "utf8").trim();
  });

  afterAll(async () => {
    api.stop();
    await orchestrator.stop();
  });

  it("responds to health", async () => {
    const res = await fetch("http://localhost:3123/api/health", {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("provides status", async () => {
    const res = await fetch("http://localhost:3123/api/status", {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBeDefined();
    expect(body.status.running).toBe(true);
  });
});
