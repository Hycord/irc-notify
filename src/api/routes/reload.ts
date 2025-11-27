/**
 * Config Reload Route Handler
 *
 * POST /api/config/reload
 *
 * Triggers a full configuration reload.
 * See docs/api/type-reference.ts for ReloadResponse type.
 */

import type { RouteHandler } from "../types";
import { json } from "../utils";

/**
 * Config reload endpoint
 * Reloads all configuration and restarts watchers
 */
export const reloadHandler: RouteHandler = async (req, context) => {
  const result = await context.orchestrator.reloadFull();

  return json(
    { status: 200 },
    {
      reloaded: true,
      summary: result,
    },
  );
};
