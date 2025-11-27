# Data Flow API Reference

## Overview

The Data Flow API endpoint provides a comprehensive view of how messages flow through the irc-notify system based on the currently loaded configuration. This endpoint returns the "server's eye view" of the system, showing exactly what the orchestrator sees and how messages are routed at runtime.

## Endpoint

```
GET /api/data-flow
```

### Authentication

Requires Bearer token authentication via `Authorization` header.

### Response

Returns a detailed JSON object describing the complete data flow configuration.

## Response Structure

### Top-Level Fields

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | string (ISO 8601) | When the data flow snapshot was generated |
| `configDirectory` | string | Absolute path to the configuration directory |
| `running` | boolean | Whether the orchestrator is currently running |
| `stats` | object | Aggregate statistics about the configuration |
| `clients` | array | Detailed client adapter configurations |
| `servers` | array | Detailed server configurations |
| `sinks` | array | Detailed sink configurations |
| `events` | array | Detailed event configurations |
| `routingPaths` | array | All possible message routing paths |
| `messageTypeMapping` | object | Mapping of base event types to message types |

## Data Structures

### DataFlowStats

Aggregate statistics about the current configuration.

```typescript
{
  totalClients: number;           // Total client adapters (enabled + disabled)
  enabledClients: number;         // Number of enabled client adapters
  totalServers: number;           // Total servers configured
  enabledServers: number;         // Number of enabled servers
  totalEvents: number;            // Total events configured
  enabledEvents: number;          // Number of enabled events
  totalSinks: number;             // Total sinks configured
  enabledSinks: number;           // Number of enabled sinks
  totalParserRules: number;       // Total parser rules across all clients
  totalRoutingPaths: number;      // Number of all possible routing paths
  enabledRoutingPaths: number;    // Number of active routing paths
  disabledRoutingPaths: number;   // Number of inactive routing paths
  eventsWithFilters: number;      // Events that have filter conditions
  eventsWithWildcardServers: number;  // Events using "*" for all servers
  sinksWithRateLimit: number;     // Sinks with rate limiting configured
  sinksWithTemplates: number;     // Sinks with custom templates
}
```

### DataFlowClient

Detailed view of a client adapter configuration with analyzed metadata.

```typescript
{
  id: string;                     // Unique client identifier
  type: string;                   // Client type (e.g., "textual", "thelounge")
  name: string;                   // Human-readable name
  enabled: boolean;               // Whether client is active
  logDirectory: string;           // Path to log files
  discoveryPatterns: {            // Glob patterns for log discovery
    console?: string;
    channels?: string;
    queries?: string;
  };
  pathExtraction: {               // Regex patterns for extracting context
    serverPattern?: string;
    serverGroup?: number;
    channelPattern?: string;
    channelGroup?: number;
    queryPattern?: string;
    queryGroup?: number;
  };
  serverDiscoveryType: string;    // How servers are discovered
  fileType: string;               // Log file format
  pollInterval?: number;          // File polling interval (ms)
  parserRules: DataFlowParserRule[];  // All parser rules (see below)
  totalParserRules: number;       // Count of parser rules
  skipRules: number;              // Count of skip rules
  metadata?: Record<string, any>; // Custom metadata
}
```

### DataFlowParserRule

Analyzed parser rule with extracted metadata.

```typescript
{
  name: string;                   // Rule name
  pattern: string;                // Regex pattern
  flags?: string;                 // Regex flags
  messageType?: string;           // Type of message this rule matches
  priority: number;               // Priority (higher = checked first)
  skip: boolean;                  // Whether to skip messages matching this rule
  captureFields: string[];        // Fields captured by this rule
  hasTimestamp: boolean;          // Whether rule captures timestamp
  hasNickname: boolean;           // Whether rule captures nickname
  hasContent: boolean;            // Whether rule captures content
  hasTarget: boolean;             // Whether rule captures target
}
```

### DataFlowServer

Server configuration with analyzed user data.

```typescript
{
  id: string;                     // Server identifier
  hostname: string;               // IRC server hostname
  displayName: string;            // Human-readable name
  clientNickname: string;         // Your nickname on this server
  network?: string;               // Network name (e.g., "Libera.Chat")
  port?: number;                  // Server port
  enabled: boolean;               // Whether server is active
  usersCount: number;             // Number of configured users
  users?: Array<{                 // User configurations
    nickname: string;
    realname?: string;
    modes?: string[];
    hasMetadata: boolean;
  }>;
  metadata?: Record<string, any>; // Custom metadata
}
```

### DataFlowSink

Sink configuration with template analysis.

```typescript
{
  id: string;                     // Sink identifier
  type: string;                   // Sink type (ntfy, webhook, console, file)
  name: string;                   // Human-readable name
  enabled: boolean;               // Whether sink is active
  hasRateLimit: boolean;          // Whether rate limiting is configured
  rateLimit?: {                   // Rate limit configuration
    maxPerMinute?: number;
    maxPerHour?: number;
  };
  hasTemplate: boolean;           // Whether custom template is configured
  templateFormat?: string;        // Template format (text, markdown, json)
  templateFields?: string[];      // Template fields used (e.g., ["sender.nickname"])
  allowedMetadata?: string[];     // Metadata keys allowed for this sink
  hasPayloadTransforms: boolean;  // Whether payload transforms are configured
  payloadTransformsCount: number; // Number of payload transforms
  config: Record<string, any>;    // Sink-specific configuration
  metadata?: Record<string, any>; // Custom metadata
}
```

### DataFlowEvent

Event configuration with filter analysis.

```typescript
{
  id: string;                     // Event identifier
  name: string;                   // Human-readable name
  enabled: boolean;               // Whether event is active
  baseEvent: string;              // Base event type (message, join, quit, etc.)
  priority: number;               // Priority (higher = checked first)
  serverIds: string[];            // Server IDs this event applies to
  serverIdType: "wildcard" | "specific" | "empty";  // Type of server filter
  appliesToAllServers: boolean;   // Whether event uses "*" wildcard
  serverCount: number;            // Number of servers in filter
  hasFilters: boolean;            // Whether custom filters are configured
  filterComplexity?: number;      // Complexity score of filters
  filters?: DataFlowFilter;       // Filter configuration (see below)
  sinkIds: string[];              // Sink IDs to notify
  sinkCount: number;              // Number of sinks
  hasMetadata: boolean;           // Whether metadata is configured
  metadataKeys?: string[];        // Metadata keys defined
  usesTemplatesInMetadata: boolean;  // Whether metadata uses templates
  metadata?: Record<string, any>; // Custom metadata
}
```

### DataFlowFilter

Analyzed filter with template detection.

```typescript
{
  type: "simple" | "group";       // Filter type
  
  // For simple filters:
  field?: string;                 // Field to filter on
  operator?: string;              // Comparison operator
  value?: any;                    // Value to compare
  pattern?: string;               // Regex pattern (for matches operators)
  flags?: string;                 // Regex flags
  
  // For group filters:
  groupOperator?: "AND" | "OR";   // Logical operator
  filters?: DataFlowFilter[];     // Nested filters
  
  // Metadata:
  usesTemplates: boolean;         // Whether filter uses template variables
  targetedFields: string[];       // Fields targeted by this filter
}
```

### DataFlowRoutingPath

A complete routing path from client through event to sinks. **All possible paths are included, even if components are disabled.**

```typescript
{
  clientId: string;               // Client that could emit this message
  clientName: string;             // Client name
  clientEnabled: boolean;         // Whether client is enabled
  serverId: string;               // Server context
  serverName: string;             // Server display name
  serverEnabled: boolean;         // Whether server is enabled
  eventId: string;                // Event that matches
  eventName: string;              // Event name
  eventEnabled: boolean;          // Whether event is enabled
  eventPriority: number;          // Event priority
  baseEvent: string;              // Base event type
  hasFilters: boolean;            // Whether event has filters
  filterSummary?: string;         // Human-readable filter summary
  sinkIds: string[];              // Sinks that will be notified
  sinkNames: string[];            // Sink names
  sinkStatuses: Array<{           // Sink details with status
    id: string;
    name: string;
    enabled: boolean;
  }>;
  enabled: boolean;               // Whether this path is active (all components enabled)
}
```

**Path Status Logic**: A routing path is marked as `enabled: true` only when:
- The client is enabled
- The server is enabled  
- The event is enabled
- At least one sink is enabled

Routing paths are sorted by event priority (highest first), then alphabetically by event name.

## Example Response

```json
{
  "timestamp": "2025-11-25T10:30:00.000Z",
  "configDirectory": "/Users/user/config",
  "running": true,
  "stats": {
    "totalClients": 2,
    "enabledClients": 2,
    "totalServers": 4,
    "enabledServers": 4,
    "totalEvents": 9,
    "enabledEvents": 8,
    "totalSinks": 6,
    "enabledSinks": 5,
    "totalParserRules": 45,
    "totalRoutingPaths": 64,
    "enabledRoutingPaths": 48,
    "disabledRoutingPaths": 16,
    "eventsWithFilters": 6,
    "eventsWithWildcardServers": 2,
    "sinksWithRateLimit": 3,
    "sinksWithTemplates": 4
  },
  "clients": [
    {
      "id": "textual",
      "type": "textual",
      "name": "Textual IRC Client",
      "enabled": true,
      "logDirectory": "/Users/user/logs/textual",
      "discoveryPatterns": {
        "console": "**/Console/*.txt",
        "channels": "**/Channels/*.txt"
      },
      "pathExtraction": {
        "serverPattern": "/([^/]+) \\([A-F0-9]+\\)/",
        "serverGroup": 1,
        "channelPattern": "/Channels/([^/]+)\\.txt$",
        "channelGroup": 1
      },
      "serverDiscoveryType": "filesystem",
      "fileType": "text",
      "pollInterval": 1000,
      "parserRules": [
        {
          "name": "privmsg",
          "pattern": "^\\[(.+?)\\] <(.+?)> (.+)$",
          "priority": 100,
          "skip": false,
          "captureFields": ["timestamp", "nickname", "content"],
          "hasTimestamp": true,
          "hasNickname": true,
          "hasContent": true,
          "hasTarget": false
        }
      ],
      "totalParserRules": 23,
      "skipRules": 4
    }
  ],
  "servers": [
    {
      "id": "libera",
      "hostname": "irc.libera.chat",
      "displayName": "Libera",
      "clientNickname": "mybot",
      "network": "Libera.Chat",
      "port": 6697,
      "enabled": true,
      "usersCount": 5,
      "users": [
        {
          "nickname": "alice",
          "realname": "Alice Smith",
          "modes": ["o"],
          "hasMetadata": true
        }
      ]
    }
  ],
  "sinks": [
    {
      "id": "ntfy",
      "type": "ntfy",
      "name": "ntfy.sh Notifications",
      "enabled": true,
      "hasRateLimit": true,
      "rateLimit": {
        "maxPerMinute": 10,
        "maxPerHour": 100
      },
      "hasTemplate": true,
      "templateFormat": "text",
      "templateFields": ["sender.nickname", "message.content", "server.displayName"],
      "allowedMetadata": ["priority", "tags"],
      "hasPayloadTransforms": false,
      "payloadTransformsCount": 0,
      "config": {
        "url": "https://ntfy.sh/mytopic"
      }
    }
  ],
  "events": [
    {
      "id": "phrase-alert",
      "name": "Phrase Alert",
      "enabled": true,
      "baseEvent": "message",
      "priority": 10,
      "serverIds": ["*"],
      "serverIdType": "wildcard",
      "appliesToAllServers": true,
      "serverCount": 1,
      "hasFilters": true,
      "filterComplexity": 5,
      "filters": {
        "type": "group",
        "groupOperator": "AND",
        "filters": [
          {
            "type": "simple",
            "field": "message.content",
            "operator": "contains",
            "value": "alert",
            "usesTemplates": false,
            "targetedFields": ["message.content"]
          }
        ],
        "usesTemplates": false,
        "targetedFields": ["message.content"]
      },
      "sinkIds": ["ntfy", "console"],
      "sinkCount": 2,
      "hasMetadata": true,
      "metadataKeys": ["priority"],
      "usesTemplatesInMetadata": false,
      "metadata": {
        "priority": "high"
      }
    }
  ],
  "routingPaths": [
    {
      "clientId": "textual",
      "clientName": "Textual IRC Client",
      "clientEnabled": true,
      "serverId": "libera",
      "serverName": "Libera",
      "serverEnabled": true,
      "eventId": "phrase-alert",
      "eventName": "Phrase Alert",
      "eventEnabled": true,
      "eventPriority": 10,
      "baseEvent": "message",
      "hasFilters": true,
      "filterSummary": "(message.content contains \"alert\")",
      "sinkIds": ["ntfy", "console"],
      "sinkNames": ["ntfy.sh Notifications", "Console Logger"],
      "sinkStatuses": [
        { "id": "ntfy", "name": "ntfy.sh Notifications", "enabled": true },
        { "id": "console", "name": "Console Logger", "enabled": true }
      ],
      "enabled": true
    }
  ],
  "messageTypeMapping": {
    "message": ["privmsg", "notice"],
    "join": ["join"],
    "part": ["part"],
    "quit": ["quit"],
    "any": ["privmsg", "notice", "join", "part", "quit", "nick", "kick", "mode", "topic", "system", "unknown"]
  }
}
```

## Use Cases

### 1. Visualizing Data Flow

The `routingPaths` array provides all possible message flows through the system, making it ideal for generating flowcharts or diagrams showing:
- Which clients can emit messages
- Which servers are monitored
- Which events match which conditions
- Which sinks receive notifications

### 2. Configuration Debugging

The detailed analysis helps identify configuration issues:
- Events with no sinks (`sinkCount === 0`)
- Sinks never referenced by events
- Parser rules with high skip rates
- Filter complexity analysis
- Template field usage

### 3. Performance Analysis

The stats and metadata help optimize performance:
- `totalParserRules` - indicates parsing overhead
- `filterComplexity` - indicates event matching cost
- `sinksWithRateLimit` - shows throttling configuration
- `totalRoutingPaths` - shows total possible flows

### 4. Documentation Generation

The comprehensive data can be used to auto-generate:
- System architecture diagrams
- Configuration documentation
- Event/sink relationship matrices
- Parser rule reference

## Implementation Notes

### Filter Complexity Calculation

Filter complexity is calculated as the sum of:
- Nesting depth (each level adds 1)
- Number of conditions (each adds 1)

Example:
- Simple filter: complexity = 1
- AND group with 3 simple filters: complexity = 4 (1 for group + 3 for conditions)
- Nested groups: complexity increases with depth

### Template Detection

Templates are detected by searching for `{{...}}` patterns in:
- Filter values
- Event metadata (recursively)
- Sink templates

The `templateFields` array contains all detected field references (e.g., `sender.nickname`).

### Routing Path Generation

Routing paths are generated by:
1. Iterating over **all events** (both enabled and disabled)
2. For each event, finding applicable servers (based on `serverIds`)
3. For each server, finding all clients that could emit messages
4. Creating a path for each client-server-event-sinks combination
5. Marking each path as `enabled` only if all components are enabled and at least one sink is enabled

**Important**: All possible paths are included in the response, regardless of whether components are enabled. This allows frontends to visualize the complete configuration including inactive paths. Use the `enabled` flag on each path to distinguish active from inactive routes.

Paths are sorted by event priority (highest first), ensuring the order matches runtime evaluation.

### Server Matching Logic

The endpoint replicates the server matching logic from `EventProcessor`:
1. Match by hostname (exact)
2. Match by displayName (case-insensitive exact)
3. Match by ID (case-insensitive exact)
4. Match by displayName prefix (case-insensitive)
5. Match by ID substring (case-insensitive)

This ensures routing paths accurately reflect runtime behavior.

## Error Responses

### 401 Unauthorized

```json
{
  "error": "unauthorized"
}
```

Returned when the Bearer token is missing or invalid.

## Related Endpoints

- `GET /api/status` - Basic system status (lighter weight)
- `GET /api/config/files` - List configuration files
- `POST /api/config/reload` - Reload configuration

## Notes

- This endpoint is read-only and does not modify configuration
- Response size can be large for complex configurations (consider pagination in future versions)
- All data reflects the **currently loaded** configuration, not files on disk
- Disabled components are included in totals and also appear in routing paths (each path has `enabled: true|false`; filter client-side for active-only)
- The endpoint requires the orchestrator to be initialized
