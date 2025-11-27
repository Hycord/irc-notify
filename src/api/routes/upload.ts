/**
 * Config Upload Route Handler
 *
 * POST /api/config/upload?mode=replace|merge
 *
 * Uploads and applies a configuration bundle.
 * See docs/api/type-reference.ts for UploadResponse type.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ConfigIO } from "../../config/import-export";
import type { RouteHandler } from "../types";
import { json } from "../utils";

/**
 * Upload config endpoint
 * Accepts a gzipped JSON bundle and applies it (replace or merge mode)
 */
export const uploadHandler: RouteHandler = async (req, context) => {
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") || "replace"; // replace | merge

  try {
    const arrayBuffer = await req.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const tmpPath = path.join(os.tmpdir(), `upload-${Date.now()}.json.gz`);
    fs.writeFileSync(tmpPath, bytes);

    if (mode === "merge") {
      await ConfigIO.mergeConfigWithOptions({
        inputPath: tmpPath,
        reloadConfig: false,
      });
    } else {
      await ConfigIO.importConfigWithOptions({
        inputPath: tmpPath,
        overwrite: true,
        replace: true,
        reloadConfig: false,
      });
    }

    const summary = await context.orchestrator.reloadFull();

    // Clean up temp file
    fs.unlinkSync(tmpPath);

    return json(
      { status: 200 },
      {
        ok: true,
        mode,
        summary,
      },
    );
  } catch (e: any) {
    return json({ status: 500 }, { error: e.message || String(e) });
  }
};
