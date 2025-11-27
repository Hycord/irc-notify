/**
 * Health Check Route Handler
 *
 * GET /api/health
 *
 * Returns a simple health check response.
 * See docs/api/type-reference.ts for HealthResponse type.
 */

import type { RouteHandler } from "../types";
import { json } from "../utils";

/**
 * Health check endpoint
 * Returns current timestamp to verify server is responsive
 */
export const healthHandler: RouteHandler = (req, context) => {
  return json(
    { status: 200 },
    {
      ok: true,
      time: new Date().toISOString(),
    },
  );
};
