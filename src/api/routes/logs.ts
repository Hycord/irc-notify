/**
 * Log Files Exploration Route Handler
 *
 * IRC-client-style endpoints (high-level):
 * GET /api/logs/targets?clientId=<id>&serverId=<id> - List channels/queries/console
 * GET /api/logs/messages?clientId=<id>&serverId=<id>&target=<name>&type=<type>&offset=<n>&limit=<n>
 *
 * File-based endpoints (low-level):
 * GET /api/logs/discover?clientId=<id>&serverId=<id>&server=<name>&channel=<name>&query=<name>&type=<console|channel|query>
 * GET /api/logs/read?path=<path>&offset=<n>&limit=<n>
 * GET /api/logs/tail?path=<path>&lines=<n>
 *
 * Provides access to IRC log files with chunking and automatic compression support.
 * Uses configuration to discover log files based on client and server IDs.
 * Bun automatically handles compression based on Accept-Encoding header.
 */

import * as fs from "fs";
import * as path from "path";
import { glob } from "glob";
import type { RouteHandler } from "../types";
import { json } from "../utils";

/**
 * Helper to find log file for a specific target
 */
function findLogFile(
  clientConfig: any,
  serverId: string,
  targetName: string,
  targetType: "console" | "channel" | "query",
): string | null {
  const extraction = clientConfig.discovery.pathExtraction;
  const patterns = [];

  // Get appropriate pattern based on type
  if (targetType === "console" && clientConfig.discovery.patterns.console) {
    patterns.push(clientConfig.discovery.patterns.console);
  } else if (targetType === "channel" && clientConfig.discovery.patterns.channels) {
    patterns.push(clientConfig.discovery.patterns.channels);
  } else if (targetType === "query" && clientConfig.discovery.patterns.queries) {
    patterns.push(clientConfig.discovery.patterns.queries);
  }

  // Find matching files
  for (const pattern of patterns) {
    try {
      const files = glob.sync(pattern, {
        cwd: clientConfig.logDirectory,
        absolute: true,
      });

      for (const filePath of files) {
        // Extract server identifier
        let serverIdentifier: string | undefined;
        if (extraction.serverPattern) {
          const regex = new RegExp(extraction.serverPattern);
          const match = filePath.match(regex);
          if (match && extraction.serverGroup !== undefined) {
            serverIdentifier = match[extraction.serverGroup];
          }
        }

        // Check if server matches
        if (serverIdentifier?.toLowerCase() !== serverId.toLowerCase()) {
          continue;
        }

        // Extract target
        let extractedTarget: string | undefined;
        let extractedType: string | undefined;

        if (extraction.consolePattern && new RegExp(extraction.consolePattern).test(filePath)) {
          extractedType = "console";
          extractedTarget = "Console";
        } else if (extraction.channelPattern) {
          const regex = new RegExp(extraction.channelPattern);
          const match = filePath.match(regex);
          if (match && extraction.channelGroup !== undefined) {
            extractedType = "channel";
            extractedTarget = match[extraction.channelGroup];
          }
        } else if (extraction.queryPattern) {
          const regex = new RegExp(extraction.queryPattern);
          const match = filePath.match(regex);
          if (match && extraction.queryGroup !== undefined) {
            extractedType = "query";
            extractedTarget = match[extraction.queryGroup];
          }
        }

        // Check if target matches
        if (
          extractedType === targetType &&
          extractedTarget?.toLowerCase() === targetName.toLowerCase()
        ) {
          return filePath;
        }
      }
    } catch (error) {
      console.error(`Error finding log file:`, error);
    }
  }

  return null;
}

/**
 * List available targets (channels/queries/console) for a client+server
 * IRC-client-style endpoint
 */
export const logsTargetsHandler: RouteHandler = async (req, context) => {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  const serverId = url.searchParams.get("serverId");

  if (!clientId || !serverId) {
    return json(
      { status: 400 },
      {
        error: "Missing required parameters: clientId and serverId",
      },
    );
  }

  // Get client config
  const clientConfigs = context.orchestrator.getClientConfigs();
  const clientConfig = clientConfigs.find((c) => c.id === clientId && c.enabled);

  if (!clientConfig) {
    return json(
      { status: 404 },
      {
        error: `Client not found or disabled: ${clientId}`,
      },
    );
  }

  // Discover all files for this client
  const patterns = [
    clientConfig.discovery.patterns.console,
    clientConfig.discovery.patterns.channels,
    clientConfig.discovery.patterns.queries,
  ].filter(Boolean) as string[];

  const targets: Array<{
    name: string;
    type: "console" | "channel" | "query";
    lastModified: string;
    size: number;
  }> = [];

  try {
    const allFiles: string[] = [];
    for (const pattern of patterns) {
      const files = await glob(pattern, {
        cwd: clientConfig.logDirectory,
        absolute: true,
      });
      allFiles.push(...files);
    }

    const extraction = clientConfig.discovery.pathExtraction;

    for (const filePath of allFiles) {
      // Extract server identifier
      let serverIdentifier: string | undefined;
      if (extraction.serverPattern) {
        const regex = new RegExp(extraction.serverPattern);
        const match = filePath.match(regex);
        if (match && extraction.serverGroup !== undefined) {
          serverIdentifier = match[extraction.serverGroup];
        }
      }

      // Filter by serverId
      if (serverIdentifier?.toLowerCase() !== serverId.toLowerCase()) {
        continue;
      }

      // Extract target
      let target: { type: "console" | "channel" | "query"; name: string } | undefined;

      if (extraction.consolePattern && new RegExp(extraction.consolePattern).test(filePath)) {
        target = { type: "console", name: "Console" };
      } else if (extraction.channelPattern) {
        const regex = new RegExp(extraction.channelPattern);
        const match = filePath.match(regex);
        if (match && extraction.channelGroup !== undefined) {
          target = { type: "channel", name: match[extraction.channelGroup] };
        }
      } else if (extraction.queryPattern) {
        const regex = new RegExp(extraction.queryPattern);
        const match = filePath.match(regex);
        if (match && extraction.queryGroup !== undefined) {
          target = { type: "query", name: match[extraction.queryGroup] };
        }
      }

      if (target) {
        const stats = fs.statSync(filePath);
        targets.push({
          name: target.name,
          type: target.type,
          lastModified: stats.mtime.toISOString(),
          size: stats.size,
        });
      }
    }

    // Sort by type (console first, then channels, then queries) and name
    targets.sort((a, b) => {
      const typeOrder = { console: 0, channel: 1, query: 2 };
      const typeCompare = typeOrder[a.type] - typeOrder[b.type];
      if (typeCompare !== 0) return typeCompare;
      return a.name.localeCompare(b.name);
    });
  } catch (error) {
    console.error(`Error discovering targets:`, error);
    return json(
      { status: 500 },
      {
        error: "Failed to discover targets",
        details: error instanceof Error ? error.message : String(error),
      },
    );
  }

  return json(
    { status: 200 },
    {
      clientId,
      serverId,
      targets,
    },
  );
};

/**
 * Get messages for a specific target (channel/query/console)
 * IRC-client-style endpoint
 */
export const logsMessagesHandler: RouteHandler = async (req, context) => {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  const serverId = url.searchParams.get("serverId");
  const target = url.searchParams.get("target");
  const type = url.searchParams.get("type") as "console" | "channel" | "query" | null;
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);
  const limit = parseInt(url.searchParams.get("limit") || "100", 10);

  if (!clientId || !serverId || !target || !type) {
    return json(
      { status: 400 },
      {
        error: "Missing required parameters: clientId, serverId, target, and type",
      },
    );
  }

  // Get client config
  const clientConfigs = context.orchestrator.getClientConfigs();
  const clientConfig = clientConfigs.find((c) => c.id === clientId && c.enabled);

  if (!clientConfig) {
    return json(
      { status: 404 },
      {
        error: `Client not found or disabled: ${clientId}`,
      },
    );
  }

  // Find the log file for this target
  const filePath = findLogFile(clientConfig, serverId, target, type);

  if (!filePath) {
    return json(
      { status: 404 },
      {
        error: `Log file not found for target: ${target}`,
      },
    );
  }

  if (!fs.existsSync(filePath)) {
    return json({ status: 404 }, { error: "Log file not found" });
  }

  try {
    const stats = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    // Apply offset and limit
    const startIdx = Math.max(0, offset);
    const endIdx = Math.min(lines.length, offset + limit);
    const selectedLines = lines.slice(startIdx, endIdx);

    const responseData = {
      clientId,
      serverId,
      target,
      type,
      totalLines: lines.length,
      offset: startIdx,
      limit,
      returnedLines: selectedLines.length,
      hasMore: endIdx < lines.length,
      fileSize: stats.size,
      lastModified: stats.mtime.toISOString(),
      lines: selectedLines,
    };

    return json({ status: 200 }, responseData);
  } catch (error) {
    return json(
      { status: 500 },
      {
        error: "Failed to read messages",
        details: error instanceof Error ? error.message : String(error),
      },
    );
  }
};

/**
 * Discover log files endpoint
 * Returns list of available log files filtered by clientId and/or serverId
 */
export const logsDiscoverHandler: RouteHandler = async (req, context) => {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  const serverId = url.searchParams.get("serverId");
  const serverName = url.searchParams.get("server");
  const channelName = url.searchParams.get("channel");
  const queryName = url.searchParams.get("query");
  const targetType = url.searchParams.get("type") as "console" | "channel" | "query" | null;

  // Get client configurations
  const clientConfigs = context.orchestrator.getClientConfigs();

  // Filter by clientId if provided
  const targetClients = clientId
    ? clientConfigs.filter((c) => c.id === clientId && c.enabled)
    : clientConfigs.filter((c) => c.enabled);

  if (targetClients.length === 0) {
    return json(
      { status: 404 },
      {
        error: clientId ? `Client not found or disabled: ${clientId}` : "No enabled clients found",
      },
    );
  }

  const result: {
    clients: Array<{
      id: string;
      name: string;
      type: string;
      logDirectory: string;
      files: Array<{
        path: string;
        relativePath: string;
        size: number;
        modified: string;
        target?: {
          type: "console" | "channel" | "query";
          name: string;
        };
        server?: {
          identifier?: string;
          hostname?: string;
        };
      }>;
    }>;
  } = { clients: [] };

  for (const client of targetClients) {
    const clientResult = {
      id: client.id,
      name: client.name,
      type: client.type || client.id,
      logDirectory: client.logDirectory,
      files: [] as any[],
    };

    try {
      // Discover log files using client's discovery patterns
      const patterns = [
        client.discovery.patterns.console,
        client.discovery.patterns.channels,
        client.discovery.patterns.queries,
      ].filter(Boolean) as string[];

      const allFiles: string[] = [];
      for (const pattern of patterns) {
        const files = await glob(pattern, {
          cwd: client.logDirectory,
          absolute: true,
        });
        allFiles.push(...files);
      }

      // Get server configs for matching if serverId is provided
      const serverConfigs = serverId
        ? context.orchestrator.getServerConfigs().filter((s) => s.id === serverId && s.enabled)
        : context.orchestrator.getServerConfigs().filter((s) => s.enabled);

      for (const filePath of allFiles) {
        // Extract context from path
        const extraction = client.discovery.pathExtraction;
        let serverIdentifier: string | undefined;
        let target: { type: "console" | "channel" | "query"; name: string } | undefined;

        // Extract server identifier
        if (extraction.serverPattern) {
          const regex = new RegExp(extraction.serverPattern);
          const match = filePath.match(regex);
          if (match && extraction.serverGroup !== undefined) {
            serverIdentifier = match[extraction.serverGroup];
          }
        }

        // If serverId filter is provided, check if this file matches
        if (serverId && serverConfigs.length > 0) {
          const matchesServer = serverConfigs.some((s) => {
            // Match by id or displayName
            return (
              serverIdentifier?.toLowerCase() === s.id.toLowerCase() ||
              serverIdentifier?.toLowerCase() === s.displayName.toLowerCase()
            );
          });

          if (!matchesServer) {
            continue; // Skip this file
          }
        }

        // Extract target (console/channel/query)
        if (extraction.consolePattern && new RegExp(extraction.consolePattern).test(filePath)) {
          target = { type: "console", name: "Console" };
        } else if (extraction.channelPattern) {
          const regex = new RegExp(extraction.channelPattern);
          const match = filePath.match(regex);
          if (match && extraction.channelGroup !== undefined) {
            target = { type: "channel", name: match[extraction.channelGroup] };
          }
        } else if (extraction.queryPattern) {
          const regex = new RegExp(extraction.queryPattern);
          const match = filePath.match(regex);
          if (match && extraction.queryGroup !== undefined) {
            target = { type: "query", name: match[extraction.queryGroup] };
          }
        }

        // Apply additional filters
        if (serverName && serverIdentifier?.toLowerCase() !== serverName.toLowerCase()) {
          continue; // Skip if server name doesn't match
        }

        if (targetType && target?.type !== targetType) {
          continue; // Skip if target type doesn't match
        }

        if (
          channelName &&
          (target?.type !== "channel" || target.name.toLowerCase() !== channelName.toLowerCase())
        ) {
          continue; // Skip if channel name doesn't match
        }

        if (
          queryName &&
          (target?.type !== "query" || target.name.toLowerCase() !== queryName.toLowerCase())
        ) {
          continue; // Skip if query name doesn't match
        }

        // Get file stats
        const stats = fs.statSync(filePath);
        const relativePath = path.relative(client.logDirectory, filePath);

        clientResult.files.push({
          path: filePath,
          relativePath,
          size: stats.size,
          modified: stats.mtime.toISOString(),
          target,
          server: serverIdentifier ? { identifier: serverIdentifier } : undefined,
        });
      }

      // Sort by modified date (newest first)
      clientResult.files.sort(
        (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime(),
      );
    } catch (error) {
      console.error(`Error discovering logs for client ${client.id}:`, error);
    }

    if (clientResult.files.length > 0) {
      result.clients.push(clientResult);
    }
  }

  return json({ status: 200 }, result);
};

/**
 * Read log file with chunking support
 * Supports offset/limit for pagination and optional gzip compression
 */
export const logsReadHandler: RouteHandler = async (req, context) => {
  const url = new URL(req.url);
  const filePath = url.searchParams.get("path");
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);
  const limit = parseInt(url.searchParams.get("limit") || "10000", 10); // Default 10k lines

  if (!filePath) {
    return json({ status: 400 }, { error: "Missing 'path' parameter" });
  }

  // Security: Validate path is within a configured log directory
  const clientConfigs = context.orchestrator.getClientConfigs();
  const isValidPath = clientConfigs.some((c) => {
    const normalizedLogDir = path.resolve(c.logDirectory);
    const normalizedFilePath = path.resolve(filePath);
    return normalizedFilePath.startsWith(normalizedLogDir);
  });

  if (!isValidPath) {
    return json(
      { status: 403 },
      {
        error: "Access denied: path is not within configured log directories",
      },
    );
  }

  if (!fs.existsSync(filePath)) {
    return json({ status: 404 }, { error: "File not found" });
  }

  try {
    const stats = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    // Apply offset and limit
    const startIdx = Math.max(0, offset);
    const endIdx = Math.min(lines.length, offset + limit);
    const selectedLines = lines.slice(startIdx, endIdx);

    const responseData = {
      path: filePath,
      totalLines: lines.length,
      offset: startIdx,
      limit,
      returnedLines: selectedLines.length,
      hasMore: endIdx < lines.length,
      fileSize: stats.size,
      modified: stats.mtime.toISOString(),
      lines: selectedLines,
    };

    // Bun automatically handles compression based on Accept-Encoding header
    return json({ status: 200 }, responseData);
  } catch (error) {
    return json(
      { status: 500 },
      {
        error: "Failed to read file",
        details: error instanceof Error ? error.message : String(error),
      },
    );
  }
};

/**
 * Tail log file (read last N lines)
 * More efficient than reading entire file for recent logs
 */
export const logsTailHandler: RouteHandler = async (req, context) => {
  const url = new URL(req.url);
  const filePath = url.searchParams.get("path");
  const linesCount = parseInt(url.searchParams.get("lines") || "100", 10);

  if (!filePath) {
    return json({ status: 400 }, { error: "Missing 'path' parameter" });
  }

  // Security: Validate path is within a configured log directory
  const clientConfigs = context.orchestrator.getClientConfigs();
  const isValidPath = clientConfigs.some((c) => {
    const normalizedLogDir = path.resolve(c.logDirectory);
    const normalizedFilePath = path.resolve(filePath);
    return normalizedFilePath.startsWith(normalizedLogDir);
  });

  if (!isValidPath) {
    return json(
      { status: 403 },
      {
        error: "Access denied: path is not within configured log directories",
      },
    );
  }

  if (!fs.existsSync(filePath)) {
    return json({ status: 404 }, { error: "File not found" });
  }

  try {
    const stats = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    // Get last N lines
    const startIdx = Math.max(0, lines.length - linesCount);
    const tailLines = lines.slice(startIdx);

    const responseData = {
      path: filePath,
      totalLines: lines.length,
      requestedLines: linesCount,
      returnedLines: tailLines.length,
      fileSize: stats.size,
      modified: stats.mtime.toISOString(),
      lines: tailLines,
    };

    // Bun automatically handles compression based on Accept-Encoding header
    return json({ status: 200 }, responseData);
  } catch (error) {
    return json(
      { status: 500 },
      {
        error: "Failed to tail file",
        details: error instanceof Error ? error.message : String(error),
      },
    );
  }
};
