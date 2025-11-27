/**
 * Root Config Route Handler
 *
 * GET /api/config
 * PUT /api/config
 *
 * Manage the root configuration (config.ts / config.json)
 */

import * as fs from "fs";
import * as path from "path";
import type { IRCNotifyConfig } from "../../types";
import type { RouteHandler } from "../types";
import { json } from "../utils";

/**
 * Get root configuration
 */
export const getRootConfigHandler: RouteHandler = (req, context) => {
  const config = context.orchestrator.getConfig();
  return json({ status: 200 }, config);
};

/**
 * Update root configuration
 *
 * Accepts either JSON or TypeScript format.
 * Always stores as TypeScript with proper typing.
 */
export const updateRootConfigHandler: RouteHandler = async (req, context) => {
  if (!context.enableFileOps) {
    return json({ status: 403 }, { error: "File operations are disabled" });
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    const body = await req.text();

    // Determine format from content
    let config: IRCNotifyConfig;
    let uploadFormat: "json" | "typescript";

    if (contentType.includes("application/json") || body.trim().startsWith("{")) {
      // Parse as JSON
      config = JSON.parse(body);
      uploadFormat = "json";
    } else {
      // Parse TypeScript - extract the object from defineConfig() or export default
      const match = body.match(/defineConfig\(([\s\S]*)\)|export default\s*(\{[\s\S]*\})/);
      if (!match) {
        return json({ status: 400 }, { error: "Invalid TypeScript format" });
      }
      const configStr = match[1] || match[2];
      config = eval(`(${configStr})`);
      uploadFormat = "typescript";
    }

    // Validate basic structure
    if (!config.global) {
      return json({ status: 400 }, { error: "Missing 'global' section in config" });
    }

    // Write as JSON
    const configDir = context.orchestrator.getConfigDirectory();
    const configPath = path.join(configDir, "config.json");

    // Format the JSON config
    const formattedConfig = JSON.stringify(config, null, 2) + "\n";

    fs.writeFileSync(configPath, formattedConfig, "utf-8");

    // Remove any old TypeScript version
    const tsPath = path.join(configDir, "config.ts");
    if (fs.existsSync(tsPath)) {
      fs.unlinkSync(tsPath);
    }

    // Trigger reload
    await context.orchestrator.reloadFull();

    return json(
      { status: 200 },
      {
        updated: true,
        uploadFormat,
        storedFormat: "json",
        path: configPath,
      },
    );
  } catch (error: any) {
    return json(
      { status: 400 },
      {
        error: "Failed to update root config",
        message: error.message,
      },
    );
  }
};
