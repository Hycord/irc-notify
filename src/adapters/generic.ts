import * as fs from "fs";
import * as path from "path";
import { glob } from "glob";
import { ClientAdapter, ClientConfig, MessageContext, ParserRule } from "../types";
import { EnvSubstitution } from "../utils/env";

/**
 * Generic client adapter driven entirely by JSON configuration
 */
export class GenericClientAdapter implements ClientAdapter {
  protected config: ClientConfig;
  protected debug: boolean;
  private fileHostnameCache: Map<string, string> = new Map(); // filePath -> hostname
  private discoveredServers: Array<{ hostname: string; metadata?: Record<string, any> }> = [];
  private directoryHostnameMap: Map<string, string> = new Map(); // serverDirName -> hostname

  constructor(config: ClientConfig, debug: boolean = false) {
    this.config = config;
    this.debug = debug;
  }

  async initialize(): Promise<void> {
    this.log("Initializing generic adapter");

    // Apply environment variable substitution
    this.config.logDirectory = EnvSubstitution.substitute(this.config.logDirectory);

    // Validate log directory exists
    if (!fs.existsSync(this.config.logDirectory)) {
      throw new Error(`Log directory does not exist: ${this.config.logDirectory}`);
    }

    // Discover and cache servers for later hostname resolution
    this.discoveredServers = await this.discoverServers();
    // Build directoryHostnameMap by pairing server.log parent dir with discovered hostname
    for (const server of this.discoveredServers) {
      if (server.metadata?.discoveredFrom) {
        const dirName = path.basename(path.dirname(server.metadata.discoveredFrom));
        if (server.hostname && dirName) {
          this.directoryHostnameMap.set(dirName, server.hostname);
        }
      }
    }
    if (this.debug && this.discoveredServers.length > 0) {
      this.log(
        `Discovered ${this.discoveredServers.length} server(s):`,
        this.discoveredServers.map((s) => `${s.hostname} (UUID: ${s.metadata?.uuid || "none"})`),
      );
    }
  }

  async discoverServers(): Promise<Array<{ hostname: string; metadata?: Record<string, any> }>> {
    const discovery = this.config.serverDiscovery;
    const servers: Array<{ hostname: string; metadata?: Record<string, any> }> = [];

    switch (discovery.type) {
      case "static":
        return discovery.servers || [];

      case "filesystem":
        if (!discovery.searchPattern || !discovery.hostnamePattern) {
          this.log("Filesystem discovery requires searchPattern and hostnamePattern");
          return [];
        }

        const files = await glob(discovery.searchPattern, {
          cwd: this.config.logDirectory,
          absolute: true,
        });

        for (const file of files) {
          const content = fs.readFileSync(file, "utf-8");
          const regex = new RegExp(discovery.hostnamePattern);
          const match = content.match(regex);

          if (match && discovery.hostnameGroup !== undefined) {
            servers.push({
              hostname: match[discovery.hostnameGroup],
              metadata: { discoveredFrom: file },
            });
          }
        }
        break;

      case "json":
        if (!discovery.jsonPath) {
          this.log("JSON discovery requires jsonPath");
          return [];
        }

        const jsonPath = path.join(this.config.logDirectory, discovery.jsonPath);
        if (fs.existsSync(jsonPath)) {
          const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

          // If arrayPath is specified, extract the array from nested structure
          let items: any[];
          if (discovery.arrayPath) {
            const extracted = this.getNestedValue(data, discovery.arrayPath);
            items = Array.isArray(extracted) ? extracted : [extracted];
          } else {
            // Handle arrays or objects at top level
            items = Array.isArray(data) ? data : [data];
          }

          for (const item of items) {
            const hostname = this.getNestedValue(item, discovery.hostnameField || "hostname");
            if (hostname) {
              // Extract additional metadata fields if configured
              const metadata: Record<string, any> = { ...item };

              // Store UUID if configured (for path matching)
              if (discovery.uuidField) {
                const uuid = this.getNestedValue(item, discovery.uuidField);
                if (uuid) {
                  metadata.uuid = uuid;
                }
              }

              // Store network name if configured
              if (discovery.nameField) {
                const name = this.getNestedValue(item, discovery.nameField);
                if (name) {
                  metadata.name = name;
                }
              }

              servers.push({ hostname, metadata });
            }
          }
        }
        break;

      case "sqlite":
        this.log("SQLite discovery not yet implemented");
        break;
    }

    return servers;
  }


  parseLine(line: string, context: Partial<MessageContext>): MessageContext | null {
    // Skip empty lines
    if (!line.trim()) {
      return null;
    }

    // Sort rules by priority
    const rules = [...this.config.parserRules].sort(
      (a, b) => (b.priority || 0) - (a.priority || 0),
    );

    // Try each parser rule
    for (const rule of rules) {
      const regex = new RegExp(rule.pattern, rule.flags || "");
      const match = line.match(regex);

      if (!match) {
        continue;
      }

      // If this rule is marked as skip, return null
      if (rule.skip) {
        return null;
      }

      // Build message context from captures
      const msgContext: MessageContext = {
        raw: {
          line,
          timestamp: match[0], // Will be overridden if timestamp capture exists
        },
        client: context.client!,
        server: context.server || {},
        target: context.target,
        timestamp: new Date(),
        metadata: context.metadata || {},
      };

      // Extract captures
      if (rule.captures) {
        // Timestamp
        if (rule.captures.timestamp && match.groups?.[rule.captures.timestamp]) {
          const timestampStr = match.groups[rule.captures.timestamp];
          msgContext.raw.timestamp = timestampStr;
          msgContext.timestamp = new Date(timestampStr);
        }

        // Sender information
        const nickname = rule.captures.nickname && match.groups?.[rule.captures.nickname];
        const username = rule.captures.username && match.groups?.[rule.captures.username];
        const hostname = rule.captures.hostname && match.groups?.[rule.captures.hostname];

        if (nickname) {
          msgContext.sender = {
            nickname,
            username: username || undefined,
            hostname: hostname || undefined,
          };
        }

        // Message content
        if (rule.captures.content && match.groups?.[rule.captures.content]) {
          msgContext.message = {
            content: match.groups[rule.captures.content],
            type: (rule.messageType as any) || "unknown",
            raw: line,
          };
        }

        // Target
        if (rule.captures.target && match.groups?.[rule.captures.target]) {
          msgContext.target = {
            name: match.groups[rule.captures.target],
            type: msgContext.target?.type || "channel",
          };
        }

        // Additional captures go to metadata
        for (const [key, captureName] of Object.entries(rule.captures)) {
          if (
            !["timestamp", "nickname", "username", "hostname", "content", "target"].includes(key)
          ) {
            if (match.groups?.[captureName!]) {
              msgContext.metadata[key] = match.groups[captureName!];
            }
          }
        }
      }

      // If no message was set but messageType is defined, create default message
      if (!msgContext.message && rule.messageType) {
        msgContext.message = {
          content: line,
          type: (rule.messageType as any) || "unknown",
        };
      }

      return msgContext;
    }

    // No rules matched
    return null;
  }

  async getLogPaths(): Promise<string[]> {
    const paths: string[] = [];
    const discovery = this.config.discovery;

    // Get all pattern types
    const patterns = [
      discovery.patterns.console,
      discovery.patterns.channels,
      discovery.patterns.queries,
    ].filter(Boolean) as string[];

    for (const pattern of patterns) {
      const files = await glob(pattern, {
        cwd: this.config.logDirectory,
        absolute: true,
      });
      paths.push(...files);
    }

    return paths;
  }

  extractContextFromPath(filePath: string): Partial<MessageContext> {
    const context: Partial<MessageContext> = {
      client: {
        id: this.config.id,
        type: this.config.id,
        name: this.config.name,
        metadata: this.config.metadata || {},
      },
      server: {},
      metadata: {},
    };

    const extraction = this.config.discovery.pathExtraction;

    // Extract server identifier from path
    if (extraction.serverPattern) {
      const regex = new RegExp(extraction.serverPattern);
      const match = filePath.match(regex);
      if (this.debug) {
        this.log(`Extracting server from path: ${filePath}`);
        this.log(`Pattern: ${extraction.serverPattern}`);
        this.log(`Match:`, match);
      }
      if (match && extraction.serverGroup !== undefined) {
        context.metadata!.serverIdentifier = match[extraction.serverGroup];
        if (this.debug) {
          this.log(`Server identifier extracted: ${context.metadata!.serverIdentifier}`);
        }
      }
    }

    // Extract hostname from file if available in cache, or discover it
    let hostname = this.fileHostnameCache.get(filePath);
    if (!hostname && this.config.serverDiscovery?.type === "filesystem") {
      // Try to discover hostname from file content
      const discovery = this.config.serverDiscovery;
      if (discovery.hostnamePattern && fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, "utf-8");
          const regex = new RegExp(discovery.hostnamePattern);
          const match = content.match(regex);
          if (match && discovery.hostnameGroup !== undefined) {
            hostname = match[discovery.hostnameGroup];
            this.fileHostnameCache.set(filePath, hostname);
            if (this.debug) {
              this.log(`Discovered hostname from file ${filePath}: ${hostname}`);
            }
          }
        } catch (error) {
          if (this.debug) {
            this.log(`Failed to read file for hostname discovery: ${filePath}`, error);
          }
        }
      }
    }

    if (hostname) {
      context.metadata!.serverHostname = hostname;
      if (this.debug) {
        this.log(`Server hostname: ${hostname}`);
      }
    }

    // If hostname still not resolved but we have a serverIdentifier, use directoryHostnameMap
    if (!context.metadata!.serverHostname && context.metadata!.serverIdentifier) {
      const dirName = context.metadata!.serverIdentifier;
      const mapped = this.directoryHostnameMap.get(dirName);
      if (mapped) {
        context.metadata!.serverHostname = mapped;
        if (this.debug) {
          this.log(`Resolved hostname from directoryHostnameMap: ${mapped}`);
        }
      }
    }

    // For JSON/SQLite discovery (e.g., TheLounge), match serverIdentifier to discovered servers
    if (!hostname && context.metadata!.serverIdentifier && this.discoveredServers.length > 0) {
      const identifier = context.metadata!.serverIdentifier;

      // Try to match by UUID (full or partial)
      for (const server of this.discoveredServers) {
        if (server.metadata?.uuid) {
          const uuid = server.metadata.uuid.toString();

          // Check for full UUID match
          if (identifier.includes(uuid)) {
            context.metadata!.serverHostname = server.hostname;
            if (this.debug) {
              this.log(`Matched server by full UUID: ${server.hostname}`);
            }
            break;
          }

          // Check for partial UUID match (e.g., TheLounge uses last 3 segments)
          // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
          // TheLounge dirs: hostname-x-xxxx-xxxx-xxxxxxxxxxxx (last 3 segments)
          const uuidSegments = uuid.split("-");
          if (uuidSegments.length === 5) {
            const partialUuid = uuidSegments.slice(2).join("-"); // Last 3 segments
            if (identifier.includes(partialUuid)) {
              context.metadata!.serverHostname = server.hostname;
              if (this.debug) {
                this.log(`Matched server by partial UUID: ${server.hostname}`);
              }
              break;
            }
          }
        }
      }
    }

    // Check for console
    if (extraction.consolePattern) {
      const regex = new RegExp(extraction.consolePattern);
      if (regex.test(filePath)) {
        context.target = {
          name: "Console",
          type: "console",
        };
        return context;
      }
    }

    // Extract channel name
    if (extraction.channelPattern) {
      const regex = new RegExp(extraction.channelPattern);
      const match = filePath.match(regex);
      if (match && extraction.channelGroup !== undefined) {
        context.target = {
          name: match[extraction.channelGroup],
          type: "channel",
        };
        return context;
      }
    }

    // Extract query/user name
    if (extraction.queryPattern) {
      const regex = new RegExp(extraction.queryPattern);
      const match = filePath.match(regex);
      if (match && extraction.queryGroup !== undefined) {
        context.target = {
          name: match[extraction.queryGroup],
          type: "query",
        };
        return context;
      }
    }

    return context;
  }

  async destroy(): Promise<void> {
    // Default: no cleanup needed
  }

  /**
   * Get the list of servers discovered by this client
   */
  getDiscoveredServers(): Array<{ hostname: string; metadata?: Record<string, any> }> {
    return this.discoveredServers;
  }

  protected log(...args: any[]): void {
    if (this.debug) {
      console.log(`[${this.config.id}]`, ...args);
    }
  }

  private getNestedValue(obj: any, path: string): any {
    const keys = path.split(".");
    let current = obj;

    for (const key of keys) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[key];
    }

    return current;
  }
}
