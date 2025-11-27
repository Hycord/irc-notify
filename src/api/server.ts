import * as fs from "fs";
import * as path from "path";
import { IRCNotifyOrchestrator } from "../index";
import { getOrCreateAuthToken } from "../utils/auth";
import {
  dataFlowHandler,
  exportHandler,
  fileOpsHandler,
  filesHandler,
  getRootConfigHandler,
  healthHandler,
  logsDiscoverHandler,
  logsMessagesHandler,
  logsReadHandler,
  logsTailHandler,
  logsTargetsHandler,
  reloadHandler,
  statusHandler,
  updateRootConfigHandler,
  uploadHandler,
} from "./routes";
import type { ApiServerOptions, RouteContext } from "./types";
import { isAuthenticated, json } from "./utils";

/**
 * Config API Server
 *
 * HTTP server providing REST API for configuration management.
 * Routes are organized in separate files under src/api/routes/.
 * See docs/api/type-reference.ts for API response types.
 */
export class ConfigApiServer {
  private opts: Required<Omit<ApiServerOptions, "authToken" | "orchestrator">> & {
    authToken?: string;
    orchestrator: IRCNotifyOrchestrator;
  };
  private server: any;
  private debounceTimer: any = null;
  private context: RouteContext;

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

    // Set up route context
    this.context = {
      orchestrator: this.opts.orchestrator,
      enableFileOps: this.opts.enableFileOps,
      authToken: this.opts.authToken,
    };

    // Debug: log the resolved auth token (only first 4 and last 4 chars)
    const masked =
      this.opts.authToken && this.opts.authToken.length > 8
        ? `${this.opts.authToken.slice(0, 4)}...${this.opts.authToken.slice(-4)}`
        : "***";
    console.log(`[api] Auth token configured: ${masked}`);
  }

  private scheduleReload() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      try {
        console.log("[api] Auto-reloading configuration...");
        const result = await this.opts.orchestrator.reloadFull();
        console.log(
          `[api] Auto-reload complete: ${result.clients} clients, ${result.sinks} sinks, ${result.events} events, ${result.servers} servers`,
        );
      } catch (e) {
        console.error("[api] Auto-reload failed:", e);
      }
    }, 500);
  }

  /** Start watching config directory for changes */
  private watchConfigDir() {
    const dir = this.opts.orchestrator.getConfigDirectory();
    const categories = ["clients", "servers", "events", "sinks"];

    try {
      // Watch main config directory for config.json changes
      const mainWatcher = fs.watch(dir, { persistent: false }, (eventType, filename) => {
        if (filename && filename.endsWith(".json")) {
          console.log(`[api] Config file changed: ${filename} (${eventType})`);
          this.scheduleReload();
        }
      });

      // Watch each category subdirectory
      for (const cat of categories) {
        const cdir = path.join(dir, cat);
        if (fs.existsSync(cdir)) {
          fs.watch(cdir, { persistent: false }, (eventType, filename) => {
            if (filename && filename.endsWith(".json")) {
              console.log(`[api] Config file changed: ${cat}/${filename} (${eventType})`);
              this.scheduleReload();
            }
          });
        }
      }

      console.log(`[api] Watching config directory for changes: ${dir}`);
      console.log(`[api] Auto-reload enabled for: config.json, ${categories.join("/")}/`);
    } catch (e) {
      console.error("[api] Failed to set up config directory watch:", e);
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

        // Authentication check
        if (!isAuthenticated(req, this.opts.authToken)) {
          return json({ status: 401 }, { error: "unauthorized" });
        }

        // Route to appropriate handler
        // Health check
        if (url.pathname === "/api/health") {
          return healthHandler(req, this.context);
        }

        // Status
        if (url.pathname === "/api/status") {
          return statusHandler(req, this.context);
        }

        // Data flow
        if (url.pathname === "/api/data-flow" && m === "GET") {
          return dataFlowHandler(req, this.context);
        }

        // Root config
        if (url.pathname === "/api/config" && m === "GET") {
          return getRootConfigHandler(req, this.context);
        }

        if (url.pathname === "/api/config" && m === "PUT") {
          return updateRootConfigHandler(req, this.context);
        }

        // Config reload
        if (url.pathname === "/api/config/reload" && m === "POST") {
          return reloadHandler(req, this.context);
        }

        // Config export
        if (url.pathname === "/api/config/export" && m === "GET") {
          return exportHandler(req, this.context);
        }

        // Config upload
        if (url.pathname === "/api/config/upload" && m === "POST") {
          return uploadHandler(req, this.context);
        }

        // List config files
        if (url.pathname === "/api/config/files" && m === "GET") {
          return filesHandler(req, this.context);
        }

        // File operations
        if (url.pathname.startsWith("/api/config/file/")) {
          return fileOpsHandler(req, this.context);
        }

        // Log exploration - IRC-client style (high-level)
        if (url.pathname === "/api/logs/targets" && m === "GET") {
          return logsTargetsHandler(req, this.context);
        }

        if (url.pathname === "/api/logs/messages" && m === "GET") {
          return logsMessagesHandler(req, this.context);
        }

        // Log exploration - File-based (low-level)
        if (url.pathname === "/api/logs/discover" && m === "GET") {
          return logsDiscoverHandler(req, this.context);
        }

        if (url.pathname === "/api/logs/read" && m === "GET") {
          return logsReadHandler(req, this.context);
        }

        if (url.pathname === "/api/logs/tail" && m === "GET") {
          return logsTailHandler(req, this.context);
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
