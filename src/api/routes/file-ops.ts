/**
 * Config File Operations Route Handler
 *
 * GET /api/config/file/<category>/<name>
 * POST /api/config/file/<category>/<name>
 * PUT /api/config/file/<category>/<name>
 * DELETE /api/config/file/<category>/<name>
 *
 * Direct file operations for individual config files.
 * When creating or updating files, the filename is automatically synced
 * with the 'id' field in the config. If they don't match, the file is
 * renamed and the old file is deleted.
 *
 * See docs/api/type-reference.ts for response types.
 */

import * as fs from "fs";
import * as path from "path";
import { ConfigIO } from "../../config/import-export";
import type { RouteHandler } from "../types";
import { json, safePath } from "../utils";

/**
 * Config file operations endpoint
 * Handles GET (read), POST (create), PUT (update/create), DELETE for individual config files
 * POST and PUT automatically sync filename with config ID
 */
export const fileOpsHandler: RouteHandler = async (req, context) => {
  if (!context.enableFileOps) {
    return json({ status: 403 }, { error: "file operations disabled" });
  }

  const url = new URL(req.url);
  const m = req.method.toUpperCase();
  const baseConfigDir = context.orchestrator.getConfigDirectory();

  // Parse path: /api/config/file/<category>/<name>
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 5) {
    return json({ status: 400 }, { error: "invalid path" });
  }

  const category = parts[3];
  const filename = parts.slice(4).join("/");

  // Validate category
  const allowed = new Set(["clients", "servers", "events", "sinks"]);
  if (!allowed.has(category)) {
    return json({ status: 400 }, { error: "invalid category" });
  }

  // Block access to sensitive files
  if (filename === "auth_token.txt" || filename.includes("auth_token")) {
    return json({ status: 403 }, { error: "access denied" });
  }

  try {
    // Remove extension from filename to allow detection
    const baseFilename = filename.replace(/\.(ts|json)$/, "");
    const filePath = safePath(path.join(baseConfigDir, category), baseFilename);

    // Helper: cascade update for events on server/sink delete/rename
    async function cascadeEventReferences(options: {
      category: "servers" | "sinks" | string;
      action: "delete" | "rename";
      oldId: string;
      newId?: string;
    }): Promise<{ updatedFiles: number; totalFiles: number }> {
      const { category, action, oldId } = options;
      const newId = options.newId;
      // Only cascade for servers or sinks
      if (category !== "servers" && category !== "sinks") {
        return { updatedFiles: 0, totalFiles: 0 };
      }

      const eventsDir = path.join(baseConfigDir, "events");
      if (!fs.existsSync(eventsDir)) return { updatedFiles: 0, totalFiles: 0 };

      const files = fs.readdirSync(eventsDir).filter((f) => f.endsWith(".json"));
      let updated = 0;

      for (const file of files) {
        const filePath = path.join(eventsDir, file);
        try {
          const content = fs.readFileSync(filePath, "utf-8");
          const event = JSON.parse(content) as any;

          let changed = false;
          if (Array.isArray(event.sinkIds) && category === "sinks") {
            if (options.action === "delete") {
              const next = event.sinkIds.filter((id: string) => id !== oldId);
              if (next.length !== event.sinkIds.length) {
                event.sinkIds = next;
                changed = true;
              }
            } else if (options.action === "rename" && newId) {
              const next = event.sinkIds.map((id: string) => (id === oldId ? newId : id));
              // Only mark changed if an occurrence was replaced
              if (next.join("\u0000") !== event.sinkIds.join("\u0000")) {
                event.sinkIds = next;
                changed = true;
              }
            }
          }

          if (Array.isArray(event.serverIds) && category === "servers") {
            if (options.action === "delete") {
              const next = event.serverIds.filter((id: string) => id !== oldId);
              if (next.length !== event.serverIds.length) {
                event.serverIds = next;
                changed = true;
              }
            } else if (options.action === "rename" && newId) {
              const next = event.serverIds.map((id: string) => (id === oldId ? newId : id));
              if (next.join("\u0000") !== event.serverIds.join("\u0000")) {
                event.serverIds = next;
                changed = true;
              }
            }
          }

          if (changed) {
            // Persist back to the same filename (by base name)
            const baseName = path.join(eventsDir, path.basename(file, ".json"));
            ConfigIO.writeConfigFile(baseName, JSON.stringify(event, null, 2), "events");
            updated++;
          }
        } catch (e) {
          // Skip malformed files but keep processing others
          console.warn(`[api] Failed to process event file for cascade: ${file}`, e);
          continue;
        }
      }

      return { updatedFiles: updated, totalFiles: files.length };
    }

    // GET: Read file
    if (m === "GET") {
      try {
        const { content, sourceFormat } = await ConfigIO.readConfigFileAsync(
          filePath,
          category,
          "json",
        );

        return new Response(content, {
          headers: {
            "content-type": "application/json",
            "x-source-format": sourceFormat,
          },
        });
      } catch (e: any) {
        return json({ status: 404 }, { error: e.message || "not found" });
      }
    }

    // DELETE: Remove file
    if (m === "DELETE") {
      const deleted = ConfigIO.deleteConfigFile(filePath);
      if (deleted) {
        // Cascade: remove references from events if server/sink deleted
        const oldId = path.basename(baseFilename);
        const cascade = await cascadeEventReferences({
          category,
          action: "delete",
          oldId,
        });

        await context.orchestrator.reloadFull();
        return json({ status: 200 }, { deleted: true, cascade });
      }
      return json({ status: 404 }, { error: "not found" });
    }

    // POST: Create file (uses ID from content, ignores filename in URL)
    // PUT: Update/create file (syncs filename with ID)
    if (m === "POST" || m === "PUT") {
      const content = await req.text();

      try {
        // Parse the content to get the ID
        const config = JSON.parse(content);
        const configId = config.id;

        if (!configId) {
          return json({ status: 400 }, { error: "Config must have an 'id' field" });
        }

        // Get the config directory
        const configDir = context.orchestrator.getConfigDirectory();

        // Determine the original filename (without extension) from the URL path
        const originalFileName = baseFilename;

        // Write to the correct file based on ID (not the URL path)
        const correctFilePath = path.join(configDir, category, configId);
        const result = ConfigIO.writeConfigFile(correctFilePath, content, category);

        // If the original filename is different from the ID, delete the old file
        let renamed = false;
        if (originalFileName !== configId) {
          const oldFilePath = path.join(configDir, category, originalFileName);
          const deleted = ConfigIO.deleteConfigFile(oldFilePath);
          if (deleted) {
            renamed = true;
            console.log(`[api] Renamed config: ${category}/${originalFileName} → ${configId}`);
          }
        }

        // Cascade: if renaming a server/sink, update all event references
        let cascade: { updatedFiles: number; totalFiles: number } | undefined;
        if (renamed) {
          const oldId = path.basename(originalFileName);
          cascade = await cascadeEventReferences({
            category,
            action: "rename",
            oldId,
            newId: configId,
          });
        }

        await context.orchestrator.reloadFull();

        return json(
          { status: 200 },
          {
            updated: true,
            renamed,
            oldFileName: renamed ? originalFileName : undefined,
            newFileName: configId,
            cascade,
            ...result,
          },
        );
      } catch (e: any) {
        return json({ status: 400 }, { error: e.message || String(e) });
      }
    }

    return json({ status: 405 }, { error: "method not allowed" });
  } catch (e: any) {
    return json({ status: 400 }, { error: e.message || String(e) });
  }
};
