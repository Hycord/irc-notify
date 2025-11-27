/**
 * API Server Utilities
 */

import * as path from "path";

/**
 * Send JSON response with proper headers
 */
export function json(res: ResponseInit, body: any): Response {
  return new Response(JSON.stringify(body, null, 2), {
    ...res,
    headers: {
      "content-type": "application/json",
      ...(res.headers || {}),
    },
  });
}

/**
 * Basic path sanitizer relative to config directory
 * Prevents path traversal attacks
 */
export function safePath(base: string, p: string): string {
  const resolved = path.resolve(base, p);
  if (!resolved.startsWith(path.resolve(base))) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}

/**
 * Check if request has valid bearer token authentication
 */
export function isAuthenticated(req: Request, authToken?: string): boolean {
  if (!authToken) return true; // unsecured if no token configured
  const header = req.headers.get("authorization");
  if (!header) return false;
  const [scheme, token] = header.split(/\s+/);
  return scheme.toLowerCase() === "bearer" && token === authToken;
}
