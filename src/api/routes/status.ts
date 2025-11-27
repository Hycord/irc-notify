/**
 * Status Route Handler
 *
 * GET /api/status
 *
 * Returns comprehensive system status including all configured components.
 * See docs/api/type-reference.ts for StatusResponse type.
 */

import type { RouteHandler } from "../types";
import { json } from "../utils";

/**
 * Status endpoint
 * Returns orchestrator status plus config directory information
 */
export const statusHandler: RouteHandler = (req, context) => {
  const baseConfigDir = context.orchestrator.getConfigDirectory();

  return json(
    { status: 200 },
    {
      ...context.orchestrator.getStatus(),
      configDirectory: baseConfigDir,
    },
  );
};
