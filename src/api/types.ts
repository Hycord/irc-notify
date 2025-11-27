/**
 * API Server Types
 *
 * Internal types for the API server implementation.
 * For client-facing API response types, see docs/api/type-reference.ts
 */

import type { IRCNotifyOrchestrator } from "../index";

/**
 * Options for initializing the API server
 */
export interface ApiServerOptions {
  port?: number;
  host?: string;
  authToken?: string; // Simple bearer token for now
  orchestrator: IRCNotifyOrchestrator;
  enableFileOps?: boolean; // allow direct file writes
}

/**
 * Shared context passed to all route handlers
 */
export interface RouteContext {
  orchestrator: IRCNotifyOrchestrator;
  enableFileOps: boolean;
  authToken?: string;
}

/**
 * Route handler function signature
 */
export type RouteHandler = (req: Request, context: RouteContext) => Promise<Response> | Response;
