# IRC Notify Configuration Type System & Data Flow

**Version**: 1.0  
**Last Updated**: November 24, 2025  
**Purpose**: Complete technical specification for rebuilding the TypeScript configuration type system with comprehensive validation

---

## Table of Contents

1. [Overview](#overview)
2. [Type Hierarchy](#type-hierarchy)
3. [Data Flow Architecture](#data-flow-architecture)
4. [Configuration Types](#configuration-types)
5. [Validation Rules](#validation-rules)
6. [Cross-Reference Validation](#cross-reference-validation)
7. [Sink-Specific Metadata](#sink-specific-metadata)
8. [Template System](#template-system)
9. [Filter System](#filter-system)
10. [Implementation Guidelines](#implementation-guidelines)

---

## Overview

IRC Notify uses a **100% JSON/TypeScript-configured architecture** with no hardcoded business logic. The configuration system consists of five main config types that reference each other through IDs, with comprehensive runtime validation to ensure consistency.

### Core Principles

1. **Everything is configurable** - No business logic in code
2. **ID-based references** - Configs reference each other by string IDs
3. **Validation at load time** - All configs validated during initialization
4. **Template-driven** - All strings support `{{field.path}}` template syntax
5. **Type-safe at build time** - TypeScript types enforce structure

---

## Type Hierarchy

```
IRCNotifyConfig (root)
├── global: GlobalConfig
├── clients: string[]           → references ClientConfig.id
├── servers: string[]           → references ServerConfig.id  
├── events: string[]            → references EventConfig.id
└── sinks: string[]             → references SinkConfig.id

ClientConfig
├── discovery: DiscoveryConfig
│   ├── patterns: DiscoveryPatterns
│   └── pathExtraction: PathExtractionConfig
├── serverDiscovery: ServerDiscoveryConfig
├── fileType: FileTypeConfig
└── parserRules: ParserRule[]

ServerConfig
├── users: { [nickname: string]: UserInfo }
└── metadata: Record<string, any>

EventConfig
├── serverIds: string[]         → references ServerConfig.id or '*'
├── sinkIds: string[]           → references SinkConfig.id
├── filters?: FilterGroup
└── metadata?: EventMetadata
    └── sink?: { [sinkId: string]: SinkSpecificMetadata }

SinkConfig
├── config: SinkTypeSpecificConfig (depends on type)
├── template?: TemplateConfig
├── rateLimit?: RateLimitConfig
├── allowedMetadata?: string[]
└── metadata?: Record<string, any>

MessageContext (runtime data structure)
├── raw: { line, timestamp }
├── message?: MessageData
├── sender?: SenderInfo
├── target?: TargetInfo
├── client: ClientInfo
├── server: ServerInfo
├── timestamp: Date
└── metadata: Record<string, any>
```

---

## Data Flow Architecture

### Pipeline Overview

```
Log File → LogWatcher → ClientAdapter → MessageContext → EventProcessor → Sink(s)
```

### Detailed Flow

1. **Log Discovery** (`LogWatcher` + `ClientAdapter`)
   - `ClientAdapter.getLogPaths()` discovers log files using `ClientConfig.discovery.patterns`
   - `LogWatcher` polls files at `IRCNotifyConfig.global.pollInterval`
   - New lines trigger parsing

2. **Parsing** (`ClientAdapter.parseLine()`)
   - Uses `ClientConfig.parserRules` (priority-sorted, highest first)
   - Each rule is a regex with named captures
   - First matching rule extracts message data
   - Rules with `skip: true` prevent further processing
   - Returns `MessageContext` or `null`

3. **Context Enrichment** (`EventProcessor.enrichContext()`)
   - Matches server by `context.metadata.serverIdentifier`
   - Applies `ServerConfig` data to `context.server`
   - Enriches sender with `ServerConfig.users[nickname]` data
   - Merges metadata from server and user configs

4. **Event Matching** (`EventProcessor.processMessage()`)
   - Filters events by `enabled: true`
   - Checks `baseEvent` type match
   - Filters by `serverIds` (supports `'*'` wildcard)
   - Evaluates `filters` using `FilterEngine`
   - Returns array of matched `EventConfig`s

5. **Notification Delivery** (`BaseSink.send()`)
   - Checks rate limits (`SinkConfig.rateLimit`)
   - Resolves templates (event metadata overrides sink config)
   - Calls `Sink.sendNotification(title, body, context, event)`
   - Tracks rate limit counters

### Special Behaviors

- **Dev Mode Override**: If `context.client.id === 'dev-textual'`, all events route to `['dev-sink-override']`
- **Environment Variable Substitution**: All string values support `${ENV_VAR}` and `${ENV_VAR:-default}` syntax (applied during config load)
- **Template Variable Resolution**: All string configs support `{{field.path}}` syntax for accessing `MessageContext` properties

---

## Configuration Types

### 1. IRCNotifyConfig (Root Configuration)

**File**: `config/config.ts` or `config.json`

```typescript
interface IRCNotifyConfig {
  global: {
    defaultLogDirectory?: string;        // Default: '/logs'
    pollInterval?: number;                // Milliseconds, min 100, default: 1000
    debug?: boolean;                      // Default: false
    configDirectory?: string;             // Default: './config'
    rescanLogsOnStartup?: boolean;       // Default: false
  };
  
  // References to config files (IDs or paths)
  clients: string[];    // References ClientConfig.id
  servers: string[];    // References ServerConfig.id
  events: string[];     // References EventConfig.id
  sinks: string[];      // References SinkConfig.id
}
```

**Validation Rules**:
- `global` (required): Must be object
- `global.pollInterval`: If present, must be integer >= 100
- `global.debug`: If present, must be boolean
- `clients` (required): Must be non-empty array
- `servers` (required): Must be non-empty array
- `events` (required): Must be non-empty array
- `sinks` (required): Must be non-empty array
- All IDs must reference existing configs (validated after all configs loaded)

**Default Values**:
- `pollInterval`: 1000ms
- `debug`: false
- `defaultLogDirectory`: '/logs'
- `configDirectory`: './config'
- `rescanLogsOnStartup`: false

---

### 2. ClientConfig

**File**: `config/clients/<id>.ts` or `config/clients/<id>.json`

```typescript
interface ClientConfig {
  id: string;                    // Unique identifier (auto-set from filename if missing)
  type: string;                  // Client type identifier (e.g., 'textual', 'thelounge')
  name: string;                  // Human-readable name
  enabled: boolean;              // Whether to process logs from this client
  logDirectory: string;          // Root directory for logs (supports ${ENV_VAR})
  
  discovery: {
    patterns: {
      console?: string;          // Glob pattern for console logs
      channels?: string;         // Glob pattern for channel logs
      queries?: string;          // Glob pattern for query/PM logs
    };
    pathExtraction: {
      serverPattern?: string;    // Regex to extract server identifier from path
      serverGroup?: number;      // Capture group number for server (default: 1)
      channelPattern?: string;   // Regex to extract channel name from path
      channelGroup?: number;     // Capture group number for channel (default: 1)
      queryPattern?: string;     // Regex to extract query/PM target from path
      queryGroup?: number;       // Capture group number for query (default: 1)
      consolePattern?: string;   // Regex to detect console logs
    };
  };
  
  serverDiscovery: {
    type: 'static' | 'filesystem' | 'json' | 'sqlite';
    
    // For type: 'static'
    servers?: Array<{
      hostname: string;
      metadata?: Record<string, any>;
    }>;
    
    // For type: 'filesystem'
    searchPattern?: string;      // Glob pattern to find server directories
    hostnamePattern?: string;    // Regex to extract hostname from directory name
    hostnameGroup?: number;      // Capture group for hostname (default: 1)
    
    // For type: 'json'
    jsonPath?: string;           // Path to JSON file
    hostnameField?: string;      // JSON field containing hostname
    
    // For type: 'sqlite'
    query?: string;              // SQL query to fetch servers
    hostnameColumn?: string;     // Column name containing hostname
  };
  
  fileType: FileTypeConfig;
  parserRules: ParserRule[];     // Priority-sorted (highest first)
  metadata?: Record<string, any>;
}
```

**FileTypeConfig**:
```typescript
interface FileTypeConfig {
  type: 'text' | 'sqlite' | 'json';
  encoding?: string;             // For text files (default: 'utf-8')
  lineEnding?: string;           // For text files (default: '\n')
  query?: string;                // For sqlite
  pollInterval?: number;         // Override global pollInterval
  jsonPath?: string;             // For json files (JSONPath expression)
}
```

**ParserRule**:
```typescript
interface ParserRule {
  name: string;                  // Rule identifier
  pattern: string;               // Regex pattern (double-escape in JSON: "\\[")
  flags?: string;                // Regex flags (e.g., 'i', 'g')
  messageType?: string;          // Output message type
  captures?: {                   // Named capture groups → MessageContext fields
    timestamp?: string;          // → context.raw.timestamp
    nickname?: string;           // → context.sender.nickname
    username?: string;           // → context.sender.username
    hostname?: string;           // → context.sender.hostname
    content?: string;            // → context.message.content
    target?: string;             // → context.target.name
    [key: string]: string | undefined;  // Custom captures → context.metadata
  };
  skip?: boolean;                // If true, don't create MessageContext (filter out)
  priority?: number;             // Higher = checked first (default: 0)
}
```

**Validation Rules**:
- `id` (required): Non-empty string
- `type` (required): Non-empty string
- `name` (required): Non-empty string
- `enabled` (required): Boolean
- `logDirectory` (required): Non-empty string
- `discovery` (required): Object with `patterns` and `pathExtraction`
- `discovery.patterns` (required): At least one of `console`, `channels`, `queries`
- `serverDiscovery` (required): Object with valid `type`
- `serverDiscovery.type` (required): One of `['static', 'filesystem', 'json', 'sqlite']`
- `fileType` (required): Object with valid `type`
- `fileType.type` (required): One of `['text', 'sqlite', 'json']`
- `parserRules` (required): Non-empty array
- Each `ParserRule`:
  - `name` (required): Non-empty string
  - `pattern` (required): Valid regex
  - `flags`: If present, valid regex flags
  - `priority`: If present, number
  - `skip`: If present, boolean

**Processing Order**:
1. Rules sorted by `priority` (descending)
2. First matching rule wins
3. If `skip: true`, message is discarded

---

### 3. ServerConfig

**File**: `config/servers/<id>.ts` or `config/servers/<id>.json`

```typescript
interface ServerConfig {
  id: string;                    // Unique identifier (auto-set from filename if missing)
  hostname: string;              // IRC server hostname
  displayName: string;           // Human-readable name
  network?: string;              // Network name (e.g., 'Libera.Chat')
  port?: number;                 // Port number (1-65535)
  tls?: boolean;                 // Whether TLS is used
  enabled: boolean;              // Whether to process events for this server
  
  users?: {
    [nickname: string]: {
      realname?: string;         // Real name / display name
      modes?: string[];          // User modes (e.g., ['o', 'v'])
      metadata?: Record<string, any>;  // Custom metadata
    };
  };
  
  metadata?: Record<string, any>;
}
```

**Validation Rules**:
- `id` (required): Non-empty string
- `hostname` (required): Non-empty string
- `displayName` (required): Non-empty string
- `enabled` (required): Boolean
- `port`: If present, integer between 1 and 65535
- `tls`: If present, boolean
- `network`: If present, string
- `users`: If present, must be object (not array)
- `metadata`: If present, must be object

**Enrichment Behavior**:
1. `EventProcessor.enrichContext()` matches server by:
   - First: `ServerConfig.displayName === context.metadata.serverIdentifier`
   - Then: `ServerConfig.id === context.metadata.serverIdentifier` (case-insensitive)
2. Matched server data is merged into `context.server`
3. If `context.sender.nickname` matches `users` key:
   - User data merged into `context.sender`
   - User metadata merged into `context.metadata`

---

### 4. EventConfig

**File**: `config/events/<id>.ts` or `config/events/<id>.json`

```typescript
interface EventConfig {
  id: string;                    // Unique identifier (auto-set from filename if missing)
  name: string;                  // Human-readable name
  enabled: boolean;              // Whether this event is active
  baseEvent: BaseEventType;      // Base event type to match
  serverIds: string[];           // Server IDs to match (supports '*' for all)
  filters?: FilterGroup;         // Optional filter criteria
  sinkIds: string[];             // Sink IDs to notify
  priority?: number;             // Event priority (higher = processed first)
  metadata?: EventMetadata;      // Event-specific metadata
}

type BaseEventType = 
  | 'message'      // Maps to ['privmsg', 'notice']
  | 'join'         // Maps to ['join']
  | 'part'         // Maps to ['part']
  | 'quit'         // Maps to ['quit']
  | 'nick'         // Maps to ['nick']
  | 'kick'         // Maps to ['kick']
  | 'mode'         // Maps to ['mode']
  | 'topic'        // Maps to ['topic']
  | 'connect'      // Maps to ['system']
  | 'disconnect'   // Maps to ['system']
  | 'any';         // Matches all types

interface EventMetadata {
  sink?: {
    [sinkId: string]: SinkSpecificMetadata;
  };
  [key: string]: any;
}

// SinkSpecificMetadata structure depends on sink type (see Sink-Specific Metadata section)
```

**Validation Rules**:
- `id` (required): Non-empty string
- `name` (required): Non-empty string
- `enabled` (required): Boolean
- `baseEvent` (required): One of valid `BaseEventType` values
- `serverIds` (required): Non-empty array of strings
- `serverIds[]`: Each must be `'*'` or reference existing `ServerConfig.id`
- `sinkIds` (required): Non-empty array of strings
- `sinkIds[]`: Each must reference existing `SinkConfig.id`
- `filters`: If present, must be valid `FilterGroup`
- `priority`: If present, must be number
- `metadata`: If present, must be object
- `metadata.sink`: If present, keys must match existing `SinkConfig.id`
- `metadata.sink[sinkId]`: Keys must be in `SinkConfig.allowedMetadata` (if defined)

**Processing Order**:
1. Events sorted by `priority` (descending)
2. All matching events are triggered (not just first match)
3. Each matched event sends to all its `sinkIds`

---

### 5. SinkConfig

**File**: `config/sinks/<id>.ts` or `config/sinks/<id>.json`

```typescript
interface SinkConfig {
  id: string;                    // Unique identifier (auto-set from filename if missing)
  type: SinkType;                // Sink implementation type
  name: string;                  // Human-readable name
  enabled: boolean;              // Whether this sink is active
  config: SinkTypeSpecificConfig;  // Type-specific configuration
  template?: TemplateConfig;     // Template overrides
  rateLimit?: RateLimitConfig;   // Rate limiting rules
  allowedMetadata?: string[];    // Allowed keys in event.metadata.sink[id]
  metadata?: Record<string, any>;
}

type SinkType = 'ntfy' | 'webhook' | 'console' | 'file' | 'custom';
```

**TemplateConfig**:
```typescript
interface TemplateConfig {
  title?: string;                // Title template (supports {{var}} syntax)
  body?: string;                 // Body template (supports {{var}} syntax)
  format?: 'text' | 'markdown' | 'json';
}
```

**RateLimitConfig**:
```typescript
interface RateLimitConfig {
  maxPerMinute?: number;         // Max notifications per minute (min: 1)
  maxPerHour?: number;           // Max notifications per hour (min: 1)
}
```

**Validation Rules**:
- `id` (required): Non-empty string
- `type` (required): One of `['ntfy', 'webhook', 'console', 'file', 'custom']`
- `name` (required): Non-empty string
- `enabled` (required): Boolean
- `config` (required): Object (type-specific validation below)
- `template.format`: If present, one of `['text', 'markdown', 'json']`
- `rateLimit.maxPerMinute`: If present, integer >= 1
- `rateLimit.maxPerHour`: If present, integer >= 1
- `allowedMetadata`: If present, array of strings
- Type-specific validation only for `enabled: true` sinks

---

## Validation Rules

### Validation Phases

1. **Individual Config Validation** (during load)
   - Schema validation (required fields, types)
   - Regex pattern validation
   - Range validation (ports, intervals, etc.)
   - Type-specific validation

2. **Cross-Reference Validation** (after all configs loaded)
   - ID existence checks
   - Reference integrity
   - Metadata key validation against `allowedMetadata`

3. **Runtime Validation** (during execution)
   - Template variable resolution
   - Filter evaluation
   - Rate limit enforcement

### Error Reporting Format

All validation errors use `ConfigValidationError`:

```typescript
class ConfigValidationError extends Error {
  constructor(
    message: string,
    configType: string,      // e.g., 'ClientConfig', 'EventConfig'
    configId?: string,       // e.g., 'textual', 'phrase-alert'
    field?: string           // e.g., 'serverIds', 'config.url'
  )
}

// Error message format:
"[{configType}:{configId}.{field}] {message}"
// Example: "[EventConfig:phrase-alert.serverIds] references non-existent server: invalid-id"
```

### Type-Specific Sink Validation

#### Ntfy Sink (`type: 'ntfy'`)

```typescript
interface NtfySinkConfig {
  endpoint: string;              // Required (e.g., 'https://ntfy.sh')
  topic: string;                 // Required
  token?: string;                // Optional auth token
  priority?: string;             // Optional priority (default: 'default')
  tags?: string[];               // Optional tags
  headers?: Record<string, string>;  // Optional custom headers
}
```

**Validation** (only if `enabled: true`):
- `config.endpoint` (required): Non-empty string
- `config.topic` (required): Non-empty string
- `config.priority`: If present, string
- `config.tags`: If present, array of strings
- `config.headers`: If present, object

**Allowed Event Metadata Keys**:
- `priority`: String (overrides sink config)
- `tags`: String or string[] (overrides sink config)
- `headers`: Object (merged with sink headers)

#### Webhook Sink (`type: 'webhook'`)

```typescript
interface WebhookSinkConfig {
  url: string;                   // Required, must be valid URL
  method?: string;               // HTTP method (default: 'POST')
  headers?: Record<string, string>;  // Optional custom headers
}
```

**Validation** (only if `enabled: true`):
- `config.url` (required): Valid URL format
- `config.method`: If present, string
- `config.headers`: If present, object

**Allowed Event Metadata Keys**:
- `webhook.fields`: Object (additional JSON fields in payload)
- `webhook.headers`: Object (merged with sink headers)

**Payload Format** (when `template.format: 'json'`):
```json
{
  "title": "...",
  "body": "...",
  "event": {
    "id": "event-id",
    "name": "Event Name",
    "baseEvent": "message"
  },
  "context": {
    "client": {...},
    "server": {...},
    "sender": {...},
    "target": {...},
    "message": {...},
    "timestamp": "ISO8601"
  },
  ...webhookFields  // From event.metadata.webhook.fields
}
```

#### Console Sink (`type: 'console'`)

```typescript
interface ConsoleSinkConfig {
  // No required fields
}
```

**Validation**: None (config can be empty object)

**Allowed Event Metadata Keys**: None (uses only sink-level template config)

#### File Sink (`type: 'file'`)

```typescript
interface FileSinkConfig {
  filePath: string;              // Required (or 'path')
  path?: string;                 // Alias for filePath
  append?: boolean;              // Default: true
}
```

**Validation** (only if `enabled: true`):
- `config.filePath` or `config.path` (required): Non-empty string
- `config.append`: If present, boolean

**Allowed Event Metadata Keys**: None

**Behavior**:
- Creates parent directories if they don't exist
- `append: true`: Appends to file
- `append: false`: Overwrites file

#### Custom Sink (`type: 'custom'`)

```typescript
interface CustomSinkConfig {
  [key: string]: any;  // Flexible - no validation
}
```

**Validation**: None (completely flexible)

---

## Cross-Reference Validation

### Reference Graph

```
IRCNotifyConfig
├─→ clients[]        → ClientConfig.id
├─→ servers[]        → ServerConfig.id
├─→ events[]         → EventConfig.id
└─→ sinks[]          → SinkConfig.id

EventConfig
├─→ serverIds[]      → ServerConfig.id (or '*')
├─→ sinkIds[]        → SinkConfig.id
└─→ metadata.sink    → SinkConfig.id (keys)
    └─→ [sinkId]     → SinkConfig.allowedMetadata (keys)
```

### Validation Rules

1. **Main Config References** (`ConfigValidator.validateReferences()`)
   - All `clients[]` must reference existing `ClientConfig.id`
   - All `servers[]` must reference existing `ServerConfig.id`
   - All `events[]` must reference existing `EventConfig.id`
   - All `sinks[]` must reference existing `SinkConfig.id`

2. **Event Server References**
   - All `EventConfig.serverIds[]` must be `'*'` or reference existing `ServerConfig.id`
   - Wildcard `'*'` applies event to all servers

3. **Event Sink References**
   - All `EventConfig.sinkIds[]` must reference existing `SinkConfig.id`
   - All referenced sinks must be `enabled: true` (warning if disabled)

4. **Event Metadata References** (`ConfigRegistry.registerEvent()`)
   - All keys in `EventConfig.metadata.sink` must reference existing `SinkConfig.id`
   - If sink has `allowedMetadata`, all keys in `metadata.sink[sinkId]` must be in that array
   - Example error: `Event 'phrase-alert' has metadata.sink.ntfy.invalidKey but sink 'ntfy' does not allow metadata key 'invalidKey'. Allowed keys: priority, tags, headers`

### Validation Order

1. Load and validate individual `ClientConfig`s
2. Load and validate individual `SinkConfig`s
3. Load and validate individual `ServerConfig`s
4. Load and validate individual `EventConfig`s (includes sink metadata validation)
5. Register all configs in `ConfigRegistry`
6. Validate main config references (`ConfigRegistry.validateMainConfigReferences()`)
7. Final cross-reference validation (`ConfigValidator.validateReferences()`)

---

## Sink-Specific Metadata

Event configs can override sink behavior using `metadata.sink[sinkId]` structure.

### Structure

```typescript
interface EventConfig {
  metadata?: {
    sink?: {
      [sinkId: string]: SinkSpecificMetadata;
    };
    [key: string]: any;  // Other custom metadata
  };
}
```

### Resolution Order (in `BaseSink.send()`)

1. **Title**: `event.metadata.sink[sinkId].title` → `sink.template.title` → `'{{event.name}}'`
2. **Body**: `event.metadata.sink[sinkId].body` → `sink.template.body` → `'{{message.content}}'`
3. **Sink-specific settings**: Event metadata overrides sink config

### Per-Sink Metadata Keys

#### Ntfy Sink

```typescript
interface NtfyMetadata {
  title?: string;                // Template override
  body?: string;                 // Template override
  priority?: string;             // Priority override (e.g., 'urgent', 'high')
  tags?: string | string[];      // Tags override
  headers?: Record<string, string>;  // Additional headers
}
```

**Access in Sink Implementation**:
```typescript
// In NtfySink.sendNotification()
const priority = this.getSinkMetadata(event, 'priority') || this.priority;
const eventTags = this.getSinkMetadata(event, 'tags');
const eventHeaders = this.getSinkMetadata(event, 'headers');
```

#### Webhook Sink

```typescript
interface WebhookMetadata {
  title?: string;                // Template override
  body?: string;                 // Template override
}

// Alternative access method (deprecated)
interface WebhookEventMetadata {
  webhook?: {
    fields?: Record<string, any>;    // Additional JSON fields
    headers?: Record<string, string>; // Additional headers
  };
}
```

**Access in Sink Implementation**:
```typescript
// In WebhookSink.sendNotification()
const extraFields = this.getEventMetadata(event, 'webhook.fields') || {};
const eventHeaders = this.getEventMetadata(event, 'webhook.headers');
```

**Note**: Webhook uses `getEventMetadata()` (deprecated) instead of `getSinkMetadata()` for backwards compatibility.

#### Console Sink

No metadata keys (uses only template config).

#### File Sink

No metadata keys (uses only template config).

### Metadata Access Methods

```typescript
class BaseSink {
  /**
   * Get metadata for this specific sink from event config
   * Looks in metadata.sink.{sinkId}.{key}
   * Supports dot notation (e.g., 'nested.field')
   */
  protected getSinkMetadata(event: EventConfig, key: string): any;

  /**
   * Get metadata from event config with support for nested keys
   * Looks in metadata.{key}
   * @deprecated Use getSinkMetadata for sink-specific metadata
   */
  protected getEventMetadata(event: EventConfig, key: string): any;
}
```

### Example Configuration

```json
{
  "id": "urgent-alert",
  "name": "Urgent Alert",
  "baseEvent": "message",
  "serverIds": ["libera"],
  "sinkIds": ["ntfy", "webhook-discord"],
  "metadata": {
    "sink": {
      "ntfy": {
        "title": "🚨 URGENT: {{sender.nickname}} in {{target.name}}",
        "body": "{{message.content}}",
        "priority": "urgent",
        "tags": ["warning", "urgent"]
      },
      "webhook-discord": {
        "title": "Urgent message from {{sender.nickname}}"
      }
    }
  }
}
```

### Validation of Metadata Keys

If `SinkConfig.allowedMetadata` is defined, event metadata keys are validated:

```typescript
// Sink config
{
  "id": "ntfy",
  "type": "ntfy",
  "allowedMetadata": ["title", "body", "priority", "tags", "headers"]
}

// Event config - VALID
{
  "metadata": {
    "sink": {
      "ntfy": {
        "priority": "urgent"  // ✓ In allowedMetadata
      }
    }
  }
}

// Event config - INVALID
{
  "metadata": {
    "sink": {
      "ntfy": {
        "unknownKey": "value"  // ✗ Not in allowedMetadata
      }
    }
  }
}
// Error: Event 'event-id' has metadata.sink.ntfy.unknownKey but sink 'ntfy' 
// does not allow metadata key 'unknownKey'. Allowed keys: title, body, priority, tags, headers
```

---

## Template System

### Overview

All string values in configs support template variable substitution using `{{field.path}}` syntax.

**Implementation**: `src/utils/template.ts`

### Syntax

```typescript
"{{field.path}}"           // Simple field access
"{{nested.field.path}}"    // Nested object access
"{{array.0}}"              // Array index access
"Prefix {{var}} Suffix"    // Template in string
```

### Available Context

Templates have access to the entire `MessageContext` structure plus event info:

```typescript
interface TemplateContext extends MessageContext {
  event: {
    id: string;
    name: string;
    baseEvent: string;
  };
}
```

### Common Template Variables

```typescript
// Message data
{{message.content}}            // Message text
{{message.type}}               // 'privmsg', 'notice', 'join', etc.
{{message.raw}}                // Raw message line

// Sender info
{{sender.nickname}}            // Nickname
{{sender.username}}            // Username
{{sender.hostname}}            // Hostname
{{sender.realname}}            // Real name (from ServerConfig.users)

// Target info
{{target.name}}                // Channel or query target
{{target.type}}                // 'channel', 'query', 'console'

// Server info
{{server.id}}                  // Server ID
{{server.hostname}}            // Server hostname
{{server.displayName}}         // Display name
{{server.network}}             // Network name
{{server.metadata.customKey}}  // Custom metadata

// Client info
{{client.id}}                  // Client ID
{{client.type}}                // Client type
{{client.name}}                // Client name

// Event info
{{event.id}}                   // Event ID
{{event.name}}                 // Event name
{{event.baseEvent}}            // Base event type

// Metadata
{{metadata.customKey}}         // Custom metadata
{{metadata.serverIdentifier}}  // Server identifier from path

// Timestamp
{{timestamp}}                  // Date object (toString format)
{{raw.timestamp}}              // Original timestamp string
```

### Template Processing

```typescript
class TemplateEngine {
  /**
   * Process a template string with context data
   */
  static process(template: string, context: MessageContext): string;

  /**
   * Check if a template string contains variables
   */
  static hasVariables(template: string): boolean;

  /**
   * Extract all variable paths from a template
   */
  static extractVariables(template: string): string[];
}
```

### Behavior

- If variable path doesn't exist: Returns original `{{field.path}}` unchanged
- If value is `null` or `undefined`: Returns original `{{field.path}}` unchanged
- All values converted to string using `String(value)`
- Nested paths traverse objects using dot notation
- Case-sensitive field names

### Examples

```json
{
  "template": {
    "title": "[{{server.displayName}}] {{sender.nickname}} in {{target.name}}",
    "body": "{{message.content}}"
  }
}
```

**Input Context**:
```json
{
  "server": { "displayName": "Libera.Chat" },
  "sender": { "nickname": "alice" },
  "target": { "name": "#linux" },
  "message": { "content": "Hello world!" }
}
```

**Output**:
- Title: `[Libera.Chat] alice in #linux`
- Body: `Hello world!`

### Template Usage Locations

1. **Sink Templates** (`SinkConfig.template.title`, `SinkConfig.template.body`)
2. **Event Metadata** (`EventConfig.metadata.sink[sinkId].title`, `.body`)
3. **Filter Values** (`FilterConfig.value` if string)
4. **Environment Variables** (processed separately by `EnvSubstitution`)

---

## Filter System

### Overview

Events can define complex filter criteria using boolean logic and operators.

**Implementation**: `src/utils/filters.ts`

### Structure

```typescript
interface FilterGroup {
  operator: 'AND' | 'OR';
  filters: Array<FilterConfig | FilterGroup>;  // Nested groups supported
}

interface FilterConfig {
  field: string;                 // Dot notation path to MessageContext field
  operator: FilterOperator;
  value?: any;                   // For comparison operators
  pattern?: string;              // For regex operators
  flags?: string;                // Regex flags
}

type FilterOperator = 
  | 'equals'      | 'notEquals'
  | 'contains'    | 'notContains'
  | 'matches'     | 'notMatches'   // Regex
  | 'exists'      | 'notExists'
  | 'in'          | 'notIn';       // Array membership
```

### Operators

#### Equality Operators

- **`equals`**: Strict equality (`===`)
  - Requires: `value`
  - Example: `{ field: "sender.nickname", operator: "equals", value: "alice" }`

- **`notEquals`**: Strict inequality (`!==`)
  - Requires: `value`
  - Example: `{ field: "message.type", operator: "notEquals", value: "system" }`

#### String/Array Operators

- **`contains`**: String includes or array contains
  - Requires: `value`
  - String: `fieldValue.includes(value)`
  - Array: `fieldValue.includes(value)`
  - Example: `{ field: "message.content", operator: "contains", value: "urgent" }`

- **`notContains`**: Negation of contains
  - Requires: `value`
  - Example: `{ field: "message.content", operator: "notContains", value: "spam" }`

#### Regex Operators

- **`matches`**: Regex test
  - Requires: `pattern` (and optional `flags`)
  - Example: `{ field: "message.content", operator: "matches", pattern: "\\btest\\b", flags: "i" }`

- **`notMatches`**: Negation of regex test
  - Requires: `pattern` (and optional `flags`)
  - Example: `{ field: "sender.hostname", operator: "notMatches", pattern: "^bot\\." }`

#### Existence Operators

- **`exists`**: Field is not `null` or `undefined`
  - No value required
  - Example: `{ field: "sender.realname", operator: "exists" }`

- **`notExists`**: Field is `null` or `undefined`
  - No value required
  - Example: `{ field: "target.name", operator: "notExists" }`

#### Array Membership Operators

- **`in`**: Field value is in array
  - Requires: `value` (array)
  - Example: `{ field: "sender.nickname", operator: "in", value: ["alice", "bob", "charlie"] }`

- **`notIn`**: Field value is not in array
  - Requires: `value` (array)
  - Example: `{ field: "target.type", operator: "notIn", value: ["console"] }`

### Filter Evaluation

```typescript
class FilterEngine {
  /**
   * Evaluate a filter group against a message context
   */
  static evaluate(filterGroup: FilterGroup, context: MessageContext): boolean;
}
```

**Evaluation Rules**:
1. `AND` groups: All filters must match (`.every()`)
2. `OR` groups: At least one filter must match (`.some()`)
3. Nested groups are evaluated recursively
4. Template variables in `value` are resolved before comparison

### Nested Groups Example

```json
{
  "operator": "AND",
  "filters": [
    {
      "field": "message.type",
      "operator": "equals",
      "value": "privmsg"
    },
    {
      "operator": "OR",
      "filters": [
        {
          "field": "message.content",
          "operator": "contains",
          "value": "urgent"
        },
        {
          "field": "message.content",
          "operator": "contains",
          "value": "emergency"
        }
      ]
    }
  ]
}
```

**Logic**: `(type === 'privmsg') AND (content contains 'urgent' OR content contains 'emergency')`

### Template Variable Resolution in Filters

Filter values support template variables:

```json
{
  "field": "sender.nickname",
  "operator": "equals",
  "value": "{{metadata.expectedSender}}"
}
```

**Processing**:
1. `FilterEngine.evaluateFilter()` checks if `value` is string with templates
2. If yes, calls `TemplateEngine.process(value, context)`
3. Resolved value is used for comparison

### Validation Rules

- `FilterGroup.operator` (required): Must be `'AND'` or `'OR'`
- `FilterGroup.filters` (required): Non-empty array
- `FilterConfig.field` (required): Non-empty string
- `FilterConfig.operator` (required): Valid `FilterOperator`
- Operators requiring `value`: `['equals', 'notEquals', 'contains', 'notContains', 'in', 'notIn']`
- Operators requiring `pattern`: `['matches', 'notMatches']`
- Regex patterns must be valid (tested with `new RegExp()`)

---

## Implementation Guidelines

### Building a Type-Safe Configuration System

#### 1. Prevent Duplicate Keys

**Problem**: JSON allows duplicate keys (last one wins), which causes silent bugs.

**Solution**: Use TypeScript mapped types with unique key constraints:

```typescript
// Use Record<string, T> with runtime validation
type UniqueKeys<T> = {
  [K in keyof T]: T[K];
};

// Validate at runtime during config load
function validateUniqueKeys(obj: Record<string, any>, path: string): void {
  const keys = new Set<string>();
  for (const key of Object.keys(obj)) {
    if (keys.has(key)) {
      throw new ConfigValidationError(
        `Duplicate key: ${key}`,
        'Config',
        undefined,
        path
      );
    }
    keys.add(key);
  }
}
```

#### 2. Validate Sink Metadata Based on Type

**Problem**: Different sink types accept different metadata keys.

**Solution**: Use discriminated unions with conditional types:

```typescript
type SinkConfig = 
  | NtfySinkConfig 
  | WebhookSinkConfig 
  | ConsoleSinkConfig 
  | FileSinkConfig 
  | CustomSinkConfig;

interface NtfySinkConfig extends BaseSinkConfig {
  type: 'ntfy';
  config: {
    endpoint: string;
    topic: string;
    token?: string;
    priority?: string;
    tags?: string[];
    headers?: Record<string, string>;
  };
  allowedMetadata?: Array<'title' | 'body' | 'priority' | 'tags' | 'headers'>;
}

// Runtime validation
function validateSinkMetadata(
  eventId: string,
  sinkId: string,
  sink: SinkConfig,
  metadata: Record<string, any>
): void {
  if (!sink.allowedMetadata) return;
  
  for (const key of Object.keys(metadata)) {
    if (!sink.allowedMetadata.includes(key)) {
      throw new ConfigValidationError(
        `Metadata key '${key}' not allowed for sink type '${sink.type}'`,
        'EventConfig',
        eventId,
        `metadata.sink.${sinkId}.${key}`
      );
    }
  }
}
```

#### 3. Validate All Nested Properties

**Problem**: TypeScript only checks types at compile time, not runtime.

**Solution**: Recursive runtime validation:

```typescript
class DeepValidator {
  static validate(
    config: any,
    schema: SchemaDefinition,
    path: string = ''
  ): void {
    for (const [key, fieldSchema] of Object.entries(schema)) {
      const fieldPath = path ? `${path}.${key}` : key;
      const value = config[key];
      
      // Check required
      if (fieldSchema.required && (value === undefined || value === null)) {
        throw new ConfigValidationError(
          `Missing required field: ${key}`,
          'Config',
          undefined,
          fieldPath
        );
      }
      
      // Check type
      if (value !== undefined && !this.checkType(value, fieldSchema.type)) {
        throw new ConfigValidationError(
          `Invalid type for ${key}: expected ${fieldSchema.type}`,
          'Config',
          undefined,
          fieldPath
        );
      }
      
      // Recurse for objects
      if (fieldSchema.type === 'object' && fieldSchema.properties) {
        this.validate(value, fieldSchema.properties, fieldPath);
      }
      
      // Recurse for arrays
      if (fieldSchema.type === 'array' && fieldSchema.items) {
        (value as any[]).forEach((item, index) => {
          this.validate(item, fieldSchema.items, `${fieldPath}[${index}]`);
        });
      }
    }
  }
}
```

#### 4. Provide Autocomplete for Valid Fields

**Solution**: Use TypeScript's IntelliSense with strict types:

```typescript
// Use const assertions for literal types
const MESSAGE_TYPES = ['privmsg', 'notice', 'join', 'part', 'quit', 'nick', 'kick', 'mode', 'topic', 'system', 'unknown'] as const;
type MessageType = typeof MESSAGE_TYPES[number];

// Use template literal types for dynamic keys
type SinkMetadataKey<T extends SinkConfig> = 
  T extends NtfySinkConfig ? 'priority' | 'tags' | 'headers' :
  T extends WebhookSinkConfig ? never :
  never;

// Use conditional types for event metadata
type EventMetadata<S extends SinkConfig[]> = {
  sink?: {
    [K in S[number]['id']]?: SinkMetadataFor<Extract<S[number], { id: K }>>;
  };
};
```

#### 5. Schema Generation from TypeScript Types

**Solution**: Use a schema generator or define schemas alongside types:

```typescript
// Define schema using JSON Schema format
const ClientConfigSchema = {
  type: 'object',
  required: ['id', 'type', 'name', 'enabled', 'logDirectory', 'discovery', 'serverDiscovery', 'fileType', 'parserRules'],
  properties: {
    id: { type: 'string', minLength: 1 },
    type: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1 },
    enabled: { type: 'boolean' },
    logDirectory: { type: 'string', minLength: 1 },
    discovery: {
      type: 'object',
      required: ['patterns', 'pathExtraction'],
      properties: {
        patterns: {
          type: 'object',
          properties: {
            console: { type: 'string' },
            channels: { type: 'string' },
            queries: { type: 'string' }
          }
        },
        pathExtraction: {
          type: 'object',
          properties: {
            serverPattern: { type: 'string' },
            serverGroup: { type: 'number' },
            channelPattern: { type: 'string' },
            channelGroup: { type: 'number' },
            queryPattern: { type: 'string' },
            queryGroup: { type: 'number' },
            consolePattern: { type: 'string' }
          }
        }
      }
    },
    // ... rest of schema
  }
} as const;

// Use Ajv or similar for runtime validation
import Ajv from 'ajv';
const ajv = new Ajv();
const validate = ajv.compile(ClientConfigSchema);

function validateClientConfig(config: unknown): asserts config is ClientConfig {
  if (!validate(config)) {
    throw new ConfigValidationError(
      ajv.errorsText(validate.errors),
      'ClientConfig'
    );
  }
}
```

### Testing Strategy

1. **Unit Tests**: Test each validator function independently
2. **Integration Tests**: Test full config loading with cross-references
3. **Error Cases**: Test all validation error paths
4. **Edge Cases**: Test empty arrays, null values, missing optionals
5. **Type Tests**: Use `tsd` or similar to test TypeScript types

### Documentation Requirements

Every configuration type should document:
1. All required fields
2. All optional fields with defaults
3. Valid value ranges/enums
4. Cross-reference constraints
5. Example configurations
6. Migration guides for version changes

---

## Appendix: Complete MessageContext Structure

```typescript
interface MessageContext {
  raw: {
    line: string;              // Original log line
    timestamp: string;         // Original timestamp string
  };
  
  message?: {
    content: string;           // Parsed message content
    type: MessageType;         // Parsed message type
    raw?: string;              // Raw IRC message (if different from content)
  };
  
  sender?: {
    nickname: string;          // IRC nickname
    username?: string;         // IRC username
    hostname?: string;         // Hostname
    realname?: string;         // Real name (enriched from ServerConfig.users)
    modes?: string[];          // User modes (enriched from ServerConfig.users)
  };
  
  target?: {
    name: string;              // Channel name or query target
    type: 'channel' | 'query' | 'console';
  };
  
  client: {
    id: string;                // ClientConfig.id
    type: string;              // ClientConfig.type
    name: string;              // ClientConfig.name
    metadata?: Record<string, any>;  // ClientConfig.metadata
  };
  
  server: {
    id?: string;               // ServerConfig.id (enriched)
    hostname?: string;         // ServerConfig.hostname (enriched)
    displayName?: string;      // ServerConfig.displayName (enriched)
    network?: string;          // ServerConfig.network (enriched)
    ip?: string;               // IP address
    port?: number;             // Port number (enriched)
    metadata?: Record<string, any>;  // ServerConfig.metadata (enriched)
  };
  
  timestamp: Date;             // Parsed timestamp as Date object
  
  metadata: Record<string, any>;  // Custom metadata
    // Common keys:
    // - serverIdentifier: string (from path extraction)
    // - [userMetadata]: any (from ServerConfig.users[nickname].metadata)
    // - [customCaptures]: any (from ParserRule.captures)
}
```

### MessageContext Lifecycle

1. **Creation** (`ClientAdapter.parseLine()`)
   - `raw.*`: Set from log line
   - `client.*`: Set from `ClientConfig`
   - `metadata.serverIdentifier`: Extracted from file path
   - `target.*`: Extracted from file path
   - `message.*`, `sender.*`: Parsed from log line using `ParserRule`

2. **Enrichment** (`EventProcessor.enrichContext()`)
   - `server.*`: Matched and merged from `ServerConfig`
   - `sender.realname`, `sender.modes`: Merged from `ServerConfig.users`
   - `metadata`: Merged with user metadata

3. **Usage**
   - **Filters**: `FilterEngine.evaluate(filters, context)`
   - **Templates**: `TemplateEngine.process(template, context)`
   - **Sink notification**: `Sink.send(context, event)`

---

## Document Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-11-24 | Initial comprehensive specification |

---

**End of Document**
