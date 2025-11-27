/**
 * Route Registry
 *
 * Exports all route handlers for the API server.
 */

export { healthHandler } from "./health";
export { statusHandler } from "./status";
export { reloadHandler } from "./reload";
export { exportHandler } from "./export";
export { uploadHandler } from "./upload";
export { filesHandler } from "./files";
export { fileOpsHandler } from "./file-ops";
export { dataFlowHandler } from "./data-flow";
export { getRootConfigHandler, updateRootConfigHandler } from "./root-config";
export {
  logsDiscoverHandler,
  logsReadHandler,
  logsTailHandler,
  logsTargetsHandler,
  logsMessagesHandler,
} from "./logs";
