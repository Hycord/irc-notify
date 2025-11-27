import { EventConfig, MessageContext, ServerConfig } from "../types";
import { FilterEngine } from "../utils/filters";
import { TemplateEngine } from "../utils/template";

/**
 * Event processor handles matching events against message contexts
 */
export class EventProcessor {
  private events: EventConfig[];
  private servers: Map<string, ServerConfig>; // includes enabled and disabled
  private debug: boolean;

  constructor(events: EventConfig[], servers: ServerConfig[], debug: boolean = false) {
    // Sort events by priority (highest first)
    const disabledEvents = events.filter((e) => !e.enabled);
    this.events = events
      .filter((e) => e.enabled)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    const disabledServers = servers.filter((s) => !s.enabled);
    // Maintain all servers (enabled and disabled) to correctly enrich context,
    // then drop later if the matched server is disabled.
    this.servers = new Map(servers.map((s) => [s.id, s]));
    this.debug = debug;

    if (debug && disabledEvents.length > 0) {
      console.log(
        `EventProcessor: Filtered out ${
          disabledEvents.length
        } disabled events: ${disabledEvents.map((e) => e.id).join(", ")}`,
      );
    }
    if (debug && disabledServers.length > 0) {
      console.log(
        `EventProcessor: ${disabledServers.length} servers are disabled: ${disabledServers
          .map((s) => s.id)
          .join(", ")}`,
      );
    }
  }

  /**
   * Process a message context and return matching events
   */
  processMessage(context: MessageContext): EventConfig[] {
    const matchedEvents: EventConfig[] = [];

    // Enrich context with server information
    this.enrichContext(context);

    // Drop if the matched server exists and is disabled
    if (context.server.id) {
      const srv = this.servers.get(context.server.id);
      if (srv && !srv.enabled) {
        this.log(`Dropping message: matched disabled server '${srv.id}' (${srv.displayName})`);
        return [];
      }
    }

    // Check if this is from dev client
    const isDevClient = context.client.id === "dev-textual";

    for (const event of this.events) {
      if (this.matchesEvent(context, event)) {
        // Process all metadata through templates to support {{variables}} anywhere
        const processedEvent = {
          ...event,
          metadata: event.metadata
            ? TemplateEngine.processDeep(event.metadata, context)
            : undefined,
        };

        // Override sinks for dev client
        if (isDevClient) {
          const devEvent = { ...processedEvent, sinkIds: ["dev-sink-override"] };
          matchedEvents.push(devEvent);
        } else {
          matchedEvents.push(processedEvent);
        }
        this.log(`Event matched: ${event.name} (${event.id})`);
      }
    }

    return matchedEvents;
  }

  /**
   * Check if a message context matches an event
   */
  private matchesEvent(context: MessageContext, event: EventConfig): boolean {
    // Check base event type
    if (!this.matchesBaseEvent(context, event)) {
      return false;
    }

    // Check server filter
    if (event.serverIds.length > 0 && context.server.id) {
      // '*' applies to all servers
      const matchesAllServers = event.serverIds.includes("*");
      const matchesSpecificServer = event.serverIds.includes(context.server.id);

      if (this.debug) {
        console.log(`  Server filter check for event '${event.id}':`);
        console.log(`    - serverIds: [${event.serverIds.join(", ")}]`);
        console.log(`    - context.server.id: ${context.server.id}`);
        console.log(`    - matches wildcard (*): ${matchesAllServers}`);
        console.log(`    - matches specific server: ${matchesSpecificServer}`);
      }

      if (!matchesAllServers && !matchesSpecificServer) {
        if (this.debug) {
          console.log(
            `  ✗ Event '${event.id}' rejected: server '${context.server.id}' not in serverIds`,
          );
        }
        return false;
      }
    }

    // Check custom filters
    if (event.filters) {
      const filterResult = FilterEngine.evaluate(event.filters, context, this.debug);
      if (this.debug) {
        console.log(`  Filter evaluation for event '${event.id}': ${filterResult}`);
      }
      return filterResult;
    }

    return true;
  }

  /**
   * Check if message type matches base event
   */
  private matchesBaseEvent(context: MessageContext, event: EventConfig): boolean {
    if (event.baseEvent === "any") {
      return true;
    }

    if (!context.message) {
      return false;
    }

    // Map base event types to message types
    const typeMapping: Record<string, string[]> = {
      message: ["privmsg", "notice"],
      join: ["join"],
      part: ["part"],
      quit: ["quit"],
      nick: ["nick"],
      kick: ["kick"],
      mode: ["mode"],
      topic: ["topic"],
      connect: ["system"], // Would need more specific parsing
      disconnect: ["system"], // Would need more specific parsing
    };

    const validTypes = typeMapping[event.baseEvent] || [];
    return validTypes.includes(context.message.type);
  }

  /**
   * Enrich message context with server information
   */
  private enrichContext(context: MessageContext): void {
    let matchedServer: ServerConfig | undefined;

    if (this.debug) {
      console.log("[EventProcessor] Enriching context");
      console.log(
        "[EventProcessor] Server identifier from metadata:",
        context.metadata.serverIdentifier,
      );
      console.log(
        "[EventProcessor] Available servers:",
        Array.from(this.servers.values()).map((s) => ({
          id: s.id,
          displayName: s.displayName,
        })),
      );
    }

    // Try matching by hostname first (most reliable)
    if (context.metadata.serverHostname) {
      const hostname = context.metadata.serverHostname;
      for (const server of this.servers.values()) {
        if (server.hostname === hostname) {
          matchedServer = server;
          if (this.debug) {
            console.log("[EventProcessor] Matched server by hostname:", server.id);
          }
          break;
        }
      }
    }

    // Fall back to matching by serverIdentifier from path metadata
    if (!matchedServer && context.metadata.serverIdentifier) {
      const identifier = context.metadata.serverIdentifier;

      // Try matching by discovery metadata UUID (for clients like TheLounge)
      for (const server of this.servers.values()) {
        if (server.metadata?.uuid) {
          const uuid = server.metadata.uuid.toString();
          // Full UUID match
          if (identifier.includes(uuid) || uuid.includes(identifier)) {
            matchedServer = server;
            if (this.debug) {
              console.log("[EventProcessor] Matched server by full UUID:", server.id);
            }
            break;
          }
          // Partial UUID match (e.g., TheLounge uses last 3 segments: "1-43cf-a953-c9732c60cc42")
          // Extract segments and check if identifier ends with the last 3 UUID segments
          const uuidSegments = uuid.split("-");
          if (uuidSegments.length === 5) {
            const partialUuid = uuidSegments.slice(2).join("-"); // Last 3 segments
            if (identifier.includes(partialUuid)) {
              matchedServer = server;
              if (this.debug) {
                console.log("[EventProcessor] Matched server by partial UUID:", server.id);
              }
              break;
            }
          }
        }
      }

      // Try matching by displayName (exact match, case-insensitive)
      if (!matchedServer) {
        for (const server of this.servers.values()) {
          if (server.displayName?.toLowerCase() === identifier.toLowerCase()) {
            matchedServer = server;
            if (this.debug) {
              console.log("[EventProcessor] Matched server by displayName:", server.id);
            }
            break;
          }
        }
      }

      // Try matching by ID (case-insensitive)
      if (!matchedServer) {
        matchedServer = this.servers.get(identifier.toLowerCase());
        if (matchedServer && this.debug) {
          console.log("[EventProcessor] Matched server by ID:", matchedServer.id);
        }
      }

      // Try partial matching on displayName (case-insensitive, starts with)
      if (!matchedServer) {
        for (const server of this.servers.values()) {
          if (server.displayName?.toLowerCase().startsWith(identifier.toLowerCase())) {
            matchedServer = server;
            if (this.debug) {
              console.log("[EventProcessor] Matched server by displayName prefix:", server.id);
            }
            break;
          }
        }
      }

      // Try partial matching on ID (case-insensitive, contains)
      if (!matchedServer) {
        for (const server of this.servers.values()) {
          if (server.id.toLowerCase().includes(identifier.toLowerCase())) {
            matchedServer = server;
            if (this.debug) {
              console.log("[EventProcessor] Matched server by ID substring:", server.id);
            }
            break;
          }
        }
      }
    }

    // Apply matched server info to context
    if (matchedServer) {
      context.server.id = matchedServer.id;
      context.server.hostname = matchedServer.hostname;
      context.server.displayName = matchedServer.displayName;
      context.server.clientNickname = matchedServer.clientNickname;
      context.server.network = matchedServer.network;
      context.server.port = matchedServer.port;
      context.server.metadata = matchedServer.metadata || {};

      // Merge server metadata into top-level context metadata
      context.metadata = {
        ...context.metadata,
        serverId: matchedServer.id,
        serverDisplayName: matchedServer.displayName,
        serverHostname: matchedServer.hostname,
        ...matchedServer.metadata,
      };

      // Enrich sender information
      if (context.sender && matchedServer.users) {
        const userInfo = matchedServer.users[context.sender.nickname];
        if (userInfo) {
          context.sender.realname = userInfo.realname || context.sender.realname;
          context.sender.modes = userInfo.modes || context.sender.modes;
          // Merge user metadata (user metadata takes precedence over server metadata)
          if (userInfo.metadata) {
            context.metadata = { ...context.metadata, ...userInfo.metadata };
          }
        }
      }
    }
  }

  /**
   * Update events configuration
   */
  updateEvents(events: EventConfig[]): void {
    this.events = events
      .filter((e) => e.enabled)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * Update servers configuration
   */
  updateServers(servers: ServerConfig[]): void {
    // Keep all servers so we can detect disabled server matches and drop events
    this.servers = new Map(servers.map((s) => [s.id, s]));
  }

  private log(...args: any[]): void {
    if (this.debug) {
      console.log("[EventProcessor]", ...args);
    }
  }
}
