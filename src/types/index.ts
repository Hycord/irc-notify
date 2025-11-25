// Updated type definitions for fully JSON-configured system

/**
 * Message context that flows through the system
 * Contains all information about a message and its context
 */
export interface MessageContext {
  // Raw data
  raw: {
    line: string;
    timestamp: string;
  };

  // Parsed message data
  message?: {
    content: string;
    type:
      | "privmsg"
      | "notice"
      | "join"
      | "part"
      | "quit"
      | "nick"
      | "kick"
      | "mode"
      | "topic"
      | "system"
      | "unknown";
    raw?: string;
  };

  // Sender information (enriched by server config)
  sender?: {
    nickname: string;
    username?: string;
    hostname?: string;
    realname?: string;
    modes?: string[];
  };

  // Channel/target information
  target?: {
    name: string;
    type: "channel" | "query" | "console";
  };

  // Client information (from client adapter)
  client: {
    id: string;
    type: string;
    name: string;
    metadata?: Record<string, any>;
  };

  // Server information (enriched by server config)
  server: {
    id?: string;
    hostname?: string;
    displayName?: string;
    clientNickname?: string;
    network?: string;
    ip?: string;
    port?: number;
    metadata?: Record<string, any>;
  };

  // Timestamp as Date object
  timestamp: Date;

  // Additional metadata
  metadata: Record<string, any>;
}

/**
 * Parser rule for extracting information from log lines
 */
export interface ParserRule {
  name: string;
  pattern: string;
  flags?: string;
  messageType?: string;
  captures?: {
    timestamp?: string;
    nickname?: string;
    username?: string;
    hostname?: string;
    content?: string;
    target?: string;
    [key: string]: string | undefined;
  };
  skip?: boolean;
  priority?: number;
}

/**
 * File type configuration
 */
export interface FileTypeConfig {
  type: "text" | "sqlite" | "json";
  encoding?: string;
  lineEnding?: string;
  query?: string;
  pollInterval?: number;
  jsonPath?: string;
}

/**
 * Filter configuration for event matching
 * Supports boolean operators and deep property access
 */
export interface FilterConfig {
  field: string;
  operator:
    | "equals"
    | "notEquals"
    | "contains"
    | "notContains"
    | "matches"
    | "notMatches"
    | "exists"
    | "notExists"
    | "in"
    | "notIn";
  value?: any;
  pattern?: string;
  flags?: string;
}

export interface FilterGroup {
  // Logical operator for combining filters
  operator: "AND" | "OR";

  // List of filters or nested filter groups
  filters: (FilterConfig | FilterGroup)[];
}

/**
 * Client configuration - loaded from config/clients/<id>.json
 */
export interface ClientConfig {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  logDirectory: string;

  discovery: {
    patterns: {
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
      consolePattern?: string;
    };
  };

  serverDiscovery: {
    type: "static" | "filesystem" | "json" | "sqlite";
    servers?: Array<{ hostname: string; metadata?: Record<string, any> }>;
    searchPattern?: string;
    hostnamePattern?: string;
    hostnameGroup?: number;
    jsonPath?: string;
    hostnameField?: string;
    query?: string;
    hostnameColumn?: string;
  };

  fileType: FileTypeConfig;
  parserRules: ParserRule[];
  metadata?: Record<string, any>;
}

/**
 * Server configuration - loaded from config/servers/<id>.json
 */
export interface ServerConfig {
  id: string;
  hostname: string;
  displayName: string;
  clientNickname: string;
  network?: string;
  port?: number;
  tls?: boolean;
  enabled: boolean;
  users?: {
    [nickname: string]: {
      realname?: string;
      modes?: string[];
      metadata?: Record<string, any>;
    };
  };
  metadata?: Record<string, any>;
}

/**
 * Event configuration - loaded from config/events/<id>.json
 */
export interface EventConfig {
  id: string;
  name: string;
  enabled: boolean;
  baseEvent:
    | "message"
    | "join"
    | "part"
    | "quit"
    | "nick"
    | "kick"
    | "mode"
    | "topic"
    | "connect"
    | "disconnect"
    | "any";
  serverIds: string[];
  filters?: FilterGroup;
  sinkIds: string[];
  priority?: number;
  metadata?: Record<string, any>;
}

/**
 * Sink configuration - loaded from config/sinks/<id>.json
 */
export interface SinkConfig {
  id: string;
  type: "ntfy" | "webhook" | "console" | "file" | "custom";
  name: string;
  enabled: boolean;
  config: Record<string, any>;
  template?: {
    title?: string;
    body?: string;
    format?: "text" | "markdown" | "json";
  };
  rateLimit?: {
    maxPerMinute?: number;
    maxPerHour?: number;
  };
  allowedMetadata?: string[];
  metadata?: Record<string, any>;
}

/**
 * Root configuration structure
 */
export interface IRCNotifyConfig {
  global: {
    defaultLogDirectory?: string;
    pollInterval?: number;
    debug?: boolean;
    configDirectory?: string;
    rescanLogsOnStartup?: boolean;
  };

  // Optional API server configuration
  api?: {
    enabled?: boolean;
    port?: number;
    host?: string;
    authToken?: string;
    enableFileOps?: boolean;
  };

  // References to config files (IDs or paths)
  clients: string[];
  servers: string[];
  events: string[];
  sinks: string[];
}

/**
 * Generic client adapter that uses JSON configuration
 */
export interface ClientAdapter {
  /** Initialize the adapter */
  initialize(): Promise<void>;

  /** Discover IRC servers from log directory */
  discoverServers(): Promise<Array<{ hostname: string; metadata?: Record<string, any> }>>;

  /** Parse a single log line into a MessageContext */
  parseLine(line: string, context: Partial<MessageContext>): MessageContext | null;

  /** Get log file paths to watch */
  getLogPaths(): Promise<string[]>;

  /** Extract context from log file path */
  extractContextFromPath(filePath: string): Partial<MessageContext>;

  /** Cleanup resources */
  destroy(): Promise<void>;
}

/**
 * Sink interface - implemented by each sink type
 */
export interface Sink {
  // Initialize the sink
  initialize(): Promise<void>;

  // Send a notification
  send(context: MessageContext, event: EventConfig): Promise<void>;

  // Cleanup
  destroy(): Promise<void>;
}
