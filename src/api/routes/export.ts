/**
 * Config Export Route Handler
 *
 * GET /api/config/export
 *
 * Exports the current configuration as a JSON bundle.
 * See docs/api/type-reference.ts for ConfigExport type.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ConfigIO } from "../../config/import-export";
import type { RouteHandler } from "../types";
import { json } from "../utils";

/**
 * Export config endpoint
 * Creates a temporary .json.gz bundle and returns it as compressed data
 */
export const exportHandler: RouteHandler = async (req, context) => {
  try {
    const tmp = path.join(os.tmpdir(), `config-export-${Date.now()}.json.gz`);
    await ConfigIO.exportConfig(tmp);
    const buffer = fs.readFileSync(tmp);

    // Clean up temp file
    fs.unlinkSync(tmp);

    return new Response(buffer, {
      headers: {
        "content-type": "application/gzip",
        "content-disposition": `attachment; filename="irc-notify-config-${Date.now()}.json.gz"`,
      },
    });
  } catch (e: any) {
    return json({ status: 500 }, { error: e.message || String(e) });
  }
};
