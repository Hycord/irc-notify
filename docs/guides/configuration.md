# Configuration Overview

This guide provides a comprehensive overview of the IRC Notify configuration system.

## Quick Start

**Auto-Discovery Mode** (Recommended): Omit the config arrays to automatically discover all configs:

```json
{
  "global": {
    "defaultLogDirectory": "../logs",
    "pollInterval": 1000,
    "debug": false
  }
}
```

All JSON files in `config/clients/`, `config/servers/`, `config/events/`, and `config/sinks/` are automatically discovered.

**Explicit Mode**: Optionally specify exactly which configs to load:

```json
{
  "global": {
    "defaultLogDirectory": "../logs",
    "pollInterval": 1000,
    "debug": false
  },
  "clients": ["textual", "thelounge"],
  "servers": ["libera", "orpheus"],
  "events": ["phrase-alert"],
  "sinks": ["ntfy", "console"]
}
```

**Enabled Field**: Every config has an `enabled` boolean field:
- Configs with `enabled: false` are **loaded** but **not initialized**
- Use this to temporarily disable configs without deleting files
- Disabled configs still undergo validation but are skipped during runtime

## Configuration Structure

IRC Notify uses a hierarchical configuration system with five main components:

```
config/                      # All configuration lives here
  config.json                # Main config (optional - auto-discovers)
  clients/                   # IRC client log adapters
    *.json
  servers/                   # Server metadata and users
    *.json
  events/                    # Event matching rules
    *.json
  sinks/                     # Notification destinations
    *.json
```

## Main Configuration

**File**: `config/config.json`

Defines global settings. Individual configs are automatically discovered from their directories.

```json
{
  "global": {
    "pollInterval": 1000,
    "debug": false,
    "defaultLogDirectory": "./logs",
    "configDirectory": ".",
    "rescanLogsOnStartup": false
  }
}
```

**Optional**: You can explicitly list config IDs if you want to control which configs are loaded:

```json
{
  "global": {
    "pollInterval": 1000,
    "debug": false,
    "defaultLogDirectory": "./logs"
  },
  "clients": ["textual", "thelounge"],
  "servers": ["libera", "oftc", "orpheus"],
  "events": ["phrase-alert", "dm-alert"],
  "sinks": ["console", "ntfy", "webhook"]
}
```

### Global Settings

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `pollInterval` | number | No | 1000 | File polling interval in milliseconds (minimum: 100) |
| `debug` | boolean | No | false | Enable debug logging throughout the system |
| `defaultLogDirectory` | string | No | "/logs" | Default directory for log files |
| `configDirectory` | string | No | "./config" | Directory containing config files |
| `rescanLogsOnStartup` | boolean | No | false | Re-read all logs from beginning on startup |

### Config Arrays

Each array contains IDs referencing config files:

- **`clients`** - References files in `config/clients/<id>.json`
- **`servers`** - References files in `config/servers/<id>.json`
- **`events`** - References files in `config/events/<id>.json`
- **`sinks`** - References files in `config/sinks/<id>.json`

**Important**: IDs must match the actual config file IDs. Cross-references are validated at load time.

## Config File Resolution

The system looks for config files in this order:

1. `config/config.json` (in subdirectory) ✓ **Preferred**
2. `config.json` (in root directory)
3. `config.dev.json` (development override)

**Custom path**:
```bash
bun start -c /path/to/config.json
```

## Client Configuration

**File**: `config/clients/<id>.json`

Defines how to discover and parse log files from IRC clients.

```json
{
  "id": "textual",
  "type": "textual",
  "name": "Textual IRC Client",
  "enabled": true,
  "logDirectory": "../logs/textual",
  "discovery": {
    "patterns": {
      "console": "**/Console/*.txt",
      "channels": "**/Channels/**/*.txt",
      "queries": "**/Queries/**/*.txt"
    },
    "pathExtraction": {
      "serverPattern": "/([^/]+)\\s*\\([A-F0-9]+\\)/",
      "serverGroup": 1,
      "channelPattern": "/(?:Channels|Queries)/([^/]+)/",
      "channelGroup": 1
    }
  },
  "serverDiscovery": {
    "type": "static",
    "servers": []
  },
  "fileType": {
    "type": "text",
    "encoding": "utf-8"
  },
  "parserRules": [
    {
      "name": "privmsg",
      "priority": 100,
      "pattern": "^\\[(\\d{2}:\\d{2}:\\d{2})\\]\\s*<([^>]+)>\\s*(.+)$",
      "messageType": "privmsg",
      "groups": {
        "timestamp": 1,
        "sender": 2,
        "content": 3
      }
    }
  ]
}
```

**Key fields**:
- `logDirectory` - Base path to log files (supports `${ENV_VAR}`)
- `discovery.patterns` - Glob patterns for finding log files
- `pathExtraction` - Regex patterns to extract server/channel from path
- `parserRules` - Priority-sorted regex rules for parsing lines

See [Type System Documentation](../architecture/type-system.md) for complete client configuration reference.

## Server Configuration

**File**: `config/servers/<id>.json`

Defines server metadata and known users.

```json
{
  "id": "libera",
  "hostname": "irc.libera.chat",
  "displayName": "Libera",
  "network": "Libera.Chat",
  "port": 6697,
  "tls": true,
  "enabled": true,
  "users": {
    "alice": {
      "nickname": "alice",
      "username": "~alice",
      "hostname": "user/alice",
      "realName": "Alice Smith",
      "metadata": {
        "role": "admin"
      }
    }
  },
  "metadata": {
    "timezone": "UTC",
    "region": "US"
  }
}
```

**Key fields**:
- `id` - Unique identifier (used in events)
- `hostname` - IRC server hostname
- `displayName` - Human-readable name (used in templates)
- `users` - Map of known users (nickname → UserInfo)
- `metadata` - Custom metadata (merged into context)

See [Type System Documentation](../architecture/type-system.md) for complete reference.

## Event Configuration

**File**: `config/events/<id>.json`

Defines filter rules for matching messages and routing to sinks.

```json
{
  "id": "phrase-alert",
  "name": "Phrase Alert",
  "enabled": true,
  "baseEvent": "message",
  "serverIds": ["*"],
  "priority": 90,
  "group": "alerts",
  "filters": {
    "operator": "OR",
    "filters": [
      {
        "field": "message.content",
        "operator": "contains",
        "value": "{{server.clientNickname}}"
      },
      {
        "field": "message.content",
        "operator": "matches",
        "pattern": "@{{server.clientNickname}}\\b"
      }
    ]
  },
  "sinkIds": ["ntfy", "console"],
  "metadata": {
    "description": "Alert on mentions",
    "host": {
      "displayName": "{{server.displayName}} (Mentions)"
    },
    "sink": {
      "ntfy": {
        "priority": "high",
        "tags": ["bell", "mention"]
      }
    }
  }
}
```

**Key fields**:
- `baseEvent` - Base event type (message, join, quit, etc.)
- `serverIds` - Server IDs to match (* = all)
- `filters` - Custom filter rules (AND/OR groups)
- `sinkIds` - Sink IDs to send notifications to
- `priority` - Processing priority (higher = first)
- `group` - Optional group identifier (accessible via `{{event.group}}` in templates)
- `metadata.sink` - Per-sink metadata overrides

### Event Groups

The optional `group` field allows you to categorize events for easier filtering and routing. The group is accessible in templates via `{{event.group}}`.

**Example use cases**:
```json
// Categorize by event type
{ "id": "bot-message", "group": "bots" }
{ "id": "user-join", "group": "status" }
{ "id": "phrase-alert", "group": "alerts" }

// Use in filters to group similar events
{
  "filters": {
    "field": "event.group",
    "operator": "equals", 
    "value": "alerts"
  }
}

// Use in sink templates
{
  "template": {
    "title": "[{{event.group}}] {{server.displayName}} - {{sender.nickname}}"
  }
}
// Results in: "[alerts] Libera - Alice"
```

See [Type System Documentation](../architecture/type-system.md) for complete reference.

## Sink Configuration

**File**: `config/sinks/<id>.json`

Defines notification destinations and formatting.

```json
{
  "id": "ntfy",
  "type": "ntfy",
  "name": "Ntfy Push Notifications",
  "enabled": true,
  "config": {
    "endpoint": "${NTFY_ENDPOINT:-https://ntfy.sh}",
    "topic": "${NTFY_TOPIC}",
    "priority": "default",
    "tags": ["irc"]
  },
  "template": {
    "title": "[{{server.displayName}}] {{sender.nickname}}",
    "body": "{{message.content}}",
    "format": "text"
  },
  "rateLimit": {
    "maxPerMinute": 10,
    "maxPerHour": 100
  },
  "allowedMetadata": ["priority", "tags", "headers"]
}
```

**Key fields**:
- `type` - Sink type (ntfy, webhook, console, file, custom)
- `config` - Sink-specific configuration
- `template` - Default templates (can be overridden by events)
- `rateLimit` - Per-sink rate limiting
- `allowedMetadata` - Metadata keys events can override

See [Type System Documentation](../architecture/type-system.md) for complete reference.

## Configuration Validation

### Load-Time Validation

All configs are validated when loaded:

```bash
bun run config:validate
```

**Checks**:
- ✓ TypeScript/JSON syntax
- ✓ Required fields present
- ✓ Field types correct
- ✓ Enum values valid
- ✓ Regex patterns compile
- ✓ URLs formatted correctly
- ✓ Port numbers in range

### Cross-Reference Validation

After loading, the system validates and auto-fixes references:

- ✓ Event `serverIds` reference existing servers (invalid IDs are removed; `'*'` is allowed)
- ✓ Event `sinkIds` reference existing sinks (invalid IDs are removed)
- ✓ Event `metadata.sink` keys match existing sinks
- ✓ Sink metadata keys are in `allowedMetadata`

Notes:
- Missing server/sink IDs do not fail validation; they are pruned from the event.
- Empty `serverIds`/`sinkIds` arrays are allowed and will simply result in no matches or no deliveries for that event.
- When pruning occurs, the corrected `events/<id>.json` file is automatically saved so on-disk configs stay consistent.

### Runtime Validation

During execution:

- ✓ Template variables resolve to existing fields
- ✓ Filter operators are valid
- ✓ Rate limits enforced

## Environment Variables

All string values support environment variable substitution:

### Syntax

**Required variable**:
```typescript
{
  endpoint: "${NTFY_ENDPOINT}"
}
// Fails if NTFY_ENDPOINT not set
```

**With default value**:
```typescript
{
  endpoint: "${NTFY_ENDPOINT:-https://ntfy.sh}"
}
// Uses default if NTFY_ENDPOINT not set
```

**Legacy syntax**:
```typescript
{
  topic: "$NTFY_TOPIC"
}
// Also supported
```

### Common Use Cases

**API endpoints**:
```typescript
{
  endpoint: "${API_ENDPOINT:-https://api.example.com}"
}
```

**Credentials**:
```typescript
{
  headers: {
    "Authorization": "Bearer ${API_TOKEN}"
  }
}
```

**Paths**:
```typescript
{
  logDirectory: "${LOG_DIR:-./logs}"
}
```

**Note**: Environment variable substitution is handled by `EnvSubstitution` utility (`src/utils/env.ts`) during config load.

## Template System

All string configs support `{{field.path}}` syntax:

```typescript
{
  title: "[{{server.displayName}}] {{sender.nickname}}",
  body: "{{message.content}}"
}
```

**Templates work everywhere** - All string values are processed recursively, including:
- Sink template configs (`template.title`, `template.body`)
- Event metadata (all nested fields including `metadata.sink.*`)
- Filter values and patterns
- Array elements in filter values

**Example of deep template processing**:
```typescript
{
  metadata: {
    sink: {
      ntfy: {
        title: "Message from {{sender.nickname}}",  // ✓ Processed
        tags: ["user:{{sender.nickname}}"],         // ✓ Array elements processed
      }
    },
    customField: "Server: {{server.displayName}}"   // ✓ Any metadata field
  }
}
```

**Accesses `MessageContext` fields**:
- `{{message.content}}` - Message text
- `{{sender.nickname}}` - Sender's nickname
- `{{target.name}}` - Channel or query name
- `{{server.displayName}}` - Server display name
- `{{server.clientNickname}}` - Your nickname on the server
- `{{event.group}}` - Event group (if set in event config)
- `{{event.id}}` - Event ID
- `{{event.name}}` - Event name
- `{{metadata.customField}}` - Custom metadata

See [Type System Documentation](../architecture/type-system.md) and [Data Flow](../architecture/data-flow.md) for complete reference.

## Configuration Registry

The configuration registry tracks all loaded configs and validates cross-references at runtime.

**Load order** (enforced by `ConfigLoader`):
1. Clients (no dependencies)
2. Sinks (no dependencies)
3. Servers (no dependencies)
4. Events (depend on servers and sinks)

## Best Practices

### Organization

**One config per file**:
```
config/
  servers/
    libera.json
    oftc.json
    orpheus.json
```

**Related configs together**:
```
config/
  events/
    mentions/
      phrase-alert.json
      direct-message.json
    joins/
      user-join.json
      user-quit.json
```

### Naming

**Use descriptive IDs**:
```typescript
id: "phrase-alert"           // ✓ Clear
id: "pa"                     // ✗ Ambiguous
```

**Match file name to ID**:
```
config/events/phrase-alert.json  ✓
  { "id": "phrase-alert" }

config/events/alert.json         ✗
  { "id": "phrase-alert" }
```

### Documentation

**Add metadata descriptions**:
```typescript
{
  id: "phrase-alert",
  name: "Phrase Alert",
  metadata: {
    description: "Alerts when specific phrases are detected",
    author: "alice",
    lastModified: "2025-11-24"
  }
}
```

### Security

**Use environment variables for secrets**:
```typescript
{
  headers: {
    "Authorization": "Bearer ${API_TOKEN}"  // ✓ Secure
  }
}

// Not this:
{
  headers: {
    "Authorization": "Bearer abc123..."     // ✗ Hardcoded secret
  }
}
```

### Testing

**Validate before deploying**:
```bash
bun run config:validate
```

**Use dev configs for testing**:
```bash
bun run dev:gen
bun start -c config.dev.ts
bun run dev:cleanup
```

## Auto-Discovery and Enabled Filtering

### Auto-Discovery Behavior

When config arrays are omitted in `config.json`, the system **automatically discovers** all config files:

```json
{
  "global": {}
}
```

// Auto-discovers all files:
// - config/clients/*.json
// - config/servers/*.json
// - config/events/*.json
// - config/sinks/*.json
```

**Discovery rules**:
- Scans the respective directory (`config/clients/`, `config/servers/`, etc.)
- Loads all `.ts` and `.json` files found
- Extracts config ID from filename if not set in config
- Validates all discovered configs

**Explicit selection** (optional):
```json
{
  "global": {},
  "clients": ["textual"],
  "servers": ["libera", "oftc"],
  "events": ["phrase-alert"],
  "sinks": ["ntfy"]
}
```
// Only loads specified configs
```

### Enabled Field Behavior

Every config type has an **`enabled: boolean`** field that controls runtime activation:

```json
{
  "id": "textual",
  "enabled": true,
  "type": "textual"
}
```
```

**How `enabled` works**:

1. **Loading Phase** (happens regardless of `enabled` value):
   - Config file is discovered/loaded
   - Validation runs (schema, cross-references)
   - Config is registered in the system
   - Counted in "loaded" statistics

2. **Initialization Phase** (only if `enabled: true`):
   - Clients: Adapter initialized, log watchers created
   - Servers: Added to event processor's server map
   - Events: Added to event processor's active event list
   - Sinks: Sink initialized, notification delivery enabled

3. **Runtime** (only enabled configs):
   - Only enabled clients watch log files
  - Only enabled servers match against events
   - Only enabled events can trigger notifications
   - Only enabled sinks receive notifications

**Chain Drop Semantics**:

- If a message path involves any disabled component, the event is dropped entirely.
- Components considered: client, server, event, and every sink referenced by the event.
- Examples:
  - Client disabled → all messages from that client are dropped.
  - Server disabled (matched by hostname/identifier) → messages enriched to that server are dropped before event matching.
  - Event disabled → never matches.
  - Any sink in `event.sinkIds` disabled → the entire event is dropped (no sinks receive it).

**Example output** (with `debug: true`):
```
Loaded configuration from /path/to/config/config.ts
  - 3 clients (2 enabled)
  - 5 servers (4 enabled)
  - 10 events (8 enabled)
  - 4 sinks (3 enabled)
Skipping disabled client: TheLounge (thelounge)
EventProcessor: Filtered out 2 disabled events: old-alert, test-event
EventProcessor: 1 servers are disabled: test-server
Dropping message: matched disabled server 'libera' (Libera)
```

**Use cases for `enabled: false`**:
- Temporarily disable configs without deleting files
- Test different configurations without file management
- Keep backup/alternative configs ready
- Disable specific servers/events during maintenance

### Server ID Wildcards

Event `serverIds` supports wildcard matching:

```json
{
  "id": "global-alert",
  "serverIds": ["*"]
}
```
// Matches ALL enabled servers
```

**Matching logic**:
- `["*"]` - Matches all enabled servers
- `["libera", "oftc"]` - Matches only these specific servers
- `["*"]` ignores disabled servers (they're filtered before matching)

**Debug output** (with `debug: true`):
```
Server filter check for event 'global-alert':
  - serverIds: [*]
  - context.server.id: libera
  - matches wildcard (*): true
  - matches specific server: false
```

## Troubleshooting

### Config not found

**Error**: `No configuration file found`

**Solution**: Check file location and naming:
```bash
ls config/config.json  # Should exist (or configs auto-discovered)
```

### Validation fails

**Error**: `[ClientConfig:textual.logDirectory] Missing required field`

**Solution**: Add missing field:
```json
{
  "id": "textual",
  "logDirectory": "./logs/textual"
}
```

### Invalid reference

**Error**: `[EventConfig:alert.serverIds] references non-existent server: libera`

**Solution**: Check server ID matches file:
```bash
ls config/servers/libera.json  # Should exist
# And check ID inside matches:
# { "id": "libera" }
```

## Related Documentation

- [Type System Reference](../architecture/type-system.md)
- [Data Flow](../architecture/data-flow.md)
- [CLI Reference](../cli.md)
- [Host Metadata](./host-metadata.md)
- [Webhook Transforms](./webhook-transforms.md)
