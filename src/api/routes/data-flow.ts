/**
 * Data Flow Route Handler
 *
 * GET /api/data-flow
 *
 * Returns a comprehensive view of how data flows through the system
 * based on the currently loaded configuration. This includes all routing logic,
 * filter conditions, parser rules, and metadata that the server uses at runtime.
 *
 * This endpoint provides a "server's eye view" of the configuration,
 * showing exactly what the orchestrator sees and how messages would be routed.
 */

import { GenericClientAdapter } from "../../adapters/generic";
import type {
  ClientConfig,
  EventConfig,
  FilterConfig,
  FilterGroup,
  ParserRule,
  ServerConfig,
  SinkConfig,
} from "../../types";
import type { RouteHandler } from "../types";
import { json } from "../utils";

/**
 * Detailed representation of a parser rule with computed metadata
 */
interface DataFlowParserRule {
  name: string;
  pattern: string;
  flags?: string;
  messageType?: string;
  priority: number;
  skip: boolean;
  captureFields: string[];
  hasTimestamp: boolean;
  hasNickname: boolean;
  hasContent: boolean;
  hasTarget: boolean;
}

/**
 * Detailed representation of a filter with expanded metadata
 */
interface DataFlowFilter {
  type: "simple" | "group";
  field?: string;
  operator?: string;
  value?: any;
  pattern?: string;
  flags?: string;
  groupOperator?: "AND" | "OR";
  filters?: DataFlowFilter[];
  usesTemplates: boolean;
  targetedFields: string[];
}

/**
 * Detailed representation of a client adapter
 */
interface DataFlowClient {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  logDirectory: string;
  discoveryPatterns: {
    console?: string;
    channels?: string;
    queries?: string;
  };
  pathExtraction: {
    serverPattern?: string;
    serverGroup?: number;
    channelPattern?: string;
    channelGroup?: number;
    queryPattern?: string;
    queryGroup?: number;
  };
  serverDiscoveryType: string;
  fileType: string;
  pollInterval?: number;
  parserRules: DataFlowParserRule[];
  totalParserRules: number;
  skipRules: number;
  metadata?: Record<string, any>;
}

/**
 * Detailed representation of a server
 */
interface DataFlowServer {
  id: string;
  hostname: string;
  displayName: string;
  clientNickname: string;
  network?: string;
  port?: number;
  enabled: boolean;
  clientIds: string[]; // Client IDs that discovered/monitor this server
  clientNames: string[]; // Client names for display
  usersCount: number;
  users?: Array<{
    nickname: string;
    realname?: string;
    modes?: string[];
    hasMetadata: boolean;
  }>;
  metadata?: Record<string, any>;
}

/**
 * Detailed representation of a sink
 */
interface DataFlowSink {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  hasRateLimit: boolean;
  rateLimit?: {
    maxPerMinute?: number;
    maxPerHour?: number;
  };
  hasTemplate: boolean;
  templateFormat?: string;
  templateFields?: string[];
  allowedMetadata?: string[];
  hasPayloadTransforms: boolean;
  payloadTransformsCount: number;
  config: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * Detailed representation of an event with routing information
 */
interface DataFlowEvent {
  id: string;
  name: string;
  enabled: boolean;
  baseEvent: string;
  priority: number;
  group?: string;
  serverIds: string[];
  serverIdType: "wildcard" | "specific" | "empty";
  appliesToAllServers: boolean;
  serverCount: number;
  hasFilters: boolean;
  filterComplexity?: number;
  filters?: DataFlowFilter;
  sinkIds: string[];
  sinkCount: number;
  hasMetadata: boolean;
  metadataKeys?: string[];
  usesTemplatesInMetadata: boolean;
  metadata?: Record<string, any>;
}

/**
 * A routing path showing how a message flows from client to sinks
 */
interface DataFlowRoutingPath {
  clientId: string;
  clientName: string;
  clientEnabled: boolean;
  serverId: string;
  serverName: string;
  serverEnabled: boolean;
  eventId: string;
  eventName: string;
  eventEnabled: boolean;
  eventPriority: number;
  baseEvent: string;
  hasFilters: boolean;
  filterSummary?: string;
  sinkIds: string[];
  sinkNames: string[];
  sinkStatuses: Array<{ id: string; name: string; enabled: boolean }>;
  enabled: boolean;
}

/**
 * Statistics about the data flow configuration
 */
interface DataFlowStats {
  totalClients: number;
  enabledClients: number;
  totalServers: number;
  enabledServers: number;
  totalEvents: number;
  enabledEvents: number;
  totalSinks: number;
  enabledSinks: number;
  totalParserRules: number;
  totalRoutingPaths: number;
  enabledRoutingPaths: number;
  disabledRoutingPaths: number;
  eventsWithFilters: number;
  eventsWithWildcardServers: number;
  sinksWithRateLimit: number;
  sinksWithTemplates: number;
}

/**
 * Complete data flow representation
 */
interface DataFlowResponse {
  timestamp: string;
  configDirectory: string;
  running: boolean;
  stats: DataFlowStats;
  clients: DataFlowClient[];
  servers: DataFlowServer[];
  sinks: DataFlowSink[];
  events: DataFlowEvent[];
  routingPaths: DataFlowRoutingPath[];
  messageTypeMapping: Record<string, string[]>;
}

/**
 * Analyze a parser rule and extract metadata
 */
function analyzeParserRule(rule: ParserRule): DataFlowParserRule {
  const captures = rule.captures || {};
  const captureFields = Object.keys(captures);

  return {
    name: rule.name,
    pattern: rule.pattern,
    flags: rule.flags,
    messageType: rule.messageType,
    priority: rule.priority ?? 0,
    skip: rule.skip ?? false,
    captureFields,
    hasTimestamp: !!captures.timestamp,
    hasNickname: !!captures.nickname,
    hasContent: !!captures.content,
    hasTarget: !!captures.target,
  };
}

/**
 * Analyze a filter and extract metadata
 */
function analyzeFilter(filter: FilterConfig | FilterGroup): DataFlowFilter {
  if ("operator" in filter && (filter.operator === "AND" || filter.operator === "OR")) {
    // It's a filter group
    const group = filter as FilterGroup;
    const subFilters = group.filters.map(analyzeFilter);
    const allFields = subFilters.flatMap((f) => f.targetedFields);
    const usesTemplates = subFilters.some((f) => f.usesTemplates);

    return {
      type: "group",
      groupOperator: group.operator,
      filters: subFilters,
      usesTemplates,
      targetedFields: [...new Set(allFields)],
    };
  } else {
    // It's a simple filter
    const simpleFilter = filter as FilterConfig;
    const usesTemplates =
      typeof simpleFilter.value === "string" && /\{\{.*?\}\}/.test(simpleFilter.value);

    return {
      type: "simple",
      field: simpleFilter.field,
      operator: simpleFilter.operator,
      value: simpleFilter.value,
      pattern: simpleFilter.pattern,
      flags: simpleFilter.flags,
      usesTemplates,
      targetedFields: [simpleFilter.field],
    };
  }
}

/**
 * Calculate filter complexity (depth + number of conditions)
 */
function calculateFilterComplexity(filter: DataFlowFilter, depth = 0): number {
  if (filter.type === "simple") {
    return depth + 1;
  }

  if (filter.filters) {
    return filter.filters.reduce((sum, f) => sum + calculateFilterComplexity(f, depth + 1), depth);
  }

  return depth;
}

/**
 * Generate a human-readable filter summary
 */
function generateFilterSummary(filter: DataFlowFilter): string {
  if (filter.type === "simple") {
    const value = filter.pattern || filter.value;
    return `${filter.field} ${filter.operator} ${JSON.stringify(value)}`;
  }

  if (filter.filters && filter.filters.length > 0) {
    const parts = filter.filters.map(generateFilterSummary);
    return `(${parts.join(` ${filter.groupOperator} `)})`;
  }

  return "";
}

/**
 * Analyze a client configuration
 */
function analyzeClient(client: ClientConfig): DataFlowClient {
  const parserRules = client.parserRules.map(analyzeParserRule);
  const skipRules = parserRules.filter((r) => r.skip).length;

  return {
    id: client.id,
    type: client.type || client.id,
    name: client.name,
    enabled: client.enabled,
    logDirectory: client.logDirectory,
    discoveryPatterns: client.discovery.patterns,
    pathExtraction: client.discovery.pathExtraction,
    serverDiscoveryType: client.serverDiscovery.type,
    fileType: client.fileType.type,
    pollInterval: client.fileType.pollInterval,
    parserRules,
    totalParserRules: parserRules.length,
    skipRules,
    metadata: client.metadata,
  };
}

/**
 * Analyze a server configuration with client associations
 */
function analyzeServer(
  server: ServerConfig,
  clientIds: string[],
  clientNames: string[],
): DataFlowServer {
  const users = server.users
    ? Object.entries(server.users).map(([nickname, userInfo]) => ({
        nickname,
        realname: userInfo.realname,
        modes: userInfo.modes,
        hasMetadata: !!userInfo.metadata && Object.keys(userInfo.metadata).length > 0,
      }))
    : [];

  return {
    id: server.id,
    hostname: server.hostname,
    displayName: server.displayName,
    clientNickname: server.clientNickname,
    network: server.network,
    port: server.port,
    enabled: server.enabled,
    clientIds,
    clientNames,
    usersCount: users.length,
    users: users.length > 0 ? users : undefined,
    metadata: server.metadata,
  };
}

/**
 * Extract template fields from a string
 */
function extractTemplateFields(str: string): string[] {
  const matches = str.match(/\{\{(.*?)\}\}/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(2, -2).trim());
}

/**
 * Recursively find template fields in an object
 */
function extractTemplateFieldsDeep(obj: any): string[] {
  const fields: string[] = [];

  if (typeof obj === "string") {
    fields.push(...extractTemplateFields(obj));
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      fields.push(...extractTemplateFieldsDeep(item));
    }
  } else if (obj && typeof obj === "object") {
    for (const value of Object.values(obj)) {
      fields.push(...extractTemplateFieldsDeep(value));
    }
  }

  return [...new Set(fields)];
}

/**
 * Analyze a sink configuration
 */
function analyzeSink(sink: SinkConfig): DataFlowSink {
  const hasRateLimit = !!(sink.rateLimit?.maxPerMinute || sink.rateLimit?.maxPerHour);
  const hasTemplate = !!sink.template;
  const templateFields = hasTemplate
    ? [
        ...(sink.template?.title ? extractTemplateFields(sink.template.title) : []),
        ...(sink.template?.body ? extractTemplateFields(sink.template.body) : []),
      ]
    : [];

  return {
    id: sink.id,
    type: sink.type,
    name: sink.name,
    enabled: sink.enabled,
    hasRateLimit,
    rateLimit: hasRateLimit ? sink.rateLimit : undefined,
    hasTemplate,
    templateFormat: sink.template?.format,
    templateFields: templateFields.length > 0 ? [...new Set(templateFields)] : undefined,
    allowedMetadata: sink.allowedMetadata,
    hasPayloadTransforms: !!(sink.payloadTransforms && sink.payloadTransforms.length > 0),
    payloadTransformsCount: sink.payloadTransforms?.length ?? 0,
    config: sink.config,
    metadata: sink.metadata,
  };
}

/**
 * Analyze an event configuration
 */
function analyzeEvent(event: EventConfig): DataFlowEvent {
  const hasFilters = !!event.filters;
  const filters = hasFilters ? analyzeFilter(event.filters!) : undefined;
  const filterComplexity = filters ? calculateFilterComplexity(filters) : undefined;
  const appliesToAllServers = event.serverIds.includes("*");
  const serverIdType: "wildcard" | "specific" | "empty" =
    event.serverIds.length === 0 ? "empty" : appliesToAllServers ? "wildcard" : "specific";

  const metadataKeys = event.metadata ? Object.keys(event.metadata) : undefined;
  const usesTemplatesInMetadata = event.metadata
    ? extractTemplateFieldsDeep(event.metadata).length > 0
    : false;

  return {
    id: event.id,
    name: event.name,
    enabled: event.enabled,
    baseEvent: event.baseEvent,
    priority: event.priority ?? 0,
    group: event.group,
    serverIds: event.serverIds,
    serverIdType,
    appliesToAllServers,
    serverCount: event.serverIds.length,
    hasFilters,
    filterComplexity,
    filters,
    sinkIds: event.sinkIds,
    sinkCount: event.sinkIds.length,
    hasMetadata: !!event.metadata && Object.keys(event.metadata).length > 0,
    metadataKeys,
    usesTemplatesInMetadata,
    metadata: event.metadata,
  };
}

/**
 * Generate all possible routing paths
 */
function generateRoutingPaths(
  clients: DataFlowClient[],
  servers: DataFlowServer[],
  events: DataFlowEvent[],
  sinks: DataFlowSink[],
): DataFlowRoutingPath[] {
  const paths: DataFlowRoutingPath[] = [];
  const sinkMap = new Map(sinks.map((s) => [s.id, s]));

  // Generate paths for ALL events (enabled and disabled)
  for (const event of events) {
    // Get applicable servers (include all, not just enabled)
    let applicableServers: DataFlowServer[];
    if (event.appliesToAllServers) {
      applicableServers = servers; // All servers
    } else if (event.serverIds.length > 0) {
      applicableServers = servers.filter((s) => event.serverIds.includes(s.id));
    } else {
      // Event has no server filter - applies to all servers
      applicableServers = servers;
    }

    // For each applicable server, create paths through all clients
    for (const server of applicableServers) {
      // All clients can potentially emit messages for this server
      for (const client of clients) {
        // Get sink information with enabled status
        const sinkStatuses = event.sinkIds
          .map((id) => {
            const sink = sinkMap.get(id);
            return sink ? { id: sink.id, name: sink.name, enabled: sink.enabled } : null;
          })
          .filter((s): s is { id: string; name: string; enabled: boolean } => s !== null);

        const sinkNames = sinkStatuses.map((s) => s.name);

        const filterSummary = event.filters ? generateFilterSummary(event.filters) : undefined;

        // Path is only enabled if ALL components are enabled
        const pathEnabled =
          client.enabled &&
          server.enabled &&
          event.enabled &&
          sinkStatuses.length > 0 &&
          sinkStatuses.some((s) => s.enabled);

        paths.push({
          clientId: client.id,
          clientName: client.name,
          clientEnabled: client.enabled,
          serverId: server.id,
          serverName: server.displayName,
          serverEnabled: server.enabled,
          eventId: event.id,
          eventName: event.name,
          eventEnabled: event.enabled,
          eventPriority: event.priority,
          baseEvent: event.baseEvent,
          hasFilters: event.hasFilters,
          filterSummary,
          sinkIds: event.sinkIds,
          sinkNames,
          sinkStatuses,
          enabled: pathEnabled,
        });
      }
    }
  }

  // Sort by priority (highest first), then by event name
  return paths.sort((a, b) => {
    if (a.eventPriority !== b.eventPriority) {
      return b.eventPriority - a.eventPriority;
    }
    return a.eventName.localeCompare(b.eventName);
  });
}

/**
 * Data flow endpoint handler
 */
export const dataFlowHandler: RouteHandler = async (req, context) => {
  const status = context.orchestrator.getStatus();

  // Get raw configs from orchestrator
  const clientConfigs = context.orchestrator.getClientConfigs();
  const serverConfigs = context.orchestrator.getServerConfigs();
  const eventConfigs = context.orchestrator.getEventConfigs();
  const sinkConfigs = context.orchestrator.getSinkConfigs();

  // Analyze all components
  const clients = clientConfigs.map(analyzeClient);

  // Map servers to clients based on actual discovery
  // Get client instances to check what servers they actually discovered
  const clientInstances = context.orchestrator.getClientInstances();
  const serverClientMap = new Map<string, { clientIds: string[]; clientNames: string[] }>();

  // For disabled clients, we need to temporarily discover their servers
  const tempClients = new Map<string, GenericClientAdapter>();

  for (const clientConfig of clientConfigs) {
    if (!clientInstances.has(clientConfig.id)) {
      // Client not initialized (disabled), temporarily initialize for discovery
      try {
        const tempAdapter = new GenericClientAdapter(clientConfig, false);
        await tempAdapter.initialize();
        tempClients.set(clientConfig.id, tempAdapter);
      } catch (error) {
        // Silently fail - client may have invalid paths, etc.
      }
    }
  }

  for (const server of serverConfigs) {
    const associatedClients: string[] = [];
    const associatedClientNames: string[] = [];

    for (const clientConfig of clientConfigs) {
      // Check both initialized and temporarily discovered clients
      const clientInstance =
        clientInstances.get(clientConfig.id) || tempClients.get(clientConfig.id);

      if (!clientInstance) {
        // Client not available
        continue;
      }

      // Get the servers discovered by this client
      const discoveredServers = clientInstance.getDiscoveredServers();

      // Check if this server matches any discovered server
      // Match by hostname (case-insensitive)
      const serverHostnameLower = server.hostname.toLowerCase();
      const isDiscovered = discoveredServers.some(
        (ds) => ds.hostname.toLowerCase() === serverHostnameLower,
      );

      if (isDiscovered) {
        associatedClients.push(clientConfig.id);
        associatedClientNames.push(clientConfig.name);
      }
    }

    serverClientMap.set(server.id, {
      clientIds: associatedClients,
      clientNames: associatedClientNames,
    });
  }

  const servers = serverConfigs.map((server) => {
    const associations = serverClientMap.get(server.id) || { clientIds: [], clientNames: [] };
    return analyzeServer(server, associations.clientIds, associations.clientNames);
  });

  const sinks = sinkConfigs.map(analyzeSink);
  const events = eventConfigs.map(analyzeEvent);

  // Generate routing paths (include all components, enabled and disabled)
  const routingPaths = generateRoutingPaths(clients, servers, events, sinks);

  // Calculate statistics
  const stats: DataFlowStats = {
    totalClients: clients.length,
    enabledClients: clients.filter((c) => c.enabled).length,
    totalServers: servers.length,
    enabledServers: servers.filter((s) => s.enabled).length,
    totalEvents: events.length,
    enabledEvents: events.filter((e) => e.enabled).length,
    totalSinks: sinks.length,
    enabledSinks: sinks.filter((s) => s.enabled).length,
    totalParserRules: clients.reduce((sum, c) => sum + c.totalParserRules, 0),
    totalRoutingPaths: routingPaths.length,
    enabledRoutingPaths: routingPaths.filter((p) => p.enabled).length,
    disabledRoutingPaths: routingPaths.filter((p) => !p.enabled).length,
    eventsWithFilters: events.filter((e) => e.hasFilters).length,
    eventsWithWildcardServers: events.filter((e) => e.appliesToAllServers).length,
    sinksWithRateLimit: sinks.filter((s) => s.hasRateLimit).length,
    sinksWithTemplates: sinks.filter((s) => s.hasTemplate).length,
  };

  // Message type mapping (from EventProcessor)
  const messageTypeMapping = {
    message: ["privmsg", "notice"],
    join: ["join"],
    part: ["part"],
    quit: ["quit"],
    nick: ["nick"],
    kick: ["kick"],
    mode: ["mode"],
    topic: ["topic"],
    connect: ["system"],
    disconnect: ["system"],
    any: [
      "privmsg",
      "notice",
      "join",
      "part",
      "quit",
      "nick",
      "kick",
      "mode",
      "topic",
      "system",
      "unknown",
    ],
  };

  const response: DataFlowResponse = {
    timestamp: new Date().toISOString(),
    configDirectory: context.orchestrator.getConfigDirectory(),
    running: status.running,
    stats,
    clients,
    servers,
    sinks,
    events,
    routingPaths,
    messageTypeMapping,
  };

  return json({ status: 200 }, response);
};
