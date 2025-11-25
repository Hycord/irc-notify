import { EventConfig, MessageContext, ServerConfig } from "../types";
import { FilterEngine } from "../utils/filters";

/**
 * Event processor handles matching events against message contexts
 */
export class EventProcessor {
  private events: EventConfig[];
  private servers: Map<string, ServerConfig>;
  private debug: boolean;

  constructor(events: EventConfig[], servers: ServerConfig[], debug: boolean = false) {
    // Sort events by priority (highest first)
    this.events = events
      .filter((e) => e.enabled)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    this.servers = new Map(servers.filter((s) => s.enabled).map((s) => [s.id, s]));
    this.debug = debug;
  }

  /**
   * Process a message context and return matching events
   */
  processMessage(context: MessageContext): EventConfig[] {
    const matchedEvents: EventConfig[] = [];

    // Enrich context with server information
    this.enrichContext(context);

    // Check if this is from dev client
    const isDevClient = context.client.id === "dev-textual";

    for (const event of this.events) {
      if (this.matchesEvent(context, event)) {
        // Override sinks for dev client
        if (isDevClient) {
          const devEvent = { ...event, sinkIds: ["dev-sink-override"] };
          matchedEvents.push(devEvent);
        } else {
          matchedEvents.push(event);
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
      if (!matchesAllServers && !event.serverIds.includes(context.server.id)) {
        return false;
      }
    }

    // Check custom filters
    if (event.filters) {
      return FilterEngine.evaluate(event.filters, context);
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
        Array.from(this.servers.values()).map((s) => ({ id: s.id, displayName: s.displayName })),
      );
    }

    // Match server by serverIdentifier from path metadata
    if (context.metadata.serverIdentifier) {
      // Try matching by displayName first
      for (const server of this.servers.values()) {
        if (server.displayName === context.metadata.serverIdentifier) {
          matchedServer = server;
          if (this.debug) {
            console.log("[EventProcessor] Matched server by displayName:", server.id);
          }
          break;
        }
      }

      // Try matching by ID (case-insensitive)
      if (!matchedServer) {
        matchedServer = this.servers.get(context.metadata.serverIdentifier.toLowerCase());
        if (matchedServer && this.debug) {
          console.log("[EventProcessor] Matched server by ID:", matchedServer.id);
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

      // Enrich sender information
      if (context.sender && matchedServer.users) {
        const userInfo = matchedServer.users[context.sender.nickname];
        if (userInfo) {
          context.sender.realname = userInfo.realname || context.sender.realname;
          context.sender.modes = userInfo.modes || context.sender.modes;
          context.metadata = { ...context.metadata, ...userInfo.metadata };
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
    this.servers = new Map(servers.filter((s) => s.enabled).map((s) => [s.id, s]));
  }

  private log(...args: any[]): void {
    if (this.debug) {
      console.log("[EventProcessor]", ...args);
    }
  }
}
