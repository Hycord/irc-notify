import * as fs from "fs";
import * as path from "path";
import { ConfigIO } from "../config/import-export";
import { ConfigLoader } from "../config/loader";
import { IRCNotifyOrchestrator } from "../index";
import { getOrCreateAuthToken } from "../utils/auth";

interface ApiServerOptions {
  port?: number;
  host?: string;
  authToken?: string; // Simple bearer token for now
  orchestrator: IRCNotifyOrchestrator;
  enableFileOps?: boolean; // allow direct file writes
}

/** Utility: send JSON */
function json(res: ResponseInit, body: any): Response {
  return new Response(JSON.stringify(body, null, 2), {
    ...res,
    headers: {
      "content-type": "application/json",
      ...(res.headers || {}),
    },
  });
}

/** Basic path sanitizer relative to config directory */
function safePath(base: string, p: string): string {
  const resolved = path.resolve(base, p);
  if (!resolved.startsWith(path.resolve(base))) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}

export class ConfigApiServer {
  private opts: Required<Omit<ApiServerOptions, "authToken" | "orchestrator">> & {
    authToken?: string;
    orchestrator: IRCNotifyOrchestrator;
  };
  private server: any;
  private debounceTimer: any = null;
  private lastChange = Date.now();

  constructor(options: ApiServerOptions) {
    // If no auth token provided, generate/load one from config/auth_token.txt
    const configDir = options.orchestrator.getConfigDirectory();
    const authToken = options.authToken || getOrCreateAuthToken(configDir);

    this.opts = {
      port: options.port ?? 3000,
      host: options.host ?? "0.0.0.0",
      authToken: authToken,
      orchestrator: options.orchestrator,
      enableFileOps: options.enableFileOps ?? true,
    };

    // Debug: log the resolved auth token (only first 4 and last 4 chars)
    const masked =
      this.opts.authToken && this.opts.authToken.length > 8
        ? `${this.opts.authToken.slice(0, 4)}...${this.opts.authToken.slice(-4)}`
        : "***";
    console.log(`[api] Auth token configured: ${masked}`);
  }

  private auth(req: Request): boolean {
    if (!this.opts.authToken) return true; // unsecured if no token configured
    const header = req.headers.get("authorization");
    if (!header) return false;
    const [scheme, token] = header.split(/\s+/);
    return scheme.toLowerCase() === "bearer" && token === this.opts.authToken;
  }

  private scheduleReload() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      try {
        await this.opts.orchestrator.reloadFull();
      } catch (e) {
        console.error("Auto-reload failed", e);
      }
    }, 500);
  }

  /** Start watching config directory for changes */
  private watchConfigDir() {
    const dir = this.opts.orchestrator.getConfigDirectory();
    const categories = ["clients", "servers", "events", "sinks"]; // main config file watch separately
    try {
      fs.watch(dir, { persistent: true }, () => this.scheduleReload());
      for (const cat of categories) {
        const cdir = path.join(dir, cat);
        if (fs.existsSync(cdir)) {
          fs.watch(cdir, { persistent: true }, () => this.scheduleReload());
        }
      }
      console.log(`[api] Watching config directory for changes: ${dir}`);
    } catch (e) {
      console.error("Failed to set up config directory watch", e);
    }
  }

  async start() {
    this.watchConfigDir();
    this.server = Bun.serve({
      port: this.opts.port,
      hostname: this.opts.host,
      fetch: async (req: Request) => {
        const url = new URL(req.url);
        const m = req.method.toUpperCase();
        const baseConfigDir = this.opts.orchestrator.getConfigDirectory();

        if (!this.auth(req)) {
          return json({ status: 401 }, { error: "unauthorized" });
        }

        // Health
        if (url.pathname === "/api/health") {
          return json({ status: 200 }, { ok: true, time: new Date().toISOString() });
        }

        // Status
        if (url.pathname === "/api/status") {
          return json(
            { status: 200 },
            {
              status: this.opts.orchestrator.getStatus(),
              configDirectory: baseConfigDir,
            },
          );
        }

        // Reload
        if (url.pathname === "/api/config/reload" && m === "POST") {
          const result = await this.opts.orchestrator.reloadFull();
          return json({ status: 200 }, { reloaded: true, summary: result });
        }

        // Export current config bundle
        if (url.pathname === "/api/config/export" && m === "GET") {
          try {
            const tmp = path.join(Bun.tmpdir, `config-export-${Date.now()}.json`);
            await ConfigIO.exportConfig(tmp);
            const content = fs.readFileSync(tmp, "utf-8");
            return new Response(content, { headers: { "content-type": "application/json" } });
          } catch (e: any) {
            return json({ status: 500 }, { error: e.message || String(e) });
          }
        }

        // Upload (replace or merge)
        if (url.pathname === "/api/config/upload" && m === "POST") {
          const mode = url.searchParams.get("mode") || "replace"; // replace | merge
          try {
            const arrayBuffer = await req.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            const tmpPath = path.join(Bun.tmpdir, `upload-${Date.now()}.json.gz`);
            fs.writeFileSync(tmpPath, bytes);
            if (mode === "merge") {
              await ConfigIO.mergeConfigWithOptions({
                inputPath: tmpPath,
                reloadConfig: false,
              });
            } else {
              await ConfigIO.importConfigWithOptions({
                inputPath: tmpPath,
                overwrite: true,
                reloadConfig: false,
              });
            }
            const summary = await this.opts.orchestrator.reloadFull();
            return json({ status: 200 }, { ok: true, mode, summary });
          } catch (e: any) {
            return json({ status: 500 }, { error: e.message || String(e) });
          }
        }

        // List config files
        if (url.pathname === "/api/config/files" && m === "GET") {
          const categories = ["clients", "servers", "events", "sinks"];
          const result: any = {};
          for (const cat of categories) {
            const dir = path.join(baseConfigDir, cat);
            if (!fs.existsSync(dir)) continue;
            result[cat] = fs
              .readdirSync(dir)
              .filter((f) => (f.endsWith(".ts") || f.endsWith(".json")) && f !== "auth_token.txt");
          }
          // main config
          result.main = ["config.ts", "config.json"].filter((f) =>
            fs.existsSync(path.join(process.cwd(), f)),
          );
          return json({ status: 200 }, result);
        }

        // Direct file ops: /api/config/file/<category>/<name>
        if (url.pathname.startsWith("/api/config/file/")) {
          if (!this.opts.enableFileOps) {
            return json({ status: 403 }, { error: "file operations disabled" });
          }
          const parts = url.pathname.split("/").filter(Boolean); // [api, config, file, category, name]
          if (parts.length < 5) {
            return json({ status: 400 }, { error: "invalid path" });
          }
          const category = parts[3];
          const filename = parts.slice(4).join("/");
          const allowed = new Set(["clients", "servers", "events", "sinks"]);
          if (!allowed.has(category)) {
            return json({ status: 400 }, { error: "invalid category" });
          }
          // Block access to sensitive files
          if (filename === "auth_token.txt" || filename.includes("auth_token")) {
            return json({ status: 403 }, { error: "access denied" });
          }
          try {
            const filePath = safePath(path.join(baseConfigDir, category), filename);
            if (m === "GET") {
              if (!fs.existsSync(filePath)) return json({ status: 404 }, { error: "not found" });
              return new Response(fs.readFileSync(filePath), {
                headers: { "content-type": "application/octet-stream" },
              });
            }
            if (m === "DELETE") {
              if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
              await this.opts.orchestrator.reloadFull();
              return json({ status: 200 }, { deleted: true });
            }
            if (m === "PUT") {
              const content = await req.text();
              // Write to temp then validate by attempting a load
              const tmpPath = filePath + ".tmp";
              fs.writeFileSync(tmpPath, content, "utf-8");
              try {
                fs.renameSync(tmpPath, filePath);
                await this.opts.orchestrator.reloadFull();
                return json({ status: 200 }, { updated: true });
              } catch (e: any) {
                // revert
                if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
                return json({ status: 400 }, { error: e.message || String(e) });
              }
            }
            return json({ status: 405 }, { error: "method not allowed" });
          } catch (e: any) {
            return json({ status: 400 }, { error: e.message || String(e) });
          }
        }

        return json({ status: 404 }, { error: "not found" });
      },
    });
    console.log(`[api] Config API listening on http://${this.opts.host}:${this.opts.port}`);
  }

  async stop() {
    if (!this.server) {
      return;
    }

    try {
      const addr = `http://${this.opts.host}:${this.opts.port}`;
      console.log(`[api] Stopping server on ${addr}`);
      this.server.stop(true); // Force close with true parameter
      this.server = null;
      console.log(`[api] Server stopped successfully`);

      // Give it a moment to fully release the port
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (e) {
      console.error("[api] Error stopping server:", e);
    }
  }
}

// Optional standalone run
if (import.meta.main) {
  (async () => {
    const orchestrator = new IRCNotifyOrchestrator(process.env.CONFIG_PATH);
    await orchestrator.initialize();
    await orchestrator.start();
    const server = new ConfigApiServer({ orchestrator });
    await server.start();
  })();
}
