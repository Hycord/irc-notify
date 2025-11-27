/**
 * Config Files List Route Handler
 *
 * GET /api/config/files
 *
 * Lists all configuration files by category.
 * See docs/api/type-reference.ts for ConfigFilesResponse type.
 */

import * as fs from "fs";
import * as path from "path";
import type { RouteHandler } from "../types";
import { json } from "../utils";

/**
 * List config files endpoint
 * Returns all JSON config files organized by category
 */
export const filesHandler: RouteHandler = (req, context) => {
  const baseConfigDir = context.orchestrator.getConfigDirectory();
  const categories = ["clients", "servers", "events", "sinks"];
  const result: any = {};

  for (const cat of categories) {
    const dir = path.join(baseConfigDir, cat);
    if (!fs.existsSync(dir)) continue;
    result[cat] = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "auth_token.txt");
  }

  // main config
  result.main = ["config.json"].filter((f) => fs.existsSync(path.join(process.cwd(), f)));

  return json({ status: 200 }, result);
};
